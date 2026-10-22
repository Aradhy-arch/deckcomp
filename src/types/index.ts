export interface HostConfig {
  hostIp: string;
  hostPort: number;
  enableFunTab?: boolean;
  authToken?: string;
}

export type PresetIconName =
  | 'Flame'
  | 'Sparkles'
  | 'Terminal'
  | 'Gamepad2'
  | 'Coffee'
  | 'Rocket'
  | 'Heart'
  | 'Zap'
  | 'Cpu'
  | 'Eye'
  | 'Tv'
  | 'Code'
  | 'Activity';

export interface FunPreset {
  id: string;
  title: string;
  command: string;
  icon: PresetIconName;
  spawnMode: 'ambient' | 'terminal' | 'background';
  description?: string;
}

export type NetworkStatus = 'checking' | 'online' | 'offline';

export interface HostBattery {
  present: boolean;
  percent: number | null;
  status: string;
  power_supply_name: string | null;
}

export interface HostTelemetry {
  battery: HostBattery;
  ac_connected: boolean;
  uptime_seconds: number;
  timestamp: string;
}

export interface ClientBattery {
  batteryLevel: number | null;
  batteryState: string;
  isLowPower: boolean;
}

export interface ClipboardData {
  content: string;
  mime_type: string;
  length: number;
  timestamp: string;
}

export interface MediaStatus {
  player: string | null;
  playback_status: 'Playing' | 'Paused' | 'Stopped' | 'None';
  title: string | null;
  artist: string | null;
  album: string | null;
  volume: number;
  muted: boolean;
  timestamp: string;
}

export interface AmbientOptions {
  available_apps: string[];
  detected_terminal: string;
}

export interface ShellResult {
  stdout: string;
  stderr: string;
  exit_code: number;
  duration_ms: number;
  timed_out: boolean;
}

export interface DropResult {
  status: string;
  original_filename: string;
  saved_filename: string;
  path: string;
  size_bytes: number;
}

export interface ApiError {
  detail: string;
  code: string;
  timestamp: string;
}

export interface DeviceConfig {
  id: string;
  name: string;
  hostIp: string;
  hostPort: number;
  isPaired: boolean;
  authToken?: string;
  lastConnected?: string;
}

export interface PairInitiateResponse {
  status: string;
  device_id: string;
  device_name: string;
  expires_in: number;
}

export interface PairVerifyResponse {
  status: string;
  device_id: string;
  device_name: string;
  token?: string;
  timestamp: number;
}

export interface SharedFileItem {
  id: string;
  filename: string;
  size_bytes: number;
  staged_at: number;
}

export interface DiscoveredHost {
  ip: string;
  port: number;
  hostname: string;
  version: string;
}
