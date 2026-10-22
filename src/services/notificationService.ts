import * as Clipboard from 'expo-clipboard';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import { ApiClient } from '../api/client';

const CHANNEL_ID = 'deck-companion-service';
const NOTIFICATION_ID = 'deck_persistent_service_notification';
const CATEGORY_ID = 'clipboard_quick_actions';

// Check if running inside Expo Go client where push/topic notification native modules are stripped
const isExpoGo =
  Constants.appOwnership === 'expo' ||
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

let isInitialized = false;

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
    // Configure notification handler safely
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

    // 2. Set up low-priority silent notification channel on Android
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'DeckComp Service',
      description: 'Persistent background status and quick clipboard controls',
      importance: Notifications.AndroidImportance.LOW,
      vibrationPattern: [0],
      enableVibrate: false,
      sound: undefined,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      showBadge: false,
    });

    // 3. Define Quick Action Buttons: "Pull Clip" and "Push Clip"
    await Notifications.setNotificationCategoryAsync(CATEGORY_ID, [
      {
        identifier: 'action_push_clip',
        buttonTitle: 'Push Clip',
        options: { opensAppToForeground: true },
      },
      {
        identifier: 'action_pull_clip',
        buttonTitle: 'Pull Clip',
        options: { opensAppToForeground: true },
      },
    ]);

    // 4. Handle button taps directly
    Notifications.addNotificationResponseReceivedListener(async (response) => {
      const actionId = response.actionIdentifier;
      const client = apiClientProvider();
      if (!client) return;

      try {
        if (actionId === 'action_push_clip') {
          const text = await Clipboard.getStringAsync();
          if (text) {
            await client.pushClipboard(text);
          }
        } else if (actionId === 'action_pull_clip') {
          const remoteClip = await client.getClipboard();
          if (remoteClip?.content) {
            await Clipboard.setStringAsync(remoteClip.content);
          }
        }
      } catch {
        // Silent failure in background
      }
    });
  } catch (err) {
    console.warn('[NotificationService] Initialization skipped:', err);
  }
}

export async function showPersistentNotification(hostname: string = 'Arch Linux') {
  if (Platform.OS !== 'android' || isExpoGo) return;
  const Notifications = getNotificationsModule();
  if (!Notifications) return;

  try {
    await Notifications.scheduleNotificationAsync({
      identifier: NOTIFICATION_ID,
      content: {
        title: 'DeckComp Active',
        body: `Paired with ${hostname} • Tap buttons for quick clipboard`,
        categoryIdentifier: CATEGORY_ID,
        sticky: true,
        autoDismiss: false,
        color: '#cba6f7', // Catppuccin mauve
        priority: Notifications.AndroidNotificationPriority.LOW,
      },
      trigger: null,
    });
  } catch {
    // Silent catch
  }
}

export async function dismissPersistentNotification() {
  if (isExpoGo) return;
  const Notifications = getNotificationsModule();
  if (!Notifications) return;

  try {
    await Notifications.dismissNotificationAsync(NOTIFICATION_ID);
  } catch {}
}
