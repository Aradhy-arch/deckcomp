import * as Clipboard from 'expo-clipboard';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform, Vibration } from 'react-native';
import { ApiClient } from '../api/client';
import { getActiveDeviceId, loadDevices } from '../storage/deviceStorage';

const SILENT_CHANNEL_ID = 'deckcomp-silent-service-v2';
const NOTIFICATION_ID = 'deck_persistent_service_notification';
const CATEGORY_ID = 'clipboard_quick_actions';

// Check if running inside Expo Go client where push/topic notification native modules are stripped
const isExpoGo =
  Constants.appOwnership === 'expo' ||
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

let isInitialized = false;
let currentHostname = 'Linux PC';
let feedbackResetTimer: NodeJS.Timeout | null = null;
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
 * Executes a quick clipboard push or pull action with error handling and notification updates.
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

/**
 * Checks if the app was launched or foregrounded via a notification response
 * (such as cold-start from tapping Push Clip / Pull Clip).
 */
export async function checkInitialNotificationResponse(
  clientProvider: () => ApiClient | null,
  options?: {
    onFeedback?: (msg: string, isError?: boolean) => void;
  }
): Promise<{ handled: boolean; actionId?: string; success?: boolean; message?: string }> {
  const Notifications = getNotificationsModule();
  if (!Notifications) return { handled: false };

  try {
    const response = await Notifications.getLastNotificationResponseAsync();
    if (!response) return { handled: false };

    const actionId = response.actionIdentifier;
    if (actionId !== 'action_push_clip' && actionId !== 'action_pull_clip') {
      return { handled: false };
    }

    const key = `${response.notification?.request?.identifier || ''}_${actionId}_${response.notification?.date || ''}`;
    if (lastProcessedResponseKey === key) {
      return { handled: false };
    }
    lastProcessedResponseKey = key;

    const res = await executeClipboardAction(actionId, clientProvider(), options);
    return { handled: true, actionId, success: res.success, message: res.message };
  } catch {
    return { handled: false };
  }
}

export async function initNotificationService(
  apiClientProvider: () => ApiClient | null,
  onActionTriggered?: (actionId: string, result: { success: boolean; message: string }) => void
) {
  if (Platform.OS !== 'android' || isExpoGo) return;
  if (isInitialized) return;
  isInitialized = true;

  const Notifications = getNotificationsModule();
  if (!Notifications) return;

  try {
    // Configure notification handler safely for silent operation
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: false,
        shouldShowBanner: false,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
        priority: Notifications.AndroidNotificationPriority.MIN,
      }),
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
    // Android puts channels with MIN/LOW importance in the "Silent" category (alert switches hidden)
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

    // 3. Define Quick Action Buttons with opensAppToForeground: true
    // Required on Android 10+ so the app gets window focus to read/write clipboard
    await Notifications.setNotificationCategoryAsync(CATEGORY_ID, [
      {
        identifier: 'action_pull_clip',
        buttonTitle: 'Pull Clip',
        options: {
          opensAppToForeground: true,
        },
      },
      {
        identifier: 'action_push_clip',
        buttonTitle: 'Push Clip',
        options: {
          opensAppToForeground: true,
        },
      },
    ]);

    // 4. Handle button taps while app is already running
    Notifications.addNotificationResponseReceivedListener(async (response) => {
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
