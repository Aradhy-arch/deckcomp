import * as Battery from 'expo-battery';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as Updates from 'expo-updates';
import { Laptop, LayoutGrid, Radio, SlidersHorizontal, Terminal, Upload } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  AppStateStatus,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiClient, formatErrorMessage } from './src/api/client';
import { FileDropDeck } from './src/components/FileDropDeck';
import { FunStuffDeck } from './src/components/FunStuffDeck';
import { Header } from './src/components/Header';
import { HostConfigModal } from './src/components/HostConfigModal';
import { MediaDeck } from './src/components/MediaDeck';
import { OfflineBanner } from './src/components/OfflineBanner';
import { OnboardingModal } from './src/components/OnboardingModal';
import { PairingModal } from './src/components/PairingModal';
import { QuickActionsDeck } from './src/components/QuickActionsDeck';
import { RemoteConsoleDeck } from './src/components/RemoteConsoleDeck';
import { SideDrawer } from './src/components/SideDrawer';
import { TelemetryDeck } from './src/components/TelemetryDeck';
import { ToastHUD } from './src/components/ToastHUD';
import { Palette } from './src/constants/theme';
import {
  dismissPersistentNotification,
  initNotificationService,
  notifyIncomingFileFromHost,
  showPersistentNotification,
  updateNotificationFeedback,
} from './src/services/notificationService';
import { checkAndApplyPeriodicUpdate } from './src/services/updateService';
import {
  addOrUpdateDevice,
  getActiveDeviceId,
  isOnboardingCompleted,
  loadDevices,
  removeDevice,
  setActiveDeviceId,
  setOnboardingCompleted,
} from './src/storage/deviceStorage';
import { DEFAULT_HOST_CONFIG, loadHostConfig, saveHostConfig } from './src/storage/hostStorage';
import {
  ClientBattery,
  DeviceConfig,
  HostConfig,
  HostTelemetry,
  MediaStatus,
  NetworkStatus,
} from './src/types';

SplashScreen.preventAutoHideAsync().catch(() => {});

type ActiveTab = 'deck' | 'fun' | 'drop' | 'terminal';

function DeckCompMain() {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<ActiveTab>('deck');
  const [hostAddressLoaded, setHostAddressLoaded] = useState(false);
  const [hostConfig, setHostConfig] = useState<HostConfig>(DEFAULT_HOST_CONFIG);
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>('checking');
  const [hostname, setHostname] = useState<string | null>(null);
  const [hostTelemetry, setHostTelemetry] = useState<HostTelemetry | null>(null);
  const [mediaStatus, setMediaStatus] = useState<MediaStatus | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [configModalVisible, setConfigModalVisible] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Multi-device and Onboarding state
  const [devices, setDevices] = useState<DeviceConfig[]>([]);
  const [currentDevice, setCurrentDevice] = useState<DeviceConfig | null>(null);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [pairingModalVisible, setPairingModalVisible] = useState(false);
  const [onboardingVisible, setOnboardingVisible] = useState(false);

  // Client battery state
  const [clientBattery, setClientBattery] = useState<ClientBattery>({
    batteryLevel: null,
    batteryState: 'unknown',
    isLowPower: false,
  });

  // Action toast HUD feedback
  const [toastHUD, setToastHUD] = useState<{ message: string; isError?: boolean } | null>(null);
  const autoDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerToastHUD = useCallback((msg: string, isError = false) => {
    setToastHUD({ message: msg, isError });
    if (autoDismissTimerRef.current) {
      clearTimeout(autoDismissTimerRef.current);
    }
    autoDismissTimerRef.current = setTimeout(() => {
      setToastHUD(null);
    }, 3200);
  }, []);

  const isMountedRef = useRef(true);
  const isPollingRef = useRef(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const backgroundPollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const apiClientRef = useRef<ApiClient | null>(null);
  const configGenRef = useRef(0);
  const notifiedSharesRef = useRef<Set<string>>(new Set());
  const failedPingsCountRef = useRef(0);
  const clientBatteryRef = useRef(clientBattery);

  useEffect(() => {
    clientBatteryRef.current = clientBattery;
  }, [clientBattery]);

  // Check and apply OTA updates every 2 days
  useEffect(() => {
    checkAndApplyPeriodicUpdate().catch(() => {});
    // Periodic check every 12 hours for long-running app sessions
    const periodicTimer = setInterval(() => {
      checkAndApplyPeriodicUpdate().catch(() => {});
    }, 12 * 60 * 60 * 1000);
    return () => clearInterval(periodicTimer);
  }, []);

  // Initialize Host Config from AsyncStorage
  useEffect(() => {
    isMountedRef.current = true;

    async function initStorage() {
      try {
        const stored = await loadHostConfig();
        const devList = await loadDevices();
        const activeId = await getActiveDeviceId();
        const activeDev = devList.find((d) => d.id === activeId) || devList[0] || null;

        if (isMountedRef.current) {
          setDevices(devList);
          setCurrentDevice(activeDev);
          const targetIp = activeDev ? activeDev.hostIp : (stored.hostIp || '');
          const targetPort = activeDev ? activeDev.hostPort : (stored.hostPort || 8088);
          const targetAuth = activeDev ? activeDev.authToken : stored.authToken;
          const mergedConfig: HostConfig = {
            hostIp: targetIp,
            hostPort: targetPort,
            enableFunTab: stored.enableFunTab,
            authToken: targetAuth,
          };
          setHostConfig(mergedConfig);
          if (targetIp && targetIp.trim()) {
            apiClientRef.current = new ApiClient(mergedConfig);
          } else {
            apiClientRef.current = null;
          }
          setHostAddressLoaded(true);
        }

        const onboardingDone = await isOnboardingCompleted();
        if (isMountedRef.current && !onboardingDone) {
          setOnboardingVisible(true);
        }

        // Initialize persistent silent notification listener (background only) + incoming file alerts
        initNotificationService(
          () => apiClientRef.current,
          undefined,
          () => {
            if (isMountedRef.current) {
              setActiveTab('drop');
            }
          }
        ).catch(() => {});
      } catch {
        if (isMountedRef.current) {
          setHostAddressLoaded(true);
        }
      } finally {
        await SplashScreen.hideAsync().catch(() => {});
      }
    }

    initStorage();

    return () => {
      isMountedRef.current = false;
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      if (backgroundPollTimerRef.current) {
        clearInterval(backgroundPollTimerRef.current);
        backgroundPollTimerRef.current = null;
      }
    };
  }, []);

  // Initialize expo-battery listeners
  useEffect(() => {
    let levelSub: Battery.Subscription | null = null;
    let stateSub: Battery.Subscription | null = null;
    let powerSub: Battery.Subscription | null = null;

    async function setupBattery() {
      try {
        const level = await Battery.getBatteryLevelAsync();
        const state = await Battery.getBatteryStateAsync();
        const lowPower = await Battery.isLowPowerModeEnabledAsync();

        const stateNameMap: Record<number, string> = {
          0: 'unknown',
          1: 'unplugged',
          2: 'charging',
          3: 'full',
        };

        if (isMountedRef.current) {
          setClientBattery({
            batteryLevel: level >= 0 ? level : null,
            batteryState: stateNameMap[state] || 'unplugged',
            isLowPower: lowPower,
          });
        }

        levelSub = Battery.addBatteryLevelListener(({ batteryLevel }) => {
          if (isMountedRef.current) {
            setClientBattery((prev) => ({
              ...prev,
              batteryLevel: batteryLevel >= 0 ? batteryLevel : null,
            }));
          }
        });

        stateSub = Battery.addBatteryStateListener(({ batteryState }) => {
          if (isMountedRef.current) {
            setClientBattery((prev) => ({
              ...prev,
              batteryState: stateNameMap[batteryState] || 'unplugged',
            }));
          }
        });

        powerSub = Battery.addLowPowerModeListener(({ lowPowerMode }) => {
          if (isMountedRef.current) {
            setClientBattery((prev) => ({ ...prev, isLowPower: lowPowerMode }));
          }
        });
      } catch {
        // Battery API not available in simulator / environment
      }
    }

    setupBattery();

    return () => {
      levelSub?.remove();
      stateSub?.remove();
      powerSub?.remove();
    };
  }, []);

  // Primary data fetcher with error isolation
  const fetchWorkstationData = useCallback(async () => {
    if (!apiClientRef.current || !hostAddressLoaded) return;
    if (isPollingRef.current) return;
    if (!hostConfig.hostIp || !hostConfig.hostIp.trim()) {
      setNetworkStatus('offline');
      setHostname(null);
      return;
    }

    isPollingRef.current = true;
    const currentGen = configGenRef.current;
    const client = apiClientRef.current;

    try {
      // 1. Health check (determines overall host reachability)
      const health = await client.healthCheck();
      if (!isMountedRef.current || configGenRef.current !== currentGen) return;

      failedPingsCountRef.current = 0;
      setHostname(health.hostname);
      setNetworkStatus('online');
      setErrorMessage(null);
      showPersistentNotification(health.hostname || currentDevice?.name || 'Linux Workstation');

      // 2. Fetch Telemetry, Media & Pending Outbox Shares independently
      const [telemetryRes, mediaRes, sharesRes] = await Promise.allSettled([
        client.getHostTelemetry(),
        client.getMediaStatus(),
        client.listPendingShares(),
      ]);

      if (!isMountedRef.current || configGenRef.current !== currentGen) return;

      if (telemetryRes.status === 'fulfilled') {
        setHostTelemetry(telemetryRes.value);
      }
      if (mediaRes.status === 'fulfilled') {
        setMediaStatus(mediaRes.value);
      }
      if (sharesRes.status === 'fulfilled' && Array.isArray(sharesRes.value)) {
        for (const share of sharesRes.value) {
          if (!notifiedSharesRef.current.has(share.id)) {
            notifiedSharesRef.current.add(share.id);
            notifyIncomingFileFromHost(share, health.hostname || currentDevice?.name || 'Linux Workstation');
          }
        }
      }

      // 3. Sync client battery if available
      const currentBat = clientBatteryRef.current;
      if (currentBat.batteryLevel !== null) {
        client.sendClientTelemetry(
          currentBat.batteryLevel,
          currentBat.batteryState,
          'Android Client'
        ).catch(() => {});
      }
    } catch (err: unknown) {
      if (isMountedRef.current && configGenRef.current === currentGen) {
        failedPingsCountRef.current += 1;
        // Require 2 consecutive failed health checks before transitioning to offline banner
        if (failedPingsCountRef.current >= 2) {
          setNetworkStatus('offline');
          setErrorMessage(formatErrorMessage(err, 'Host is disconnected'));
        }
      }
    } finally {
      isPollingRef.current = false;
    }
  }, [hostAddressLoaded, hostConfig.hostIp]);

  // Lightweight background poller: checks for incoming files from host when app is minimized
  const checkPendingSharesInBackground = useCallback(async () => {
    const client = apiClientRef.current;
    if (!client) return;
    try {
      const shares = await client.listPendingShares();
      if (Array.isArray(shares)) {
        for (const share of shares) {
          if (!notifiedSharesRef.current.has(share.id)) {
            notifiedSharesRef.current.add(share.id);
            notifyIncomingFileFromHost(
              share,
              hostname || currentDevice?.name || 'Linux Workstation'
            );
          }
        }
      }
    } catch {
      // Silently ignore background network errors
    }
  }, [hostname, currentDevice?.name]);

  // Periodic polling management with 12s interval and AppState guard
  useEffect(() => {
    if (!hostAddressLoaded) return;

    fetchWorkstationData();

    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        if (backgroundPollTimerRef.current) {
          clearInterval(backgroundPollTimerRef.current);
          backgroundPollTimerRef.current = null;
        }
        fetchWorkstationData();
        checkAndApplyPeriodicUpdate().catch(() => {});
        if (!pollTimerRef.current) {
          pollTimerRef.current = setInterval(fetchWorkstationData, 12000);
        }
      } else {
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
        }
        if (!backgroundPollTimerRef.current) {
          backgroundPollTimerRef.current = setInterval(checkPendingSharesInBackground, 4000);
          checkPendingSharesInBackground();
        }
      }
    };

    const sub = AppState.addEventListener('change', handleAppStateChange);
    pollTimerRef.current = setInterval(fetchWorkstationData, 12000);

    return () => {
      sub.remove();
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      if (backgroundPollTimerRef.current) {
        clearInterval(backgroundPollTimerRef.current);
        backgroundPollTimerRef.current = null;
      }
    };
  }, [hostAddressLoaded, fetchWorkstationData, checkPendingSharesInBackground]);

  // Manual pull-to-refresh: immediately re-reads phone battery and workstation metrics
  const handleRefresh = async () => {
    failedPingsCountRef.current = 0;
    setRefreshing(true);
    try {
      // 1. Fresh query for phone battery metrics
      const [level, state, lowPower] = await Promise.all([
        Battery.getBatteryLevelAsync().catch(() => -1),
        Battery.getBatteryStateAsync().catch(() => 0),
        Battery.isLowPowerModeEnabledAsync().catch(() => false),
      ]);

      const stateNameMap: Record<number, string> = {
        0: 'unknown',
        1: 'unplugged',
        2: 'charging',
        3: 'full',
      };

      if (isMountedRef.current) {
        setClientBattery({
          batteryLevel: level >= 0 ? level : null,
          batteryState: stateNameMap[state] || 'unplugged',
          isLowPower: lowPower,
        });
      }

      // 2. Force refetch workstation data (bypass isPollingRef lock)
      isPollingRef.current = false;
      await fetchWorkstationData();
    } finally {
      if (isMountedRef.current) {
        setRefreshing(false);
      }
    }
  };

  // Device switching and management
  const handleSelectDevice = async (device: DeviceConfig) => {
    failedPingsCountRef.current = 0;
    setCurrentDevice(device);
    setHostname(null);
    setHostTelemetry(null);
    setMediaStatus(null);
    await setActiveDeviceId(device.id);
    const updatedConfig: HostConfig = {
      hostIp: device.hostIp,
      hostPort: device.hostPort,
      enableFunTab: hostConfig.enableFunTab,
      authToken: device.authToken,
    };
    await saveHostConfig(updatedConfig);
    configGenRef.current += 1;
    setHostConfig(updatedConfig);
    apiClientRef.current = new ApiClient(updatedConfig);
    setNetworkStatus('checking');
    await fetchWorkstationData();
  };

  const handlePairSuccess = async (newDevice: DeviceConfig) => {
    const updated = await addOrUpdateDevice(newDevice);
    setDevices(updated);
    await handleSelectDevice(newDevice);
  };

  const handleRemoveDevice = async (id: string) => {
    try {
      const updated = await removeDevice(id);
      setDevices(updated);
      if (updated.length === 0 || currentDevice?.id === id) {
        if (updated.length > 0) {
          await handleSelectDevice(updated[0]);
        } else {
          setCurrentDevice(null);
          await setActiveDeviceId('');
          const emptyConfig: HostConfig = {
            hostIp: '',
            hostPort: 8088,
            enableFunTab: hostConfig.enableFunTab,
          };
          await saveHostConfig(emptyConfig);
          configGenRef.current += 1;
          setHostConfig(emptyConfig);
          apiClientRef.current = null;
          setNetworkStatus('offline');
          setHostname(null);
          setHostTelemetry(null);
          setMediaStatus(null);
          dismissPersistentNotification().catch(() => {});
        }
      }
    } catch (err) {
      console.warn('Failed to remove device', err);
    }
  };

  const handleResetOnboarding = async () => {
    await setOnboardingCompleted(false);
    setOnboardingVisible(true);
  };

  // Save new Host Configuration with persistence verification
  const handleSaveConfig = async (newConfig: HostConfig) => {
    const mergedConfig: HostConfig = {
      ...newConfig,
      authToken: currentDevice?.authToken,
    };
    await saveHostConfig(mergedConfig);
    configGenRef.current += 1;
    setHostConfig(mergedConfig);
    if (mergedConfig.enableFunTab === false && activeTab === 'fun') {
      setActiveTab('deck');
    }
    if (mergedConfig.hostIp && mergedConfig.hostIp.trim()) {
      apiClientRef.current = new ApiClient(mergedConfig);
      setNetworkStatus('checking');
      await fetchWorkstationData();
    } else {
      apiClientRef.current = null;
      setNetworkStatus('offline');
      setHostname(null);
    }
  };

  const isWorkstationPaired = Boolean(
    devices.length > 0 && currentDevice && hostConfig.hostIp && hostConfig.hostIp.trim()
  );

  return (
    <View style={[styles.mainContainer, { paddingTop: insets.top }]}>
      <StatusBar style="light" />

      {/* Action / Sync Feedback Toast HUD */}
      <ToastHUD
        message={toastHUD?.message ?? null}
        isError={toastHUD?.isError}
        onDismiss={() => setToastHUD(null)}
      />

      {/* App Header with Hamburger Menu */}
      <Header
        hostIp={hostConfig.hostIp}
        hostPort={hostConfig.hostPort}
        networkStatus={networkStatus}
        hostname={hostname}
        isPaired={isWorkstationPaired}
        onOpenConfig={() => setConfigModalVisible(true)}
        onOpenDrawer={() => setDrawerVisible(true)}
      />

      {networkStatus === 'offline' && isWorkstationPaired && (
        <OfflineBanner
          onRetry={fetchWorkstationData}
          errorMessage={errorMessage}
        />
      )}

      {/* Main Content Area */}
      {!isWorkstationPaired ? (
        <View style={styles.unpairedContainer}>
          <View style={styles.unpairedCard}>
            <View style={styles.unpairedIconCircle}>
              <Laptop size={36} color={Palette.mauve} />
            </View>
            <Text style={styles.unpairedTitle}>Workstation Required</Text>
            <Text style={styles.unpairedSub}>
              Pair your Linux computer running the DeckComp companion server to enable remote controls, file drop, media sync, and terminal visualizers.
            </Text>

            <TouchableOpacity
              style={styles.pairPrimaryBtn}
              onPress={() => setPairingModalVisible(true)}
              activeOpacity={0.8}
            >
              <Radio size={16} color={Palette.crust} style={{ marginRight: 6 }} />
              <Text style={styles.pairPrimaryBtnText}>Pair Workstation</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.pairSecondaryBtn}
              onPress={() => setConfigModalVisible(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.pairSecondaryBtnText}>Connection Settings</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : activeTab === 'fun' ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={true}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={Palette.mauve}
              colors={[Palette.mauve, Palette.blue]}
              progressBackgroundColor={Palette.mantle}
            />
          }
        >
          <FunStuffDeck apiClient={apiClientRef.current} />
        </ScrollView>
      ) : activeTab === 'drop' ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={true}
          keyboardShouldPersistTaps="handled"
        >
          <FileDropDeck apiClient={apiClientRef.current} />
        </ScrollView>
      ) : (
        <View style={styles.staticTabContainer}>
          {activeTab === 'deck' && (
            <View style={styles.deckContainer}>
              <TelemetryDeck
                hostTelemetry={hostTelemetry}
                clientBattery={clientBattery}
              />
              <MediaDeck
                mediaStatus={mediaStatus}
                apiClient={apiClientRef.current}
                onRefresh={fetchWorkstationData}
              />
              <QuickActionsDeck apiClient={apiClientRef.current} />
            </View>
          )}

          {activeTab === 'terminal' && (
            <RemoteConsoleDeck apiClient={apiClientRef.current} />
          )}
        </View>
      )}

      {/* Bottom Navigation Tab Bar */}
      {isWorkstationPaired && (
        <View
          style={[
            styles.tabBar,
            {
              paddingBottom: Math.max(insets.bottom, 12),
              paddingTop: 8,
            },
          ]}
        >
          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'deck' ? styles.activeTabItem : null]}
            onPress={() => setActiveTab('deck')}
            activeOpacity={0.7}
          >
            <SlidersHorizontal
              size={19}
              color={activeTab === 'deck' ? Palette.mauve : Palette.subtext0}
            />
            <Text
              style={[
                styles.tabLabel,
                activeTab === 'deck' ? styles.activeTabLabel : null,
              ]}
            >
              Controls
            </Text>
          </TouchableOpacity>

          {hostConfig.enableFunTab !== false && (
            <TouchableOpacity
              style={[styles.tabItem, activeTab === 'fun' ? styles.activeTabItem : null]}
              onPress={() => setActiveTab('fun')}
              activeOpacity={0.7}
            >
              <LayoutGrid
                size={19}
                color={activeTab === 'fun' ? Palette.mauve : Palette.subtext0}
              />
              <Text
                style={[
                  styles.tabLabel,
                  activeTab === 'fun' ? styles.activeTabLabel : null,
                ]}
              >
                Visuals
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'drop' ? styles.activeTabItem : null]}
            onPress={() => setActiveTab('drop')}
            activeOpacity={0.7}
          >
            <Upload
              size={19}
              color={activeTab === 'drop' ? Palette.mauve : Palette.subtext0}
            />
            <Text
              style={[
                styles.tabLabel,
                activeTab === 'drop' ? styles.activeTabLabel : null,
              ]}
            >
              File Drop
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'terminal' ? styles.activeTabItem : null]}
            onPress={() => setActiveTab('terminal')}
            activeOpacity={0.7}
          >
            <Terminal
              size={19}
              color={activeTab === 'terminal' ? Palette.mauve : Palette.subtext0}
            />
            <Text
              style={[
                styles.tabLabel,
                activeTab === 'terminal' ? styles.activeTabLabel : null,
              ]}
            >
              Terminal
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Side Hamburger Drawer */}
      <SideDrawer
        visible={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        currentDevice={currentDevice}
        devices={devices}
        networkStatus={networkStatus}
        onSelectDevice={handleSelectDevice}
        onRemoveDevice={handleRemoveDevice}
        onOpenPairingModal={() => setPairingModalVisible(true)}
        onOpenSettings={() => setConfigModalVisible(true)}
        onResetOnboarding={handleResetOnboarding}
      />

      {/* KDE Connect-Style Pairing Modal */}
      <PairingModal
        visible={pairingModalVisible}
        onClose={() => setPairingModalVisible(false)}
        onPairSuccess={handlePairSuccess}
        initialIp={hostConfig.hostIp}
      />

      {/* Onboarding Tour (First Launch Only) */}
      <OnboardingModal
        visible={onboardingVisible}
        onComplete={(newDev) => {
          setOnboardingVisible(false);
          if (newDev) {
            handlePairSuccess(newDev);
          }
        }}
      />

      {/* Host Configuration Modal */}
      <HostConfigModal
        visible={configModalVisible}
        currentConfig={hostConfig}
        onClose={() => setConfigModalVisible(false)}
        onSave={handleSaveConfig}
      />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <DeckCompMain />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    backgroundColor: Palette.base,
  },
  staticTabContainer: {
    flex: 1,
    backgroundColor: Palette.base,
  },
  deckContainer: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  scroll: {
    flex: 1,
    backgroundColor: Palette.base,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: Palette.mantle,
    borderTopWidth: 1,
    borderTopColor: Palette.surface0,
    paddingHorizontal: 16,
    justifyContent: 'space-around',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  activeTabItem: {},
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Palette.subtext0,
  },
  activeTabLabel: {
    color: Palette.mauve,
    fontWeight: '700',
  },
  unpairedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    backgroundColor: Palette.base,
  },
  unpairedCard: {
    width: '100%',
    backgroundColor: Palette.surface0,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Palette.surface1,
  },
  unpairedIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(203, 166, 247, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(203, 166, 247, 0.25)',
  },
  unpairedTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Palette.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  unpairedSub: {
    fontSize: 13,
    color: Palette.subtext0,
    lineHeight: 19,
    textAlign: 'center',
    marginBottom: 24,
  },
  pairPrimaryBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.mauve,
    paddingVertical: 13,
    borderRadius: 10,
    marginBottom: 10,
  },
  pairPrimaryBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: Palette.crust,
  },
  pairSecondaryBtn: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.surface1,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Palette.surface2,
  },
  pairSecondaryBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: Palette.subtext0,
  },
});
