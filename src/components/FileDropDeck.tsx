import * as DocumentPicker from 'expo-document-picker';
import {
  CheckCircle2,
  Download,
  FileDown,
  FileText,
  RefreshCw,
  Trash2,
  UploadCloud,
} from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { ApiClient } from '../api/client';
import { Palette } from '../constants/theme';
import { DropResult, SharedFileItem } from '../types';

interface FileDropDeckProps {
  apiClient: ApiClient | null;
}

export const FileDropDeck: React.FC<FileDropDeckProps> = ({ apiClient }) => {
  const [selectedFile, setSelectedFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<DropResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Host-to-Mobile State
  const [pendingShares, setPendingShares] = useState<SharedFileItem[]>([]);
  const [loadingShares, setLoadingShares] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);

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

  const handlePickFile = async () => {
    setErrorMsg(null);
    setResult(null);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (!res.canceled && res.assets && res.assets.length > 0) {
        setSelectedFile(res.assets[0]);
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'File pick failed');
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !apiClient) return;
    setUploading(true);
    setErrorMsg(null);
    setResult(null);

    try {
      const dropRes = await apiClient.dropFile(
        selectedFile.uri,
        selectedFile.name,
        selectedFile.mimeType || 'application/octet-stream'
      );
      setResult(dropRes);
      setSelectedFile(null);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadFromHost = async (item: SharedFileItem) => {
    if (!apiClient) return;
    setDownloadingId(item.id);
    setErrorMsg(null);
    try {
      const savedUri = await apiClient.downloadSharedFile(item.id, item.filename);
      await apiClient.acknowledgeShare(item.id);
      setPendingShares((prev) => prev.filter((p) => p.id !== item.id));
      setDownloadSuccess(`Downloaded "${item.filename}"`);
      setTimeout(() => setDownloadSuccess(null), 4000);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setDownloadingId(null);
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
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <View style={styles.container}>
      {/* 1. Mobile -> Host Upload Card */}
      <View style={styles.card}>
        <View style={styles.dropZone}>
          <UploadCloud size={36} color={Palette.sapphire} style={styles.dropIcon} />
          <Text style={styles.dropTitle}>Phone → Host Upload</Text>
          <Text style={styles.dropSub}>Send files directly into Arch ~/Downloads</Text>

          <TouchableOpacity
            style={styles.pickBtn}
            onPress={handlePickFile}
            disabled={uploading}
            activeOpacity={0.7}
          >
            <Text style={styles.pickBtnText}>
              {selectedFile ? 'Choose Different File' : 'Select File from Device'}
            </Text>
          </TouchableOpacity>
        </View>

        {selectedFile && (
          <View style={styles.fileSelectedCard}>
            <View style={styles.fileInfo}>
              <View style={styles.fileTitleRow}>
                <FileText size={15} color={Palette.sapphire} style={{ marginRight: 6 }} />
                <Text style={styles.fileName} numberOfLines={1}>
                  {selectedFile.name}
                </Text>
              </View>
              {selectedFile.size !== undefined && (
                <Text style={styles.fileSize}>{formatSize(selectedFile.size)}</Text>
              )}
            </View>

            <TouchableOpacity
              style={styles.uploadBtn}
              onPress={handleUpload}
              disabled={uploading || !apiClient}
              activeOpacity={0.8}
            >
              {uploading ? (
                <ActivityIndicator size="small" color={Palette.crust} />
              ) : (
                <Text style={styles.uploadBtnText}>Drop to Workstation</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {result && (
          <View style={styles.successBadge}>
            <View style={styles.successTitleRow}>
              <CheckCircle2 size={15} color={Palette.green} style={{ marginRight: 6 }} />
              <Text style={styles.successTitle}>File Dropped Successfully</Text>
            </View>
            <Text style={styles.successDetail}>
              Saved: {result.saved_filename} ({formatSize(result.size_bytes)})
            </Text>
            <Text style={styles.successPath}>Location: ~/{result.path}</Text>
          </View>
        )}
      </View>

      {/* 2. Host -> Mobile Downloads Card */}
      <View style={[styles.card, { marginTop: 14 }]}>
        <View style={styles.outboxHeader}>
          <View style={styles.outboxTitleRow}>
            <FileDown size={20} color={Palette.teal} />
            <Text style={styles.outboxTitle}>Host → Phone Downloads</Text>
          </View>
          <TouchableOpacity
            onPress={fetchPendingShares}
            disabled={loadingShares}
            style={styles.refreshSharesBtn}
          >
            {loadingShares ? (
              <ActivityIndicator size="small" color={Palette.teal} />
            ) : (
              <RefreshCw size={14} color={Palette.subtext0} />
            )}
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

        {pendingShares.length === 0 ? (
          <View style={styles.emptyOutboxCard}>
            <Text style={styles.emptyOutboxTitle}>No pending files from host</Text>
            <Text style={styles.emptyOutboxSub}>
              To send files from your Arch terminal directly to your phone, run:
            </Text>
            <View style={styles.cliSnippet}>
              <Text style={styles.cliSnippetText}>$ deck-send &lt;filename&gt;</Text>
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
                    onPress={() => handleDownloadFromHost(item)}
                    disabled={isDownloading}
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
  pickBtn: {
    backgroundColor: Palette.surface0,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Palette.sapphire,
  },
  pickBtnText: {
    color: Palette.sapphire,
    fontSize: 12,
    fontWeight: '700',
  },
  fileSelectedCard: {
    marginTop: 14,
    backgroundColor: Palette.mantle,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: Palette.surface2,
  },
  fileInfo: {
    marginBottom: 10,
  },
  fileTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fileName: {
    flex: 1,
    color: Palette.text,
    fontSize: 13,
    fontWeight: '600',
  },
  fileSize: {
    color: Palette.subtext0,
    fontSize: 11,
    marginTop: 2,
    marginLeft: 21,
  },
  uploadBtn: {
    backgroundColor: Palette.sapphire,
    paddingVertical: 10,
    borderRadius: 8,
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
  refreshSharesBtn: {
    padding: 4,
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
  successDetail: {
    color: Palette.text,
    fontSize: 11,
    marginTop: 2,
  },
  successPath: {
    color: Palette.overlay0,
    fontSize: 10,
    marginTop: 2,
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
});

