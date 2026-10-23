import * as Clipboard from 'expo-clipboard';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform, Vibration } from 'react-native';
import { ApiClient } from '../api/client';
import { getActiveDeviceId, loadDevices } from '../storage/deviceStorage';

const SILENT_CHANNEL_ID = 'deckcomp-silent-service-v2';
const INCOMING_FILES_CHANNEL_ID = 'deckcomp-incoming-files-v1';
const NOTIFICATION_ID = 'deck_persistent_service_notification';
const CATEGORY_ID = 'clipboard_quick_actions';

// Check if running inside Expo Go client where push/topic notification native modules are stripped
const isExpoGo =
  Constants.appOwnership === 'expo' ||
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

let isInitialized = false;
let currentHostname = 'Linux PC';
let feedbackResetTimer: ReturnType<typeof setTimeout> | null = null;
let lastProcessedResponseKey = '';

// Lazy-load expo-notifications only in native standalone builds (never in Expo Go)
function getNotificationsModule(): typeof import('expo-notifications') | null {
  if (isExpoGo || Platform.OS !== 'android') return null;
  try {
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
  if (Platform.OS !== 'android' || isExpoGo) return;
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
  if (Platform.OS !== 'android' || isExpoGo) return;
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
  if (isExpoGo) return;
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
  if (isExpoGo || Platform.OS !== 'android') return;
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
