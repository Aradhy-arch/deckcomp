import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { ApiClient } from '../api/client';
import { SharedFileItem } from '../types';

const STORAGE_KEY_DOWNLOAD_DIR = '@deck_download_saf_dir_v1';
const { StorageAccessFramework } = FileSystem;

export function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'svg':
      return 'image/svg+xml';
    case 'pdf':
      return 'application/pdf';
    case 'txt':
    case 'log':
    case 'md':
      return 'text/plain';
    case 'json':
      return 'application/json';
    case 'mp3':
      return 'audio/mpeg';
    case 'm4a':
      return 'audio/mp4';
    case 'ogg':
      return 'audio/ogg';
    case 'wav':
      return 'audio/wav';
    case 'mp4':
      return 'video/mp4';
    case 'mkv':
      return 'video/x-matroska';
    case 'webm':
      return 'video/webm';
    case 'zip':
      return 'application/zip';
    case 'tar':
    case 'gz':
    case 'zst':
      return 'application/gzip';
    case 'apk':
      return 'application/vnd.android.package-archive';
    default:
      return 'application/octet-stream';
  }
}

export function formatFriendlyDirName(safUri: string | null): string {
  if (!safUri) return 'Not selected';
  try {
    const decoded = decodeURIComponent(safUri);
    if (decoded.includes('Download') || decoded.includes('primary:Download')) {
      return 'Downloads';
    }
    if (decoded.includes('Documents') || decoded.includes('primary:Documents')) {
      return 'Documents';
    }
    if (decoded.includes('DCIM') || decoded.includes('primary:DCIM')) {
      return 'DCIM / Photos';
    }
    const parts = decoded.split('/');
    const last = parts[parts.length - 1];
    if (last && last.includes(':')) {
      return last.split(':').pop() || 'Selected Folder';
    }
    return last || 'Selected Folder';
  } catch {
    return 'Custom Folder';
  }
}

export async function getSavedDownloadDirectoryUri(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(STORAGE_KEY_DOWNLOAD_DIR);
  } catch {
    return null;
  }
}

export async function setSavedDownloadDirectoryUri(uri: string): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY_DOWNLOAD_DIR, uri);
  } catch {}
}

export async function clearSavedDownloadDirectoryUri(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY_DOWNLOAD_DIR);
  } catch {}
}

export async function promptSelectDownloadDirectory(): Promise<string | null> {
  if (Platform.OS !== 'android') return null;
  try {
    let initialUri: string | null = null;
    try {
      initialUri = StorageAccessFramework.getUriForDirectoryInRoot('Download');
    } catch {}

    const permissions = await StorageAccessFramework.requestDirectoryPermissionsAsync(initialUri);
    if (permissions.granted && permissions.directoryUri) {
      await setSavedDownloadDirectoryUri(permissions.directoryUri);
      return permissions.directoryUri;
    }
    return null;
  } catch (err) {
    console.warn('[fileReceiveService] Directory permission request failed:', err);
    return null;
  }
}

/**
 * Downloads a shared file from host, saves it into user-accessible Android public storage
 * (via StorageAccessFramework), cleans up temporary cache, and acknowledges the host outbox.
 */
export async function downloadAndSaveSharedFile(
  apiClient: ApiClient,
  item: SharedFileItem,
  onProgress?: (bytesDownloaded: number, totalBytes: number) => void
): Promise<{ success: boolean; savedPath: string }> {
  const safeBasename = item.filename.replace(/[/\\:*?"<>|]/g, '_') || 'download.bin';

  // 1. Download file to temporary cache directory with live progress
  const tempCacheUri = await apiClient.downloadSharedFileToCache(item.id, safeBasename, onProgress);

  // 2. Save to Android public storage using StorageAccessFramework
  if (Platform.OS === 'android') {
    let dirUri = await getSavedDownloadDirectoryUri();
    if (!dirUri) {
      dirUri = await promptSelectDownloadDirectory();
      if (!dirUri) {
        // User cancelled folder picker - clean up cache
        await FileSystem.deleteAsync(tempCacheUri, { idempotent: true });
        throw new Error('Please select a folder (e.g. Downloads) to save received files.');
      }
    }

    try {
      const mimeType = getMimeType(safeBasename);
      const info = await FileSystem.getInfoAsync(tempCacheUri);
      const fileSize = info.exists && info.size ? info.size : 0;

      const targetSafUri = await StorageAccessFramework.createFileAsync(
        dirUri,
        safeBasename,
        mimeType
      );

      // Stream file in 2MB chunks to avoid Hermes OutOfMemory on large files (200MB+)
      const CHUNK_SIZE = 2 * 1024 * 1024;
      let position = 0;

      while (position < fileSize) {
        const chunkLen = Math.min(CHUNK_SIZE, fileSize - position);
        const chunkBase64 = await FileSystem.readAsStringAsync(tempCacheUri, {
          encoding: FileSystem.EncodingType.Base64,
          position,
          length: chunkLen,
        });

        await StorageAccessFramework.writeAsStringAsync(targetSafUri, chunkBase64, {
          encoding: FileSystem.EncodingType.Base64,
          append: position > 0,
        });

        position += chunkLen;
      }

      // Remove temp cache file
      await FileSystem.deleteAsync(tempCacheUri, { idempotent: true });

      // Acknowledge host outbox
      await apiClient.acknowledgeShare(item.id);

      return {
        success: true,
        savedPath: formatFriendlyDirName(dirUri),
      };
    } catch (safErr) {
      // If permission was revoked, reset saved directory
      await clearSavedDownloadDirectoryUri();
      await FileSystem.deleteAsync(tempCacheUri, { idempotent: true });
      throw new Error(
        `Failed to save file to destination: ${
          safErr instanceof Error ? safErr.message : 'Storage permission error'
        }. Please re-select your folder.`
      );
    }
  } else {
    // Non-Android fallback: keep in documentDirectory
    const docDir = FileSystem.documentDirectory || FileSystem.cacheDirectory || '';
    const finalUri = `${docDir.endsWith('/') ? docDir : docDir + '/'}${safeBasename}`;
    await FileSystem.moveAsync({
      from: tempCacheUri,
      to: finalUri,
    });
    await apiClient.acknowledgeShare(item.id);
    return {
      success: true,
      savedPath: 'Documents',
    };
  }
}
