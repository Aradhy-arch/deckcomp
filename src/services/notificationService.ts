import * as Clipboard from 'expo-clipboard';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { isRunningInExpoGo } from 'expo';
import { Platform, Vibration } from 'react-native';
import { ApiClient } from '../api/client';
import { getActiveDeviceId, loadDevices } from '../storage/deviceStorage';

const SILENT_CHANNEL_ID = 'deckcomp-silent-service-v2';
const INCOMING_FILES_CHANNEL_ID = 'deckcomp-incoming-files-v1';
const NOTIFICATION_ID = 'deck_persistent_service_notification';
const CATEGORY_ID = 'clipboard_quick_actions';

// Check if notifications are supported in current environment (disabled in Expo Go or non-Android)
export function isNotificationsSupported(): boolean {
  if (Platform.OS !== 'android') return false;
  try {
    if (isRunningInExpoGo()) return false;
  } catch {}
  try {
    if (
      Constants.appOwnership === 'expo' ||
      Constants.executionEnvironment === ExecutionEnvironment.StoreClient
    ) {
      return false;
    }
  } catch {}
  return true;
}

let isInitialized = false;
let currentHostname = 'Linux PC';
let feedbackResetTimer: ReturnType<typeof setTimeout> | null = null;
let lastProcessedResponseKey = '';

// Lazy-load expo-notifications only in native builds with safety guards
function getNotificationsModule(): typeof import('expo-notifications') | null {
  if (!isNotificationsSupported()) return null;
  try {
    // Polyfill ExpoTopicSubscriptionModule if missing in current runtime
    const g = globalThis as any;
    if (g.expo?.modules && !g.expo.modules.ExpoTopicSubscriptionModule) {
      g.expo.modules.ExpoTopicSubscriptionModule = {
        subscribeToTopicAsync: async () => {},
        unsubscribeFromTopicAsync: async () => {},
        addListener: () => {},
        removeListeners: () => {},
      };
    }
    return require('expo-notifications');
  } catch (err) {
    console.warn('[NotificationService] Native notifications module not available:', err);
    return null;
  }
}

/**
 * Executes a quick clipboard push or pull action with error handling and silent notification updates.
 * Runs completely in the background without opening the app.
 */
export async function executeClipboardAction(
  actionId: string,
  client: ApiClient | null,
  options?: {
    onFeedback?: (msg: string, isError?: boolean) => void;
  }
): Promise<{ success: boolean; message: string }> {
  if (actionId !== 'action_push_clip' && actionId !== 'action_pull_clip') {
    return { success: false, message: 'Unknown action' };
  }

  let activeClient = client;
  if (!activeClient) {
    try {
      const devList = await loadDevices();
      const activeId = await getActiveDeviceId();
      const activeDev = devList.find((d) => d.id === activeId) || devList[0];
      if (activeDev && activeDev.hostIp) {
        activeClient = new ApiClient({
          hostIp: activeDev.hostIp,
          hostPort: activeDev.hostPort,
          authToken: activeDev.authToken,
        });
      }
    } catch {}
  }

  if (!activeClient) {
    const msg = '⚠ No workstation configured';
    await updateNotificationFeedback(msg);
    options?.onFeedback?.(msg, true);
    return { success: false, message: msg };
  }

  try {
    if (actionId === 'action_push_clip') {
      const text = await Clipboard.getStringAsync();
      if (!text || !text.trim()) {
        const msg = '⚠ Phone clipboard is empty';
        await updateNotificationFeedback(msg);
        options?.onFeedback?.(msg, true);
        return { success: false, message: msg };
      }
      await activeClient.pushClipboard(text);
      try {
        Vibration.vibrate(40);
      } catch {}
      const preview = text.trim().slice(0, 24);
      const suffix = text.trim().length > 24 ? '...' : '';
      const msg = `✓ Pushed to PC: "${preview}${suffix}"`;
      await updateNotificationFeedback(msg);
      options?.onFeedback?.(msg, false);
      return { success: true, message: msg };
    } else if (actionId === 'action_pull_clip') {
      const remoteClip = await activeClient.getClipboard();
      if (!remoteClip || !remoteClip.content || !remoteClip.content.trim()) {
        const msg = '⚠ PC clipboard is empty';
        await updateNotificationFeedback(msg);
        options?.onFeedback?.(msg, true);
        return { success: false, message: msg };
      }
      await Clipboard.setStringAsync(remoteClip.content);
      try {
        Vibration.vibrate(40);
      } catch {}
      const preview = remoteClip.content.trim().slice(0, 24);
      const suffix = remoteClip.content.trim().length > 24 ? '...' : '';
      const msg = `✓ Pulled from PC: "${preview}${suffix}"`;
      await updateNotificationFeedback(msg);
      options?.onFeedback?.(msg, false);
      return { success: true, message: msg };
    }
  } catch (err: unknown) {
    const errText = err instanceof Error ? err.message : 'Sync failed';
    const msg = `⚠ Clipboard sync failed: ${errText}`;
    await updateNotificationFeedback(msg);
    options?.onFeedback?.(msg, true);
    return { success: false, message: msg };
  }

  return { success: false, message: 'No action taken' };
}

export async function initNotificationService(
  apiClientProvider: () => ApiClient | null,
  onActionTriggered?: (actionId: string, result: { success: boolean; message: string }) => void,
  onIncomingFileTapped?: (fileId: string) => void
) {
  if (!isNotificationsSupported()) return;
  if (isInitialized) return;
  isInitialized = true;

  const Notifications = getNotificationsModule();
  if (!Notifications) return;

  try {
    // Configure notification handler safely: alerting for incoming files, silent for status
    Notifications.setNotificationHandler({
      handleNotification: async (notif) => {
        const isIncomingFile = notif?.request?.content?.data?.type === 'incoming_file';
        return {
          shouldShowAlert: isIncomingFile,
          shouldShowBanner: isIncomingFile,
          shouldShowList: true,
          shouldPlaySound: isIncomingFile,
          shouldSetBadge: false,
          priority: isIncomingFile
            ? Notifications.AndroidNotificationPriority.HIGH
            : Notifications.AndroidNotificationPriority.MIN,
        };
      },
    });

    // 1. Request notification permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return;

    // Clean up legacy alerting channel if present
    try {
      await Notifications.deleteNotificationChannelAsync('deck-companion-service');
      await Notifications.deleteNotificationChannelAsync('expo_default_notification_channel');
    } catch {}

    // 2. Set up truly silent MIN importance notification channel on Android
    await Notifications.setNotificationChannelAsync(SILENT_CHANNEL_ID, {
      name: 'DeckComp Silent Status',
      description: 'Silent persistent status and background clipboard controls',
      importance: Notifications.AndroidImportance.MIN,
      enableVibrate: false,
      vibrationPattern: null,
      sound: undefined,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      showBadge: false,
    });

    // 2b. Set up HIGH importance alerting channel for incoming files from PC
    await Notifications.setNotificationChannelAsync(INCOMING_FILES_CHANNEL_ID, {
      name: 'DeckComp File Transfers',
      description: 'Alerts when your computer sends files to your phone',
      importance: Notifications.AndroidImportance.HIGH,
      enableVibrate: true,
      vibrationPattern: [0, 250, 250, 250],
      sound: 'default',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      showBadge: true,
    });

    // 3. Define Quick Action Buttons with opensAppToForeground: false
    await Notifications.setNotificationCategoryAsync(CATEGORY_ID, [
      {
        identifier: 'action_pull_clip',
        buttonTitle: 'Pull Clip',
        options: {
          opensAppToForeground: false,
        },
      },
      {
        identifier: 'action_push_clip',
        buttonTitle: 'Push Clip',
        options: {
          opensAppToForeground: false,
        },
      },
    ]);

    // 4. Handle button taps & notification taps
    Notifications.addNotificationResponseReceivedListener(async (response) => {
      const notifData = response.notification?.request?.content?.data;
      if (notifData && notifData.type === 'incoming_file') {
        onIncomingFileTapped?.(String(notifData.fileId || ''));
        return;
      }

      const actionId = response.actionIdentifier;
      if (actionId !== 'action_push_clip' && actionId !== 'action_pull_clip') {
        return;
      }

      const key = `${response.notification?.request?.identifier || ''}_${actionId}_${response.notification?.date || ''}`;
      if (lastProcessedResponseKey === key) {
        return;
      }
      lastProcessedResponseKey = key;

      const result = await executeClipboardAction(actionId, apiClientProvider(), {
        onFeedback: (msg, isError) => {
          onActionTriggered?.(actionId, { success: !isError, message: msg });
        },
      });
      onActionTriggered?.(actionId, { success: result.success, message: result.message });
    });
  } catch (err) {
    console.warn('[NotificationService] Initialization skipped:', err);
  }
}

export async function updateNotificationFeedback(feedbackMsg: string) {
  const Notifications = getNotificationsModule();
  if (!Notifications) return;

  if (feedbackResetTimer) {
    clearTimeout(feedbackResetTimer);
  }

  try {
    await Notifications.scheduleNotificationAsync({
      identifier: NOTIFICATION_ID,
      content: {
        title: 'DeckComp',
        body: feedbackMsg,
        categoryIdentifier: CATEGORY_ID,
        sticky: true,
        autoDismiss: false,
        color: '#cba6f7',
        priority: Notifications.AndroidNotificationPriority.MIN,
      },
      trigger: {
        channelId: SILENT_CHANNEL_ID,
      },
    });

    feedbackResetTimer = setTimeout(() => {
      showPersistentNotification(currentHostname);
    }, 3500);
  } catch {}
}

export async function showPersistentNotification(hostname: string = 'Linux PC') {
  if (!isNotificationsSupported()) return;
  const Notifications = getNotificationsModule();
  if (!Notifications) return;

  currentHostname = hostname;

  try {
    await Notifications.scheduleNotificationAsync({
      identifier: NOTIFICATION_ID,
      content: {
        title: 'DeckComp Active',
        body: `Connected to ${hostname} • Tap buttons for quick clipboard`,
        categoryIdentifier: CATEGORY_ID,
        sticky: true,
        autoDismiss: false,
        color: '#cba6f7', // Catppuccin mauve
        priority: Notifications.AndroidNotificationPriority.MIN,
      },
      trigger: {
        channelId: SILENT_CHANNEL_ID, // Explicitly route to silent channel
      },
    });
  } catch {
    // Silent catch
  }
}

export async function dismissPersistentNotification() {
  if (!isNotificationsSupported()) return;
  const Notifications = getNotificationsModule();
  if (!Notifications) return;

  if (feedbackResetTimer) {
    clearTimeout(feedbackResetTimer);
  }

  try {
    await Notifications.dismissNotificationAsync(NOTIFICATION_ID);
  } catch {}
}

export async function notifyIncomingFileFromHost(
  share: { id: string; filename: string; size_bytes: number },
  hostname?: string
) {
  if (!isNotificationsSupported()) return;
  const Notifications = getNotificationsModule();
  if (!Notifications) return;

  const sizeKb = Math.max(1, Math.round(share.size_bytes / 1024));
  const sizeStr = sizeKb < 1024 ? `${sizeKb} KB` : `${(sizeKb / 1024).toFixed(1)} MB`;

  try {
    await Notifications.scheduleNotificationAsync({
      identifier: `incoming_file_${share.id}`,
      content: {
        title: 'DeckComp • File from Workstation',
        body: `${hostname || 'PC'} is sending "${share.filename}" (${sizeStr}). Tap to receive.`,
        data: {
          type: 'incoming_file',
          fileId: share.id,
          filename: share.filename,
        },
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: null,
    });
  } catch (err) {
    console.warn('[NotificationService] Failed to schedule incoming file alert:', err);
  }
}

export async function notifyFileSendStarted(filename: string, hostname?: string) {
  if (!isNotificationsSupported()) return;
  const Notifications = getNotificationsModule();
  if (!Notifications) return;

  try {
    await Notifications.scheduleNotificationAsync({
      identifier: `send_start_${Date.now()}`,
      content: {
        title: 'DeckComp • Sending File',
        body: `Sending "${filename}" to ${hostname || 'Workstation'}...`,
        sound: false,
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: null,
    });
  } catch {}
}

export async function notifyFileSendCompleted(filename: string, hostname?: string) {
  if (!isNotificationsSupported()) return;
  const Notifications = getNotificationsModule();
  if (!Notifications) return;

  try {
    await Notifications.scheduleNotificationAsync({
      identifier: `send_done_${Date.now()}`,
      content: {
        title: 'DeckComp • File Sent',
        body: `Successfully sent "${filename}" to ${hostname || 'Workstation'}.`,
        sound: true,
        priority: Notifications.AndroidNotificationPriority.DEFAULT,
      },
      trigger: null,
    });
  } catch {}
}

export async function notifyFileDownloadCompleted(filename: string, folder?: string) {
  if (!isNotificationsSupported()) return;
  const Notifications = getNotificationsModule();
  if (!Notifications) return;

  try {
    await Notifications.scheduleNotificationAsync({
      identifier: `recv_done_${Date.now()}`,
      content: {
        title: 'DeckComp • File Received',
        body: `Saved "${filename}" to ${folder || 'Downloads'}.`,
        sound: true,
        priority: Notifications.AndroidNotificationPriority.DEFAULT,
      },
      trigger: null,
    });
  } catch {}
}

const TRANSFER_PROGRESS_NOTIF_ID = 'deck_active_transfer_progress';
let lastProgressNotifTime = 0;

function formatNotificationBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatNotificationSpeed(bytesPerSec: number): string {
  if (!bytesPerSec || bytesPerSec <= 0) return '';
  if (bytesPerSec < 1024) return `${Math.round(bytesPerSec)} B/s`;
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
}

function formatNotificationEta(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0 || !isFinite(seconds)) return '';
  if (seconds < 60) return `~${Math.round(seconds)}s left`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `~${mins}m ${secs}s left`;
}

export interface TransferProgressNotifParams {
  type: 'upload' | 'download';
  filename: string;
  current: number;
  total: number;
  percent: number;
  loadedBytes: number;
  totalBytes: number;
  speedBytesPerSec?: number;
  etaSeconds?: number | null;
  phase?: 'downloading' | 'saving';
}

export async function showTransferProgressNotification(
  params: TransferProgressNotifParams,
  force: boolean = false
) {
  if (!isNotificationsSupported()) return;
  const Notifications = getNotificationsModule();
  if (!Notifications) return;

  const now = Date.now();
  // Throttle updates to at most once every 700ms unless forced or reached 100%
  if (!force && params.percent < 100 && now - lastProgressNotifTime < 700) {
    return;
  }
  lastProgressNotifTime = now;

  const { type, filename, current, total, percent, loadedBytes, totalBytes, speedBytesPerSec, etaSeconds, phase } = params;

  let title = type === 'upload' ? 'DeckComp • Sending File' : 'DeckComp • Receiving File';
  if (total > 1) {
    title += ` (${current}/${total})`;
  }

  const loadedStr = formatNotificationBytes(loadedBytes);
  const totalStr = formatNotificationBytes(totalBytes);
  const speedStr = formatNotificationSpeed(speedBytesPerSec || 0);
  const etaStr = formatNotificationEta(etaSeconds);

  let body = `${filename} • ${percent}%`;
  if (phase === 'saving') {
    body = `${filename} • Saving to storage (${percent}%)`;
  } else if (totalBytes > 0) {
    body += ` (${loadedStr} / ${totalStr})`;
    if (speedStr) body += ` • ${speedStr}`;
    if (etaStr) body += ` • ${etaStr}`;
  }

  try {
    await Notifications.scheduleNotificationAsync({
      identifier: TRANSFER_PROGRESS_NOTIF_ID,
      content: {
        title,
        body,
        sticky: true,
        autoDismiss: false,
        sound: undefined,
        priority: Notifications.AndroidNotificationPriority.MIN,
        color: '#89b4fa',
      },
      trigger: {
        channelId: SILENT_CHANNEL_ID,
      },
    });
  } catch {}
}

export async function dismissTransferProgressNotification() {
  if (!isNotificationsSupported()) return;
  const Notifications = getNotificationsModule();
  if (!Notifications) return;

  try {
    await Notifications.dismissNotificationAsync(TRANSFER_PROGRESS_NOTIF_ID);
  } catch {}
}
