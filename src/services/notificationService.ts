import * as Clipboard from 'expo-clipboard';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
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
let currentHostname = 'Arch Linux';
let feedbackResetTimer: NodeJS.Timeout | null = null;

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

export async function initNotificationService(apiClientProvider: () => ApiClient | null) {
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

    // 3. Define Quick Action Buttons with opensAppToForeground: false
    // Tapping these buttons executes the action entirely in the background without launching the app
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

    // 4. Handle button taps in the background directly
    Notifications.addNotificationResponseReceivedListener(async (response) => {
      const actionId = response.actionIdentifier;
      if (actionId !== 'action_push_clip' && actionId !== 'action_pull_clip') {
        return;
      }

      let client = apiClientProvider();
      if (!client) {
        // Fallback: recover active client from local storage
        try {
          const devList = await loadDevices();
          const activeId = await getActiveDeviceId();
          const activeDev = devList.find((d) => d.id === activeId) || devList[0];
          if (activeDev && activeDev.hostIp) {
            client = new ApiClient({
              hostIp: activeDev.hostIp,
              hostPort: activeDev.hostPort,
              authToken: activeDev.authToken,
            });
          }
        } catch {}
      }

      if (!client) return;

      try {
        if (actionId === 'action_push_clip') {
          const text = await Clipboard.getStringAsync();
          if (text && text.trim()) {
            await client.pushClipboard(text);
            const preview = text.trim().slice(0, 24);
            const suffix = text.trim().length > 24 ? '...' : '';
            await updateNotificationFeedback(`✓ Pushed to PC: "${preview}${suffix}"`);
          } else {
            await updateNotificationFeedback('⚠ Phone clipboard is empty');
          }
        } else if (actionId === 'action_pull_clip') {
          const remoteClip = await client.getClipboard();
          if (remoteClip && remoteClip.content && remoteClip.content.trim()) {
            await Clipboard.setStringAsync(remoteClip.content);
            const preview = remoteClip.content.trim().slice(0, 24);
            const suffix = remoteClip.content.trim().length > 24 ? '...' : '';
            await updateNotificationFeedback(`✓ Pulled from PC: "${preview}${suffix}"`);
          } else {
            await updateNotificationFeedback('⚠ PC clipboard is empty');
          }
        }
      } catch (err) {
        await updateNotificationFeedback('⚠ Clipboard sync failed');
      }
    });
  } catch (err) {
    console.warn('[NotificationService] Initialization skipped:', err);
  }
}

async function updateNotificationFeedback(feedbackMsg: string) {
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

export async function showPersistentNotification(hostname: string = 'Arch Linux') {
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
