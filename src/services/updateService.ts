import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Updates from 'expo-updates';

const STORAGE_KEY_LAST_OTA_CHECK = '@deck_last_ota_check_timestamp';
export const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000; // 48 hours in milliseconds

export type UpdateCheckStatus =
  | 'skipped_dev'
  | 'skipped_interval'
  | 'up_to_date'
  | 'updated'
  | 'deferred_transfer'
  | 'error';

export interface UpdateCheckResult {
  status: UpdateCheckStatus;
  isAvailable?: boolean;
  error?: string;
  lastCheckedTime?: number;
}

/**
 * Returns the epoch timestamp of the last successful OTA update check, or null if never checked.
 */
export async function getLastOtaCheckTime(): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_LAST_OTA_CHECK);
    if (!raw) return null;
    const ts = parseInt(raw, 10);
    return isNaN(ts) ? null : ts;
  } catch {
    return null;
  }
}

/**
 * Persists the current timestamp as the last check time.
 */
export async function recordLastOtaCheckTime(timestamp: number = Date.now()): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY_LAST_OTA_CHECK, String(timestamp));
  } catch {}
}

/**
 * Formats the timestamp into a friendly relative description (e.g., "Just now", "Yesterday", "2 days ago").
 */
export function formatLastOtaCheckTime(timestamp: number | null): string {
  if (!timestamp) return 'Never';
  const now = Date.now();
  const diffMs = now - timestamp;
  if (diffMs < 0) return 'Just now';

  const mins = Math.floor(diffMs / 60000);
  if (mins < 2) return 'Just now';
  if (mins < 60) return `${mins}m ago`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;

  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export interface CheckUpdateOptions {
  force?: boolean;
  isTransferActive?: () => boolean;
  onStatusMessage?: (msg: string) => void;
}

/**
 * Checks for EAS OTA updates every 2 days (48 hours).
 * If a new update is found and no transfers are active, downloads and applies it immediately.
 */
export async function checkAndApplyPeriodicUpdate(
  options: CheckUpdateOptions = {}
): Promise<UpdateCheckResult> {
  const { force = false, isTransferActive, onStatusMessage } = options;

  // expo-updates is only functional in non-dev release/preview builds
  if (__DEV__) {
    return { status: 'skipped_dev' };
  }

  try {
    const lastCheck = await getLastOtaCheckTime();
    const now = Date.now();

    // Check if 2 days have elapsed unless force flag is specified
    if (!force && lastCheck && now - lastCheck < TWO_DAYS_MS) {
      return { status: 'skipped_interval', lastCheckedTime: lastCheck };
    }

    onStatusMessage?.('Checking for updates...');
    const check = await Updates.checkForUpdateAsync();

    // Update timestamp on successful network check
    await recordLastOtaCheckTime(now);

    if (!check.isAvailable) {
      return { status: 'up_to_date', isAvailable: false, lastCheckedTime: now };
    }

    // New update found! Check if an active transfer is currently running
    if (isTransferActive && isTransferActive()) {
      // Defer reload so active file transfer is not interrupted
      Updates.fetchUpdateAsync().catch(() => {});
      return {
        status: 'deferred_transfer',
        isAvailable: true,
        lastCheckedTime: now,
      };
    }

    onStatusMessage?.('Downloading update...');
    await Updates.fetchUpdateAsync();

    onStatusMessage?.('Applying update & restarting...');
    await Updates.reloadAsync();

    return { status: 'updated', isAvailable: true, lastCheckedTime: now };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Update check failed';
    return { status: 'error', error: errorMsg };
  }
}
