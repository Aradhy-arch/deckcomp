import * as FileSystem from 'expo-file-system/legacy';
import {
  AmbientOptions,
  ClipboardData,
  DiscoveredHost,
  DropResult,
  HostConfig,
  HostTelemetry,
  MediaStatus,
  PairInitiateResponse,
  PairVerifyResponse,
  SharedFileItem,
  ShellResult,
} from '../types';

export class ApiErrorResponse extends Error {
  code: string;
  detail: string;
  timestamp: string;

  constructor(detail: string, code: string = 'API_ERROR', timestamp?: string) {
    super(detail);
    this.name = 'ApiErrorResponse';
    this.detail = detail;
    this.code = code;
    this.timestamp = timestamp || new Date().toISOString();
  }
}

/**
 * Detects whether an error represents a socket, network, host-unreachable, or offline condition.
 */
export function isHostDisconnectedError(err: unknown): boolean {
  if (!err) return false;
  if (err instanceof ApiErrorResponse) {
    if (err.code === 'HOST_DISCONNECTED' || err.code === 'TIMEOUT' || err.code === 'NETWORK_ERROR') {
      return true;
    }
    return isHostDisconnectedError(err.detail);
  }
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /socket/i.test(msg) ||
    /permission denied/i.test(msg) ||
    /illegal socket/i.test(msg) ||
    /network request failed/i.test(msg) ||
    /failed to connect/i.test(msg) ||
    /connection (?:refused|reset|aborted|closed|failed)/i.test(msg) ||
    /econnrefused/i.test(msg) ||
    /ehostunreach/i.test(msg) ||
    /enetunreach/i.test(msg) ||
    /econnreset/i.test(msg) ||
    /eperm/i.test(msg) ||
    /timed? ?out/i.test(msg) ||
    /unreachable/i.test(msg) ||
    /offline/i.test(msg) ||
    /abort/i.test(msg) ||
    /software caused connection abort/i.test(msg) ||
    /broken pipe/i.test(msg) ||
    /failed to fetch/i.test(msg)
  );
}

/**
 * Normalizes any error message for UI display.
 * If the host is unreachable, disconnected, or socket permission denied,
 * returns "Host is disconnected".
 */
export function formatErrorMessage(err: unknown, fallback: string = 'Host is disconnected'): string {
  if (!err) return fallback;
  if (isHostDisconnectedError(err)) {
    return 'Host is disconnected';
  }
  if (err instanceof ApiErrorResponse) {
    return err.detail || fallback;
  }
  if (err instanceof Error) {
    return err.message || fallback;
  }
  return String(err);
}

export class ApiClient {
  private baseUrl: string;
  private authToken?: string;

  constructor(config: HostConfig) {
    this.baseUrl = `http://${config.hostIp}:${config.hostPort}/api/v1`;
    this.authToken = config.authToken;
  }

  setAuthToken(token?: string) {
    this.authToken = token;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    timeoutMs: number = 5000
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {}),
        ...(options.headers as Record<string, string> || {}),
      };

      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        signal: controller.signal,
        headers,
      });

      clearTimeout(timer);

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const detail = data?.detail || `HTTP Error ${response.status}`;
        const code = data?.code || `HTTP_${response.status}`;
        throw new ApiErrorResponse(detail, code, data?.timestamp);
      }

      return data as T;
    } catch (err: unknown) {
      clearTimeout(timer);
      if (err instanceof ApiErrorResponse) {
        throw err;
      }
      if (err instanceof Error) {
        if (err.name === 'AbortError' || isHostDisconnectedError(err)) {
          throw new ApiErrorResponse('Host is disconnected', 'HOST_DISCONNECTED');
        }
        throw new ApiErrorResponse(err.message, 'NETWORK_ERROR');
      }
      throw new ApiErrorResponse('Host is disconnected', 'HOST_DISCONNECTED');
    }
  }

  async healthCheck(): Promise<{ status: string; hostname: string; version: string }> {
    return this.request<{ status: string; hostname: string; version: string }>('/health', { method: 'GET' }, 3000);
  }

  async getHostTelemetry(): Promise<HostTelemetry> {
    return this.request<HostTelemetry>('/telemetry/host', { method: 'GET' }, 4000);
  }

  async sendClientTelemetry(
    batteryLevel: number,
    batteryState: string,
    deviceName: string = 'Android Client'
  ): Promise<void> {
    await this.request('/telemetry/client', {
      method: 'POST',
      body: JSON.stringify({
        battery_level: batteryLevel,
        battery_state: batteryState,
        device_name: deviceName,
      }),
    });
  }

  async getClipboard(): Promise<ClipboardData> {
    return this.request<ClipboardData>('/clipboard', { method: 'GET' }, 4000);
  }

  async pushClipboard(content: string): Promise<{ status: string; bytes_written: number }> {
    return this.request('/clipboard', {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  }

  async getMediaStatus(): Promise<MediaStatus> {
    return this.request<MediaStatus>('/media/status', { method: 'GET' }, 4000);
  }

  async controlMedia(action: 'play-pause' | 'next' | 'previous' | 'play' | 'pause' | 'stop'): Promise<void> {
    await this.request('/media/control', {
      method: 'POST',
      body: JSON.stringify({ action }),
    });
  }

  async adjustVolume(
    direction: 'up' | 'down' | 'mute' | 'set',
    stepPercent: number = 5,
    targetVolume?: number
  ): Promise<{ volume: number; muted: boolean }> {
    return this.request<{ volume: number; muted: boolean }>('/audio/volume', {
      method: 'POST',
      body: JSON.stringify({
        direction,
        step_percent: stepPercent,
        target_volume: targetVolume,
      }),
    });
  }

  async lockSession(): Promise<void> {
    await this.request('/session/lock', { method: 'POST' });
  }

  async suspendHost(): Promise<void> {
    await this.request('/power/suspend', {
      method: 'POST',
      body: JSON.stringify({ confirm: true }),
    });
  }

  async rebootHost(): Promise<void> {
    await this.request('/power/reboot', {
      method: 'POST',
      body: JSON.stringify({ confirm: true }),
    });
  }

  async poweroffHost(): Promise<void> {
    await this.request('/power/poweroff', {
      method: 'POST',
      body: JSON.stringify({ confirm: true }),
    });
  }

  async getAmbientOptions(): Promise<AmbientOptions> {
    return this.request<AmbientOptions>('/ambient/options', { method: 'GET' });
  }

  async spawnAmbient(app: 'lavat' | 'cbonsai', terminal?: string): Promise<{ pid: number }> {
    return this.request<{ pid: number }>('/ambient/spawn', {
      method: 'POST',
      body: JSON.stringify({ app, terminal }),
    });
  }

  async executeShell(
    command: string,
    timeoutSeconds: number = 15,
    workingDirectory?: string
  ): Promise<ShellResult> {
    return this.request<ShellResult>(
      '/shell/exec',
      {
        method: 'POST',
        body: JSON.stringify({
          command,
          timeout_seconds: timeoutSeconds,
          working_directory: workingDirectory,
        }),
      },
      (timeoutSeconds + 2) * 1000
    );
  }

  async dropFile(
    uri: string,
    filename: string,
    mimeType: string = 'application/octet-stream'
  ): Promise<DropResult> {
    try {
      const uploadUrl = `${this.baseUrl}/drop`;
      const result = await FileSystem.uploadAsync(uploadUrl, uri, {
        fieldName: 'file',
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        mimeType: mimeType || 'application/octet-stream',
        parameters: {
          filename: filename,
        },
        headers: {
          Accept: 'application/json',
          ...(this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {}),
        },
      });

      if (result.status < 200 || result.status >= 300) {
        let errorDetail = `Upload failed with HTTP ${result.status}`;
        try {
          const errData = JSON.parse(result.body);
          if (errData?.detail) errorDetail = errData.detail;
        } catch {}
        throw new ApiErrorResponse(errorDetail, `HTTP_${result.status}`);
      }

      const data = JSON.parse(result.body);
      return data as DropResult;
    } catch (err: unknown) {
      if (err instanceof ApiErrorResponse) {
        throw err;
      }
      if (isHostDisconnectedError(err)) {
        throw new ApiErrorResponse('Host is disconnected', 'HOST_DISCONNECTED');
      }
      if (err instanceof Error) {
        throw new ApiErrorResponse(err.message, 'UPLOAD_ERROR');
      }
      throw new ApiErrorResponse('Host is disconnected', 'HOST_DISCONNECTED');
    }
  }

  // 9. Pairing & Multi-device Authentication
  async initiatePairing(deviceId: string, deviceName: string): Promise<PairInitiateResponse> {
    return this.request<PairInitiateResponse>('/pair/initiate', {
      method: 'POST',
      body: JSON.stringify({ device_id: deviceId, device_name: deviceName }),
    });
  }

  async verifyPairing(deviceId: string, code: string, deviceName?: string): Promise<PairVerifyResponse> {
    return this.request<PairVerifyResponse>('/pair/verify', {
      method: 'POST',
      body: JSON.stringify({ device_id: deviceId, code, device_name: deviceName }),
    });
  }

  async getPairingStatus(deviceId: string): Promise<{ device_id: string; is_paired: boolean; hostname: string }> {
    return this.request<{ device_id: string; is_paired: boolean; hostname: string }>(`/pair/status/${deviceId}`);
  }

  async unpair(deviceId: string): Promise<{ status: string }> {
    return this.request<{ status: string }>(`/pair/${deviceId}`, {
      method: 'DELETE',
    });
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  getAuthToken(): string | undefined {
    return this.authToken;
  }

  // 10. Host-to-Mobile Sharing (Outbox)
  async listPendingShares(): Promise<SharedFileItem[]> {
    return this.request<SharedFileItem[]>('/share/pending');
  }

  async downloadSharedFileToCache(fileId: string, filename: string): Promise<string> {
    try {
      const downloadUrl = `${this.baseUrl}/share/download/${fileId}`;
      const safeBasename = filename.replace(/[/\\:*?"<>|]/g, '_') || 'download.bin';
      const cacheDir = FileSystem.cacheDirectory || '';
      const targetUri = `${cacheDir.endsWith('/') ? cacheDir : cacheDir + '/'}${Date.now()}_${safeBasename}`;

      const headers: Record<string, string> = {
        ...(this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {}),
      };

      const downloadRes = await FileSystem.downloadAsync(downloadUrl, targetUri, {
        headers,
      });
      if (downloadRes.status < 200 || downloadRes.status >= 300) {
        throw new ApiErrorResponse(`Download failed with status ${downloadRes.status}`, `HTTP_${downloadRes.status}`);
      }
      return downloadRes.uri;
    } catch (err: unknown) {
      if (err instanceof ApiErrorResponse) throw err;
      if (isHostDisconnectedError(err)) {
        throw new ApiErrorResponse('Host is disconnected', 'HOST_DISCONNECTED');
      }
      throw err;
    }
  }

  async downloadSharedFile(fileId: string, filename: string): Promise<string> {
    try {
      const downloadUrl = `${this.baseUrl}/share/download/${fileId}`;
      // Sanitize filename to prevent URI-reserved characters or path traversal
      const safeBasename = filename.replace(/[^a-zA-Z0-9._-]/g, '_') || 'download.bin';
      const baseDir = FileSystem.documentDirectory || FileSystem.cacheDirectory || '';
      const targetUri = `${baseDir.endsWith('/') ? baseDir : baseDir + '/'}${safeBasename}`;

      const headers: Record<string, string> = {
        ...(this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {}),
      };

      const downloadRes = await FileSystem.downloadAsync(downloadUrl, targetUri, {
        headers,
      });
      if (downloadRes.status < 200 || downloadRes.status >= 300) {
        throw new ApiErrorResponse(`Download failed with status ${downloadRes.status}`, `HTTP_${downloadRes.status}`);
      }
      return downloadRes.uri;
    } catch (err: unknown) {
      if (err instanceof ApiErrorResponse) throw err;
      if (isHostDisconnectedError(err)) {
        throw new ApiErrorResponse('Host is disconnected', 'HOST_DISCONNECTED');
      }
      throw err;
    }
  }

  async acknowledgeShare(fileId: string): Promise<{ status: string }> {
    return this.request<{ status: string }>(`/share/${fileId}`, {
      method: 'DELETE',
    });
  }

  // Static discovery helper for scanning local network
  static async scanHost(ip: string, port: number = 8088): Promise<DiscoveredHost | null> {
    if (!ip || !ip.trim()) return null;
    const cleanIp = ip.trim();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1200);
    try {
      const res = await fetch(`http://${cleanIp}:${port}/api/v1/health`, {
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'ok') {
          return {
            ip: cleanIp,
            port,
            hostname: data.hostname || cleanIp,
            version: data.version || '1.0.0',
          };
        }
      }
    } catch {
      clearTimeout(timer);
    }
    return null;
  }

  static async discoverSubnet(baseSubnetPrefix?: string, port: number = 8088): Promise<DiscoveredHost[]> {
    const prefixes = baseSubnetPrefix && baseSubnetPrefix.trim()
      ? [baseSubnetPrefix.trim()]
      : ['192.168.1', '192.168.0', '192.168.31', '10.0.0'];

    const results: DiscoveredHost[] = [];
    for (const prefix of prefixes) {
      const candidates = Array.from({ length: 254 }, (_, i) => `${prefix}.${i + 1}`);
      const batchSize = 40;
      for (let i = 0; i < candidates.length; i += batchSize) {
        const batch = candidates.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch.map((candidateIp) => ApiClient.scanHost(candidateIp, port)));
        for (const host of batchResults) {
          if (host && !results.some((r) => r.ip === host.ip)) {
            results.push(host);
          }
        }
        if (results.length > 0 && !baseSubnetPrefix) {
          return results;
        }
      }
    }
    return results;
  }
}
