import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceConfig } from '../types';

const STORAGE_KEY_DEVICES = '@deck_devices_list_v1';
const STORAGE_KEY_ACTIVE_DEVICE_ID = '@deck_active_device_id';
const STORAGE_KEY_DEVICE_UUID = '@deck_local_device_uuid';
const STORAGE_KEY_ONBOARDING_DONE = '@deck_onboarding_completed_v1';

export const DEFAULT_DEVICE: DeviceConfig = {
  id: 'dev_192.168.31.30_8088',
  name: 'Arch Linux Workstation',
  hostIp: '192.168.31.30',
  hostPort: 8088,
  isPaired: false,
  lastConnected: new Date().toISOString(),
};

export async function loadDevices(): Promise<DeviceConfig[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_DEVICES);
    if (!raw) {
      await saveDevices([DEFAULT_DEVICE]);
      return [DEFAULT_DEVICE];
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
    return [DEFAULT_DEVICE];
  } catch {
    return [DEFAULT_DEVICE];
  }
}

export async function saveDevices(devices: DeviceConfig[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY_DEVICES, JSON.stringify(devices));
}

export async function getActiveDeviceId(): Promise<string> {
  try {
    const active = await AsyncStorage.getItem(STORAGE_KEY_ACTIVE_DEVICE_ID);
    if (active) return active;
  } catch {}
  return DEFAULT_DEVICE.id;
}

export async function setActiveDeviceId(id: string): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY_ACTIVE_DEVICE_ID, id);
}

export async function addOrUpdateDevice(device: DeviceConfig): Promise<DeviceConfig[]> {
  const current = await loadDevices();
  const index = current.findIndex((d) => d.id === device.id);
  let updated: DeviceConfig[];
  if (index >= 0) {
    updated = [...current];
    updated[index] = { ...updated[index], ...device };
  } else {
    updated = [...current, device];
  }
  await saveDevices(updated);
  return updated;
}

export async function removeDevice(id: string): Promise<DeviceConfig[]> {
  const current = await loadDevices();
  const updated = current.filter((d) => d.id !== id);
  await saveDevices(updated);
  return updated;
}

export async function getLocalDeviceUuid(): Promise<string> {
  try {
    let uuid = await AsyncStorage.getItem(STORAGE_KEY_DEVICE_UUID);
    if (!uuid) {
      uuid = `deck_phone_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      await AsyncStorage.setItem(STORAGE_KEY_DEVICE_UUID, uuid);
    }
    return uuid;
  } catch {
    return `deck_phone_${Date.now()}`;
  }
}

export async function isOnboardingCompleted(): Promise<boolean> {
  try {
    const done = await AsyncStorage.getItem(STORAGE_KEY_ONBOARDING_DONE);
    return done === 'true';
  } catch {
    return false;
  }
}

export async function setOnboardingCompleted(completed: boolean): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY_ONBOARDING_DONE, completed ? 'true' : 'false');
}
