import * as FileSystem from 'expo-file-system/legacy';
import {
  AmbientOptions,
  ClipboardData,
  DiscoveredHost,
  DiscoverSubnetOptions,
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
 * Any other technical/native exception strings are sanitized to "An error occurred".
 */
export function formatErrorMessage(err: unknown, fallback: string = 'An error occurred'): string {
  if (!err) return fallback;
  if (isHostDisconnectedError(err)) {
    return 'Host is disconnected';
  }
  let message = '';
  if (err instanceof ApiErrorResponse) {
    message = err.detail || '';
  } else if (err instanceof Error) {
    message = err.message || '';
  } else {
    message = String(err);
  }

  // Sanitize internal native module, Java, OkHttp, or cryptic filesystem exceptions
  if (
    !message ||
    /call to function/i.test(message) ||
    /has been rejected/i.test(message) ||
    /unreadable/i.test(message) ||
    /exponentfilesystem/i.test(message) ||
    /java\./i.test(message) ||
    /okhttp/i.test(message) ||
    /exception/i.test(message) ||
    /nullpointer/i.test(message) ||
    /undefined/i.test(message) ||
    /errno/i.test(message)
  ) {
    return 'An error occurred';
  }

  return message;
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
    return this.request<{ status: string; hostname: string; version: string }>('/health', { method: 'GET' }, 6000);
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
    mimeType: string = 'application/octet-stream',
    onProgress?: (bytesSent: number, totalBytes: number) => void
  ): Promise<DropResult> {
    const authQuery = this.authToken ? `?token=${encodeURIComponent(this.authToken)}` : '';
    const uploadUrl = `${this.baseUrl}/drop${authQuery}`;

    return new Promise<DropResult>((resolve, reject) => {
      try {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', uploadUrl);

        if (this.authToken) {
          xhr.setRequestHeader('Authorization', `Bearer ${this.authToken}`);
        }
        xhr.setRequestHeader('Accept', 'application/json');

        if (xhr.upload && onProgress) {
          xhr.upload.onprogress = (evt) => {
            if (evt.lengthComputable && evt.total > 0) {
              onProgress(evt.loaded, evt.total);
            }
          };
        }

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const data = JSON.parse(xhr.responseText);
              resolve(data as DropResult);
            } catch {
              resolve({
                status: 'saved',
                original_filename: filename,
                saved_filename: filename,
                path: `Downloads/${filename}`,
                size_bytes: 0,
              });
            }
          } else {
            let errorDetail = 'An error occurred';
            try {
              const errData = JSON.parse(xhr.responseText);
              if (errData?.detail) {
                errorDetail = errData.detail;
              }
            } catch {}
            reject(new ApiErrorResponse(errorDetail, `HTTP_${xhr.status}`));
          }
        };

        xhr.onerror = () => {
          reject(new ApiErrorResponse('An error occurred', 'UPLOAD_ERROR'));
        };

        xhr.ontimeout = () => {
          reject(new ApiErrorResponse('Host is disconnected', 'HOST_DISCONNECTED'));
        };

        const formData = new FormData();
        formData.append('file', {
          uri,
          name: filename,
          type: mimeType || 'application/octet-stream',
        } as any);
        formData.append('filename', filename);

        xhr.send(formData);
      } catch (err: unknown) {
        if (isHostDisconnectedError(err)) {
          reject(new ApiErrorResponse('Host is disconnected', 'HOST_DISCONNECTED'));
        } else {
          reject(new ApiErrorResponse('An error occurred', 'UPLOAD_ERROR'));
        }
      }
    });
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
  static async scanHost(
    ip: string,
    port: number = 8088,
    timeoutMs: number = 300,
    signal?: AbortSignal
  ): Promise<DiscoveredHost | null> {
    if (!ip || !ip.trim()) return null;
    if (signal?.aborted) return null;
    const cleanIp = ip.trim();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const onParentAbort = () => {
      clearTimeout(timer);
      controller.abort();
    };

    if (signal) {
      if (signal.aborted) {
        clearTimeout(timer);
        return null;
      }
      signal.addEventListener('abort', onParentAbort, { once: true });
    }

    try {
      const res = await fetch(`http://${cleanIp}:${port}/api/v1/health`, {
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        if (data && data.status === 'ok') {
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
    } finally {
      if (signal) {
        signal.removeEventListener('abort', onParentAbort);
      }
    }
    return null;
  }

  // Progressive streaming discovery across common local subnets
  static async discoverSubnet(
    optionsOrPrefix?: string | DiscoverSubnetOptions,
    portArg: number = 8088,
    onHostFoundArg?: (host: DiscoveredHost) => void
  ): Promise<DiscoveredHost[]> {
    let baseSubnetPrefix: string | undefined;
    let port = portArg;
    let timeoutMs = 300;
    let signal: AbortSignal | undefined;
    let onHostFound: ((host: DiscoveredHost) => void) | undefined = onHostFoundArg;

    if (typeof optionsOrPrefix === 'object' && optionsOrPrefix !== null) {
      baseSubnetPrefix = optionsOrPrefix.baseSubnetPrefix;
      port = optionsOrPrefix.port ?? 8088;
      timeoutMs = optionsOrPrefix.timeoutMs ?? 300;
      signal = optionsOrPrefix.signal;
      onHostFound = optionsOrPrefix.onHostFound ?? onHostFoundArg;
    } else if (typeof optionsOrPrefix === 'string') {
      baseSubnetPrefix = optionsOrPrefix;
    }

    if (signal?.aborted) return [];

    const defaultPrefixes = ['192.168.1', '192.168.0', '192.168.31', '192.168.29', '192.168.43', '10.0.0'];
    let prefixes: string[] = [];
    if (baseSubnetPrefix && baseSubnetPrefix.trim()) {
      const clean = baseSubnetPrefix.trim();
      prefixes = [clean, ...defaultPrefixes.filter((p) => p !== clean)];
    } else {
      prefixes = defaultPrefixes;
    }

    const results: DiscoveredHost[] = [];
    let lockedPrefix: string | null = null;

    const recordFound = (host: DiscoveredHost) => {
      if (!results.some((r) => r.ip === host.ip)) {
        results.push(host);
        // Subnet affinity lock: lock onto the subnet of the first found host
        const parts = host.ip.split('.');
        if (parts.length === 4) {
          lockedPrefix = parts.slice(0, 3).join('.');
        }
        try {
          onHostFound?.(host);
        } catch {}
      }
    };

    // Helper: probe a batch of candidate IPs concurrently with progressive reporting
    const probeBatch = async (ips: string[]): Promise<void> => {
      if (signal?.aborted) return;
      const tasks = ips.map(async (ip) => {
        if (signal?.aborted) return;
        // If locked to a subnet, skip candidates outside that subnet
        if (lockedPrefix) {
          const parts = ip.split('.');
          if (parts.length === 4 && parts.slice(0, 3).join('.') !== lockedPrefix) {
            return;
          }
        }
        const host = await ApiClient.scanHost(ip, port, timeoutMs, signal);
        if (host) {
          recordFound(host);
        }
      });
      await Promise.all(tasks);
    };

    // Phase 1: High-probability DHCP addresses interleaved across prefixes
    // Priority suffixes: .2-.15, .20, .25, .30, .100-.105, .110, .115, .150, .200
    const prioritySuffixes: number[] = [
      2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
      20, 25, 30,
      100, 101, 102, 103, 104, 105, 110, 115,
      150, 200,
    ];

    // Interleave prefixes so all candidate subnets get priority probes simultaneously
    const phase1Candidates: string[] = [];
    for (const suffix of prioritySuffixes) {
      for (const prefix of prefixes) {
        phase1Candidates.push(`${prefix}.${suffix}`);
      }
    }

    const BATCH_SIZE = 36;
    for (let i = 0; i < phase1Candidates.length; i += BATCH_SIZE) {
      if (signal?.aborted) return results;
      const batch = phase1Candidates.slice(i, i + BATCH_SIZE);
      await probeBatch(batch);
      // If we found a host and affinity is locked, we can stop Phase 1 early
      if (results.length > 0 && lockedPrefix) {
        return results;
      }
    }

    if (results.length > 0 || signal?.aborted) {
      return results;
    }

    // Phase 2: Sweep remaining suffixes if Phase 1 found nothing
    const remainingSuffixes: number[] = [];
    for (let i = 1; i <= 254; i++) {
      if (!prioritySuffixes.includes(i)) {
        remainingSuffixes.push(i);
      }
    }

    // If baseSubnetPrefix was specified, only sweep that prefix in Phase 2
    const phase2Prefixes = baseSubnetPrefix ? [baseSubnetPrefix.trim()] : prefixes;
    const phase2Candidates: string[] = [];
    for (const suffix of remainingSuffixes) {
      for (const prefix of phase2Prefixes) {
        phase2Candidates.push(`${prefix}.${suffix}`);
      }
    }

    for (let i = 0; i < phase2Candidates.length; i += 40) {
      if (signal?.aborted) return results;
      const batch = phase2Candidates.slice(i, i + 40);
      await probeBatch(batch);
      if (results.length > 0 && lockedPrefix) {
        return results;
      }
    }

    return results;
  }
}
