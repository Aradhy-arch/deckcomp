import AsyncStorage from '@react-native-async-storage/async-storage';
import { HostConfig } from '../types';

const STORAGE_KEY_IP = '@deck_host_ip';
const STORAGE_KEY_PORT = '@deck_host_port';
const STORAGE_KEY_FUN_TAB = '@deck_enable_fun_tab';

export const DEFAULT_HOST_CONFIG: HostConfig = {
  hostIp: '192.168.31.30',
  hostPort: 8088,
  enableFunTab: true,
};

export function validateHostPort(portStr: string): number {
  const trimmed = portStr.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new Error('Port must be a whole positive integer');
  }
  const port = parseInt(trimmed, 10);
  if (port < 1 || port > 65535) {
    throw new Error('Port must be between 1 and 65535');
  }
  return port;
}

export function validateHostIp(ipStr: string): string {
  const trimmed = ipStr.trim();
  if (!trimmed) {
    throw new Error('Host IP/Hostname cannot be empty');
  }
  if (/\s/.test(trimmed)) {
    throw new Error('Host IP/Hostname cannot contain whitespace');
  }
  return trimmed;
}

export async function loadHostConfig(): Promise<HostConfig> {
  try {
    const storedIp = await AsyncStorage.getItem(STORAGE_KEY_IP);
    const storedPort = await AsyncStorage.getItem(STORAGE_KEY_PORT);
    const storedFunTab = await AsyncStorage.getItem(STORAGE_KEY_FUN_TAB);

    let validPort = DEFAULT_HOST_CONFIG.hostPort;
    if (storedPort) {
      try {
        validPort = validateHostPort(storedPort);
      } catch {
        validPort = DEFAULT_HOST_CONFIG.hostPort;
      }
    }

    return {
      hostIp: storedIp ? storedIp.trim() : DEFAULT_HOST_CONFIG.hostIp,
      hostPort: validPort,
      enableFunTab: storedFunTab !== null ? storedFunTab === 'true' : true,
    };
  } catch {
    return DEFAULT_HOST_CONFIG;
  }
}

export async function saveHostConfig(config: HostConfig): Promise<void> {
  const safeIp = validateHostIp(config.hostIp);
  const safePort = validateHostPort(config.hostPort.toString());
  const funTabVal = config.enableFunTab !== false ? 'true' : 'false';

  await AsyncStorage.multiSet([
    [STORAGE_KEY_IP, safeIp],
    [STORAGE_KEY_PORT, safePort.toString()],
    [STORAGE_KEY_FUN_TAB, funTabVal],
  ]);
}
