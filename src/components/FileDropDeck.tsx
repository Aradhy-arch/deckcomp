import * as DocumentPicker from 'expo-document-picker';
import {
  CheckCircle2,
  Download,
  FileDown,
  FilePlus,
  Files,
  FileText,
  RefreshCw,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { ApiClient, formatErrorMessage } from '../api/client';
import { Palette } from '../constants/theme';
import {
  downloadAndSaveSharedFile,
  formatFriendlyDirName,
  getSavedDownloadDirectoryUri,
  promptSelectDownloadDirectory,
} from '../services/fileReceiveService';
import {
  notifyFileDownloadCompleted,
  notifyFileSendCompleted,
  notifyFileSendStarted,
} from '../services/notificationService';
import { DropResult, SharedFileItem } from '../types';

interface FileDropDeckProps {
  apiClient: ApiClient | null;
}

export const FileDropDeck: React.FC<FileDropDeckProps> = ({ apiClient }) => {
  // Mobile -> Host State (Multi-file)
  const [selectedFiles, setSelectedFiles] = useState<DocumentPicker.DocumentPickerAsset[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    current: number;
    total: number;
    filename: string;
    percent: number;
    loadedBytes: number;
    totalBytes: number;
  } | null>(null);
  const [batchResults, setBatchResults] = useState<DropResult[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Host -> Mobile State (Multi-file)
  const [pendingShares, setPendingShares] = useState<SharedFileItem[]>([]);
  const [loadingShares, setLoadingShares] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<{
    current: number;
    total: number;
    filename: string;
    percent: number;
    loadedBytes: number;
    totalBytes: number;
    phase?: 'downloading' | 'saving';
  } | null>(null);
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);
  const [downloadFolderUri, setDownloadFolderUri] = useState<string | null>(null);

  useEffect(() => {
    getSavedDownloadDirectoryUri().then(setDownloadFolderUri);
  }, []);

  const handlePickDownloadFolder = async () => {
    const uri = await promptSelectDownloadDirectory();
    if (uri) {
      setDownloadFolderUri(uri);
    }
  };

  const fetchPendingShares = async () => {
    if (!apiClient) return;
    setLoadingShares(true);
    try {
      const shares = await apiClient.listPendingShares();
      setPendingShares(shares);
    } catch {
      // Host may not support or is offline
    } finally {
      setLoadingShares(false);
    }
  };

  useEffect(() => {
    fetchPendingShares();
    const interval = setInterval(fetchPendingShares, 8000);
    return () => clearInterval(interval);
  }, [apiClient]);

  const handlePickFiles = async () => {
    setErrorMsg(null);
    setBatchResults([]);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: true,
      });

      if (!res.canceled && res.assets && res.assets.length > 0) {
        setSelectedFiles((prev) => {
          const existingUris = new Set(prev.map((f) => f.uri));
          const newUnique = res.assets.filter((f) => !existingUris.has(f.uri));
          return [...prev, ...newUnique];
        });
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'File pick failed');
    }
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleClearSelection = () => {
    setSelectedFiles([]);
    setBatchResults([]);
    setErrorMsg(null);
  };

  const handleUploadAll = async () => {
    if (selectedFiles.length === 0 || !apiClient) return;
    setUploading(true);
    setErrorMsg(null);
    setBatchResults([]);

    const results: DropResult[] = [];
    const errors: string[] = [];

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      notifyFileSendStarted(file.name).catch(() => {});
      setUploadProgress({
        current: i + 1,
        total: selectedFiles.length,
        filename: file.name,
        percent: 0,
        loadedBytes: 0,
        totalBytes: file.size || 0,
      });

      try {
        const dropRes = await apiClient.dropFile(
          file.uri,
          file.name,
          file.mimeType || 'application/octet-stream',
          (bytesSent, totalBytes) => {
            const expectedTotal = totalBytes > 0 ? totalBytes : file.size || 0;
            const safeSent = Math.min(bytesSent, expectedTotal > 0 ? expectedTotal : bytesSent);
            const rawPct = expectedTotal > 0 ? Math.min(100, Math.round((safeSent / expectedTotal) * 100)) : 0;
            setUploadProgress((prev) => {
              const bestPct = prev && prev.filename === file.name ? Math.max(prev.percent, rawPct) : rawPct;
              const bestLoaded = prev && prev.filename === file.name ? Math.max(prev.loadedBytes, safeSent) : safeSent;
              return {
                current: i + 1,
                total: selectedFiles.length,
                filename: file.name,
                percent: Math.min(100, bestPct),
                loadedBytes: Math.min(expectedTotal > 0 ? expectedTotal : bestLoaded, bestLoaded),
                totalBytes: expectedTotal,
              };
            });
          }
        );
        results.push(dropRes);
        notifyFileSendCompleted(dropRes.saved_filename || file.name).catch(() => {});
      } catch (err: unknown) {
        errors.push(`${file.name}: ${formatErrorMessage(err, 'An error occurred')}`);
      }
    }

    setUploading(false);
    setUploadProgress(null);

    if (results.length > 0) {
      setBatchResults(results);
      const uploadedFilenames = new Set(results.map((r) => r.original_filename));
      setSelectedFiles((prev) => prev.filter((f) => !uploadedFilenames.has(f.name)));
    }

    if (errors.length > 0) {
      setErrorMsg(errors.join('\n'));
    }
  };

  const handleDownloadSingle = async (item: SharedFileItem) => {
    if (!apiClient) {
      setErrorMsg('Host is disconnected');
      return;
    }
    setDownloadingId(item.id);
    setErrorMsg(null);
    setDownloadProgress({
      current: 1,
      total: 1,
      filename: item.filename,
      percent: 0,
      loadedBytes: 0,
      totalBytes: item.size_bytes || 0,
    });
    try {
      const res = await downloadAndSaveSharedFile(apiClient, item, (bytes, total, phase) => {
        const expectedTotal = total > 0 ? total : item.size_bytes || 0;
        const safeBytes = Math.min(bytes, expectedTotal > 0 ? expectedTotal : bytes);
        const fraction = expectedTotal > 0 ? safeBytes / expectedTotal : 0;

        // Single unified 0-100% progress scale:
        // Phase 1 (Receiving via Wi-Fi): 0% -> 85%
        // Phase 2 (Writing to phone storage): 85% -> 100%
        let pct: number;
        let displayedLoaded: number;
        if (phase === 'saving') {
          pct = Math.min(100, Math.round(85 + fraction * 15));
          displayedLoaded = expectedTotal;
        } else {
          pct = Math.min(85, Math.round(fraction * 85));
          displayedLoaded = safeBytes;
        }

        setDownloadProgress((prev) => {
          const bestPct = prev && prev.filename === item.filename ? Math.max(prev.percent, pct) : pct;
          return {
            current: 1,
            total: 1,
            filename: item.filename,
            percent: Math.min(100, bestPct),
            loadedBytes: displayedLoaded,
            totalBytes: expectedTotal,
            phase,
          };
        });
      });
      notifyFileDownloadCompleted(item.filename, res.savedPath).catch(() => {});
      setPendingShares((prev) => prev.filter((p) => p.id !== item.id));
      setDownloadSuccess(`Saved "${item.filename}" to ${res.savedPath}`);
      setTimeout(() => setDownloadSuccess(null), 4500);
      const uri = await getSavedDownloadDirectoryUri();
      setDownloadFolderUri(uri);
    } catch (err: unknown) {
      setErrorMsg(formatErrorMessage(err, 'An error occurred'));
    } finally {
      setDownloadingId(null);
      setDownloadProgress(null);
    }
  };

  const handleDownloadAllFromHost = async () => {
    if (pendingShares.length === 0 || !apiClient) {
      if (!apiClient) setErrorMsg('Host is disconnected');
      return;
    }
    setDownloadingAll(true);
    setErrorMsg(null);
    const total = pendingShares.length;
    let downloadedCount = 0;
    let lastSavedPath = 'Downloads';
    const errors: string[] = [];
    const remaining = [...pendingShares];

    for (let i = 0; i < total; i++) {
      const item = remaining[i];
      setDownloadingId(item.id);
      setDownloadProgress({
        current: i + 1,
        total,
        filename: item.filename,
        percent: 0,
        loadedBytes: 0,
        totalBytes: item.size_bytes || 0,
      });

      try {
        const res = await downloadAndSaveSharedFile(apiClient, item, (bytes, itemTotal, phase) => {
          const expectedTotal = itemTotal > 0 ? itemTotal : item.size_bytes || 0;
          const safeBytes = Math.min(bytes, expectedTotal > 0 ? expectedTotal : bytes);
          const fraction = expectedTotal > 0 ? safeBytes / expectedTotal : 0;

          let pct: number;
          let displayedLoaded: number;
          if (phase === 'saving') {
            pct = Math.min(100, Math.round(85 + fraction * 15));
            displayedLoaded = expectedTotal;
          } else {
            pct = Math.min(85, Math.round(fraction * 85));
            displayedLoaded = safeBytes;
          }

          setDownloadProgress((prev) => {
            const bestPct = prev && prev.filename === item.filename ? Math.max(prev.percent, pct) : pct;
            return {
              current: i + 1,
              total,
              filename: item.filename,
              percent: Math.min(100, bestPct),
              loadedBytes: displayedLoaded,
              totalBytes: expectedTotal,
              phase,
            };
          });
        });
        downloadedCount++;
        lastSavedPath = res.savedPath;
        notifyFileDownloadCompleted(item.filename, res.savedPath).catch(() => {});
        setPendingShares((prev) => prev.filter((p) => p.id !== item.id));
      } catch (err: unknown) {
        errors.push(`${item.filename}: ${formatErrorMessage(err, 'An error occurred')}`);
      }
    }

    setDownloadingId(null);
    setDownloadingAll(false);
    setDownloadProgress(null);

    if (downloadedCount > 0) {
      setDownloadSuccess(
        `Saved ${downloadedCount} file${downloadedCount > 1 ? 's' : ''} to ${lastSavedPath}`
      );
      setTimeout(() => setDownloadSuccess(null), 4500);
      const uri = await getSavedDownloadDirectoryUri();
      setDownloadFolderUri(uri);
    }

    if (errors.length > 0) {
      setErrorMsg(errors.join('\n'));
    }
  };

  const handleDismissShare = async (id: string) => {
    if (!apiClient) return;
    try {
      await apiClient.acknowledgeShare(id);
      setPendingShares((prev) => prev.filter((p) => p.id !== id));
    } catch {}
  };

  const formatSize = (bytes: number) => {
    if (!bytes || bytes <= 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const totalSelectedBytes = selectedFiles.reduce((acc, f) => acc + (f.size || 0), 0);

  return (
    <View style={styles.container}>
      {/* 1. Mobile -> Host Multi-File Upload Card */}
      <View style={styles.card}>
        <View style={styles.dropZone}>
          <UploadCloud size={36} color={Palette.sapphire} style={styles.dropIcon} />
          <Text style={styles.dropTitle}>Phone → Host Upload</Text>
          <Text style={styles.dropSub}>Send multiple files directly into Linux ~/Downloads</Text>

          <View style={styles.pickActionsRow}>
            <TouchableOpacity
              style={styles.pickBtn}
              onPress={handlePickFiles}
              disabled={uploading}
              activeOpacity={0.7}
            >
              <Files size={15} color={Palette.sapphire} style={{ marginRight: 6 }} />
              <Text style={styles.pickBtnText}>
                {selectedFiles.length > 0 ? 'Add More Files' : 'Select Files (Multi-Select)'}
              </Text>
            </TouchableOpacity>

            {selectedFiles.length > 0 && !uploading && (
              <TouchableOpacity
                style={styles.clearBtn}
                onPress={handleClearSelection}
                activeOpacity={0.7}
              >
                <Trash2 size={14} color={Palette.overlay0} />
                <Text style={styles.clearBtnText}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Selected Files Queue */}
        {selectedFiles.length > 0 && (
          <View style={styles.fileSelectedCard}>
            <View style={styles.queueHeader}>
              <View style={styles.queueHeaderLeft}>
                <Files size={14} color={Palette.sapphire} style={{ marginRight: 6 }} />
                <Text style={styles.queueCountText}>
                  {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} queued
                </Text>
              </View>
              <Text style={styles.queueTotalSize}>{formatSize(totalSelectedBytes)}</Text>
            </View>

            <ScrollView
              style={styles.filesListScroll}
              nestedScrollEnabled
              showsVerticalScrollIndicator
            >
              {selectedFiles.map((file, idx) => (
                <View key={`${file.uri}_${idx}`} style={styles.fileItemRow}>
                  <FileText size={15} color={Palette.sapphire} style={{ marginRight: 8 }} />
                  <View style={styles.fileItemInfo}>
                    <Text style={styles.fileItemName} numberOfLines={1}>
                      {file.name}
                    </Text>
                    {file.size !== undefined && (
                      <Text style={styles.fileItemSize}>{formatSize(file.size)}</Text>
                    )}
                  </View>
                  {!uploading && (
                    <TouchableOpacity
                      onPress={() => handleRemoveFile(idx)}
                      style={styles.removeFileBtn}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <X size={15} color={Palette.overlay0} />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </ScrollView>

            {/* Live Visual Upload Progress Bar */}
            {uploading && uploadProgress && (
              <View style={styles.progressContainer}>
                <View style={styles.progressHeaderRow}>
                  <Text style={styles.progressFileName} numberOfLines={1} ellipsizeMode="middle">
                    {uploadProgress.filename}
                  </Text>
                  <Text style={styles.progressPercentText}>
                    {uploadProgress.percent}%
                  </Text>
                </View>

                {/* Progress Bar Track & Fill */}
                <View style={styles.progressBarTrack}>
                  <View
                    style={[
                      styles.progressBarFill,
                      { width: `${Math.max(1, Math.min(100, uploadProgress.percent))}%` },
                    ]}
                  />
                </View>

                <View style={styles.progressDetailsRow}>
                  <Text style={styles.progressDetailText}>
                    Dropping {uploadProgress.current} of {uploadProgress.total}
                  </Text>
                  {uploadProgress.totalBytes > 0 && (
                    <Text style={styles.progressDetailText}>
                      {formatSize(uploadProgress.loadedBytes)} / {formatSize(uploadProgress.totalBytes)}
                    </Text>
                  )}
                </View>
              </View>
            )}

            {/* Upload Button with Progress */}
            <TouchableOpacity
              style={[
                styles.uploadBtn,
                (uploading || !apiClient) && styles.uploadBtnDisabled,
              ]}
              onPress={handleUploadAll}
              disabled={uploading || !apiClient}
              activeOpacity={0.8}
            >
              {uploading ? (
                <View style={styles.uploadingContent}>
                  <ActivityIndicator size="small" color={Palette.crust} style={{ marginRight: 8 }} />
                  <Text style={styles.uploadBtnText}>
                    Dropping {uploadProgress?.current} of {uploadProgress?.total}
                    {uploadProgress ? ` (${uploadProgress.filename.slice(0, 16)}...)` : '...'}
                  </Text>
                </View>
              ) : (
                <View style={styles.uploadBtnContent}>
                  <UploadCloud size={16} color={Palette.crust} style={{ marginRight: 6 }} />
                  <Text style={styles.uploadBtnText}>
                    Drop {selectedFiles.length} File{selectedFiles.length > 1 ? 's' : ''} to Workstation
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Batch Success Summary */}
        {batchResults.length > 0 && (
          <View style={styles.successBadge}>
            <View style={styles.successTitleRow}>
              <CheckCircle2 size={16} color={Palette.green} style={{ marginRight: 6 }} />
              <Text style={styles.successTitle}>
                {batchResults.length} File{batchResults.length > 1 ? 's' : ''} Dropped Successfully
              </Text>
            </View>
            <Text style={styles.successPath}>Saved to Linux ~/Downloads/</Text>
            <View style={styles.resultFilesList}>
              {batchResults.map((r, i) => (
                <Text key={i} style={styles.resultFileItem} numberOfLines={1}>
                  • {r.saved_filename} ({formatSize(r.size_bytes)})
                </Text>
              ))}
            </View>
          </View>
        )}
      </View>

      {/* 2. Host -> Mobile Downloads Card (Multi-file) */}
      <View style={[styles.card, { marginTop: 14 }]}>
        <View style={styles.outboxHeader}>
          <View style={styles.outboxTitleRow}>
            <FileDown size={20} color={Palette.teal} />
            <Text style={styles.outboxTitle}>Host → Phone Downloads</Text>
          </View>

          <View style={styles.outboxHeaderActions}>
            {pendingShares.length > 1 && (
              <TouchableOpacity
                style={styles.receiveAllBtn}
                onPress={handleDownloadAllFromHost}
                disabled={downloadingAll || loadingShares}
                activeOpacity={0.7}
              >
                {downloadingAll ? (
                  <ActivityIndicator size="small" color={Palette.crust} />
                ) : (
                  <>
                    <Download size={13} color={Palette.crust} style={{ marginRight: 4 }} />
                    <Text style={styles.receiveAllBtnText}>
                      Receive All ({pendingShares.length})
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            <TouchableOpacity
              onPress={fetchPendingShares}
              disabled={loadingShares || downloadingAll}
              style={styles.refreshSharesBtn}
            >
              {loadingShares ? (
                <ActivityIndicator size="small" color={Palette.teal} />
              ) : (
                <RefreshCw size={14} color={Palette.subtext0} />
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Destination Folder Bar */}
        <View style={styles.folderRow}>
          <Text style={styles.folderRowText} numberOfLines={1}>
            Save to: <Text style={styles.folderHighlight}>{formatFriendlyDirName(downloadFolderUri)}</Text>
          </Text>
          <TouchableOpacity
            style={styles.folderChangeBtn}
            onPress={handlePickDownloadFolder}
            activeOpacity={0.7}
          >
            <Text style={styles.folderChangeBtnText}>
              {downloadFolderUri ? 'Change' : 'Set Folder'}
            </Text>
          </TouchableOpacity>
        </View>

        {downloadSuccess && (
          <View style={styles.successBadge}>
            <View style={styles.successTitleRow}>
              <CheckCircle2 size={15} color={Palette.green} style={{ marginRight: 6 }} />
              <Text style={styles.successTitle}>{downloadSuccess}</Text>
            </View>
          </View>
        )}

        {/* Live Visual Download Progress Bar */}
        {(downloadingId || downloadingAll) && downloadProgress && (
          <View style={styles.downloadProgressContainer}>
            <View style={styles.progressHeaderRow}>
              <Text style={styles.progressFileName} numberOfLines={1} ellipsizeMode="middle">
                {downloadProgress.filename}
              </Text>
              <Text style={styles.downloadProgressPercentText}>
                {downloadProgress.percent}%
              </Text>
            </View>

            {/* Progress Bar Track & Fill */}
            <View style={styles.progressBarTrack}>
              <View
                style={[
                  styles.downloadProgressBarFill,
                  { width: `${Math.max(1, Math.min(100, downloadProgress.percent))}%` },
                ]}
              />
            </View>

            <View style={styles.progressDetailsRow}>
              <Text style={styles.progressDetailText}>
                {downloadProgress.phase === 'saving'
                  ? `Writing to storage (${downloadProgress.current} of ${downloadProgress.total})`
                  : `Receiving from host (${downloadProgress.current} of ${downloadProgress.total})`}
              </Text>
              {downloadProgress.totalBytes > 0 && (
                <Text style={styles.progressDetailText}>
                  {formatSize(downloadProgress.loadedBytes)} / {formatSize(downloadProgress.totalBytes)}
                </Text>
              )}
            </View>
          </View>
        )}

        {pendingShares.length === 0 ? (
          <View style={styles.emptyOutboxCard}>
            <Text style={styles.emptyOutboxTitle}>No pending files from host</Text>
            <Text style={styles.emptyOutboxSub}>
              To send files from your Linux terminal directly to your phone, run:
            </Text>
            <View style={styles.cliSnippet}>
              <Text style={styles.cliSnippetText}>$ deck-send &lt;filename&gt; [more-files...]</Text>
            </View>
          </View>
        ) : (
          pendingShares.map((item) => {
            const isDownloading = downloadingId === item.id;
            return (
              <View key={item.id} style={styles.shareItemCard}>
                <View style={styles.shareItemLeft}>
                  <View style={styles.shareIconCircle}>
                    <FileDown size={18} color={Palette.teal} />
                  </View>
                  <View style={styles.shareText}>
                    <Text style={styles.shareFilename} numberOfLines={1}>
                      {item.filename}
                    </Text>
                    <Text style={styles.shareSize}>{formatSize(item.size_bytes)}</Text>
                  </View>
                </View>

                <View style={styles.shareActions}>
                  <TouchableOpacity
                    style={styles.downloadBtn}
                    onPress={() => handleDownloadSingle(item)}
                    disabled={isDownloading || downloadingAll}
                    activeOpacity={0.7}
                  >
                    {isDownloading ? (
                      <ActivityIndicator size="small" color={Palette.crust} />
                    ) : (
                      <View style={styles.downloadBtnContent}>
                        <Download size={13} color={Palette.crust} />
                        <Text style={styles.downloadBtnText}>Receive</Text>
                      </View>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.dismissBtn}
                    onPress={() => handleDismissShare(item.id)}
                    disabled={downloadingAll}
                    activeOpacity={0.7}
                  >
                    <Trash2 size={14} color={Palette.overlay0} />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </View>

      {errorMsg && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{errorMsg}</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginTop: 14,
    paddingBottom: 20,
  },
  card: {
    backgroundColor: Palette.surface0,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Palette.surface1,
  },
  dropZone: {
    alignItems: 'center',
    paddingVertical: 18,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Palette.surface2,
    borderRadius: 12,
    backgroundColor: Palette.surface1,
  },
  dropIcon: {
    marginBottom: 6,
  },
  dropTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Palette.text,
  },
  dropSub: {
    fontSize: 11,
    color: Palette.subtext0,
    marginTop: 2,
    marginBottom: 14,
  },
  pickActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pickBtn: {
    backgroundColor: Palette.surface0,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Palette.sapphire,
    flexDirection: 'row',
    alignItems: 'center',
  },
  pickBtnText: {
    color: Palette.sapphire,
    fontSize: 12,
    fontWeight: '700',
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: Palette.surface0,
    borderWidth: 1,
    borderColor: Palette.surface2,
  },
  clearBtnText: {
    color: Palette.overlay0,
    fontSize: 12,
    fontWeight: '600',
  },
  fileSelectedCard: {
    marginTop: 14,
    backgroundColor: Palette.mantle,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: Palette.surface2,
  },
  queueHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Palette.surface1,
    marginBottom: 8,
  },
  queueHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  queueCountText: {
    color: Palette.sapphire,
    fontSize: 12,
    fontWeight: '700',
  },
  queueTotalSize: {
    color: Palette.subtext0,
    fontSize: 11,
    fontWeight: '600',
  },
  filesListScroll: {
    maxHeight: 180,
    marginBottom: 10,
  },
  fileItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Palette.surface0,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    marginBottom: 6,
  },
  fileItemInfo: {
    flex: 1,
    marginRight: 8,
  },
  fileItemName: {
    color: Palette.text,
    fontSize: 12,
    fontWeight: '600',
  },
  fileItemSize: {
    color: Palette.overlay0,
    fontSize: 10,
    marginTop: 1,
  },
  removeFileBtn: {
    padding: 4,
  },
  uploadBtn: {
    backgroundColor: Palette.sapphire,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  uploadBtnDisabled: {
    opacity: 0.7,
  },
  uploadBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  uploadingContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  uploadBtnText: {
    color: Palette.crust,
    fontSize: 13,
    fontWeight: '700',
  },
  outboxHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  outboxTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  outboxTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Palette.teal,
  },
  outboxHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  receiveAllBtn: {
    backgroundColor: Palette.teal,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 6,
  },
  receiveAllBtnText: {
    color: Palette.crust,
    fontSize: 11,
    fontWeight: '700',
  },
  refreshSharesBtn: {
    padding: 4,
  },
  downloadingAllBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Palette.mantle,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Palette.teal,
    marginBottom: 10,
  },
  downloadingAllText: {
    color: Palette.teal,
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
  },
  emptyOutboxCard: {
    backgroundColor: Palette.mantle,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: Palette.surface1,
    alignItems: 'center',
  },
  emptyOutboxTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: Palette.subtext0,
  },
  emptyOutboxSub: {
    fontSize: 11,
    color: Palette.overlay0,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 8,
  },
  cliSnippet: {
    backgroundColor: Palette.crust,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Palette.surface1,
  },
  cliSnippetText: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: Palette.teal,
  },
  shareItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Palette.mantle,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Palette.surface1,
    marginBottom: 8,
  },
  shareItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 10,
  },
  shareIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Palette.surface1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareText: {
    flex: 1,
  },
  shareFilename: {
    fontSize: 13,
    fontWeight: '600',
    color: Palette.text,
  },
  shareSize: {
    fontSize: 10,
    color: Palette.overlay0,
    marginTop: 2,
  },
  shareActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  downloadBtn: {
    backgroundColor: Palette.teal,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  downloadBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  downloadBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: Palette.crust,
  },
  dismissBtn: {
    padding: 6,
  },
  successBadge: {
    marginTop: 10,
    padding: 10,
    backgroundColor: Palette.crust,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Palette.green,
  },
  successTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  successTitle: {
    color: Palette.green,
    fontWeight: '700',
    fontSize: 12,
  },
  successPath: {
    color: Palette.overlay0,
    fontSize: 10,
    marginTop: 2,
  },
  resultFilesList: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: Palette.surface0,
  },
  resultFileItem: {
    color: Palette.text,
    fontSize: 11,
    lineHeight: 16,
  },
  errorBox: {
    marginTop: 12,
    padding: 10,
    backgroundColor: Palette.crust,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Palette.red,
  },
  errorText: {
    color: Palette.red,
    fontSize: 12,
    textAlign: 'center',
  },
  folderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Palette.surface0,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginTop: 8,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: Palette.surface1,
  },
  folderRowText: {
    fontSize: 11,
    color: Palette.subtext0,
    flex: 1,
  },
  folderHighlight: {
    color: Palette.mauve,
    fontWeight: '700',
  },
  folderChangeBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: Palette.surface1,
    borderRadius: 6,
    marginLeft: 8,
  },
  folderChangeBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: Palette.text,
  },
  progressContainer: {
    backgroundColor: Palette.surface1,
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(205, 214, 244, 0.1)',
  },
  downloadProgressContainer: {
    backgroundColor: Palette.surface1,
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(148, 226, 213, 0.25)',
  },
  progressHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressFileName: {
    fontSize: 12,
    fontWeight: '700',
    color: Palette.text,
    flex: 1,
    marginRight: 8,
  },
  progressPercentText: {
    fontSize: 12,
    fontWeight: '800',
    color: Palette.sapphire,
  },
  downloadProgressPercentText: {
    fontSize: 12,
    fontWeight: '800',
    color: Palette.teal,
  },
  progressBarTrack: {
    height: 8,
    backgroundColor: Palette.surface0,
    borderRadius: 4,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 6,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: Palette.sapphire,
    borderRadius: 4,
  },
  downloadProgressBarFill: {
    height: '100%',
    backgroundColor: Palette.teal,
    borderRadius: 4,
  },
  progressDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressDetailText: {
    fontSize: 10,
    color: Palette.overlay0,
  },
});
