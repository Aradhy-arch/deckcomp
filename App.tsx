import * as Battery from 'expo-battery';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { SlidersHorizontal, Sparkles, Terminal, Upload } from 'lucide-react-native';
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
import { ApiClient } from './src/api/client';
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
import { Palette } from './src/constants/theme';
import {
  initNotificationService,
  showPersistentNotification,
} from './src/services/notificationService';
import {
  addOrUpdateDevice,
  DEFAULT_DEVICE,
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
  const [devices, setDevices] = useState<DeviceConfig[]>([DEFAULT_DEVICE]);
  const [currentDevice, setCurrentDevice] = useState<DeviceConfig>(DEFAULT_DEVICE);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [pairingModalVisible, setPairingModalVisible] = useState(false);
  const [onboardingVisible, setOnboardingVisible] = useState(false);

  // Client battery state
  const [clientBattery, setClientBattery] = useState<ClientBattery>({
    batteryLevel: null,
    batteryState: 'unknown',
    isLowPower: false,
  });

  const isMountedRef = useRef(true);
  const isPollingRef = useRef(false);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const apiClientRef = useRef<ApiClient | null>(null);
  const configGenRef = useRef(0);

  // Initialize Host Config from AsyncStorage
  useEffect(() => {
    isMountedRef.current = true;

    async function initStorage() {
      try {
        const stored = await loadHostConfig();
        const devList = await loadDevices();
        const activeId = await getActiveDeviceId();
        const activeDev = devList.find((d) => d.id === activeId) || devList[0] || DEFAULT_DEVICE;

        if (isMountedRef.current) {
          setDevices(devList);
          setCurrentDevice(activeDev);
          const mergedConfig: HostConfig = {
            hostIp: activeDev.hostIp,
            hostPort: activeDev.hostPort,
            enableFunTab: stored.enableFunTab,
            authToken: activeDev.authToken,
          };
          setHostConfig(mergedConfig);
          apiClientRef.current = new ApiClient(mergedConfig);
          setHostAddressLoaded(true);
        }

        const onboardingDone = await isOnboardingCompleted();
        if (isMountedRef.current && !onboardingDone) {
          setOnboardingVisible(true);
        }

        initNotificationService(() => apiClientRef.current);
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
      return;
    }

    isPollingRef.current = true;
    const currentGen = configGenRef.current;
    const client = apiClientRef.current;

    try {
      // 1. Health check (determines overall host reachability)
      const health = await client.healthCheck();
      if (!isMountedRef.current || configGenRef.current !== currentGen) return;

      setHostname(health.hostname);
      setNetworkStatus('online');
      setErrorMessage(null);
      showPersistentNotification(health.hostname || currentDevice.name);

      // 2. Fetch Telemetry & Media independently
      const [telemetryRes, mediaRes] = await Promise.allSettled([
        client.getHostTelemetry(),
        client.getMediaStatus(),
      ]);

      if (!isMountedRef.current || configGenRef.current !== currentGen) return;

      if (telemetryRes.status === 'fulfilled') {
        setHostTelemetry(telemetryRes.value);
      }
      if (mediaRes.status === 'fulfilled') {
        setMediaStatus(mediaRes.value);
      }

      // 3. Sync client battery if available
      if (clientBattery.batteryLevel !== null) {
        client.sendClientTelemetry(
          clientBattery.batteryLevel,
          clientBattery.batteryState,
          'Android Client'
        ).catch(() => {});
      }
    } catch (err: unknown) {
      if (isMountedRef.current && configGenRef.current === currentGen) {
        setNetworkStatus('offline');
        setErrorMessage(err instanceof Error ? err.message : 'Connection failed');
      }
    } finally {
      isPollingRef.current = false;
    }
  }, [hostAddressLoaded, clientBattery]);

  // Periodic polling management with 12s interval and AppState guard
  useEffect(() => {
    if (!hostAddressLoaded) return;

    fetchWorkstationData();

    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        fetchWorkstationData();
        if (!pollTimerRef.current) {
          pollTimerRef.current = setInterval(fetchWorkstationData, 12000);
        }
      } else {
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
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
    };
  }, [hostAddressLoaded, fetchWorkstationData]);

  // Manual pull-to-refresh
  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchWorkstationData();
    if (isMountedRef.current) {
      setRefreshing(false);
    }
  };

  // Device switching and management
  const handleSelectDevice = async (device: DeviceConfig) => {
    setCurrentDevice(device);
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
    const updated = await removeDevice(id);
    setDevices(updated);
    if (currentDevice.id === id && updated.length > 0) {
      await handleSelectDevice(updated[0]);
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
      authToken: currentDevice.authToken,
    };
    await saveHostConfig(mergedConfig);
    configGenRef.current += 1;
    setHostConfig(mergedConfig);
    if (mergedConfig.enableFunTab === false && activeTab === 'fun') {
      setActiveTab('deck');
    }
    apiClientRef.current = new ApiClient(mergedConfig);
    setNetworkStatus('checking');
    await fetchWorkstationData();
  };

  return (
    <View style={[styles.mainContainer, { paddingTop: insets.top }]}>
      <StatusBar style="light" />

      {/* App Header with Hamburger Menu */}
      <Header
        hostIp={hostConfig.hostIp}
        hostPort={hostConfig.hostPort}
        networkStatus={networkStatus}
        hostname={hostname}
        onOpenConfig={() => setConfigModalVisible(true)}
        onOpenDrawer={() => setDrawerVisible(true)}
      />

      {networkStatus === 'offline' && (
        <OfflineBanner
          onRetry={fetchWorkstationData}
          errorMessage={errorMessage}
        />
      )}

      {/* Main Content Area */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Palette.mauve}
            colors={[Palette.mauve]}
          />
        }
      >
        {activeTab === 'deck' && (
          <>
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
          </>
        )}

        {activeTab === 'fun' && (
          <FunStuffDeck apiClient={apiClientRef.current} />
        )}

        {activeTab === 'drop' && (
          <FileDropDeck apiClient={apiClientRef.current} />
        )}

        {activeTab === 'terminal' && (
          <RemoteConsoleDeck apiClient={apiClientRef.current} />
        )}
      </ScrollView>

      {/* Bottom Navigation Tab Bar */}
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
            <Sparkles
              size={19}
              color={activeTab === 'fun' ? Palette.mauve : Palette.subtext0}
            />
            <Text
              style={[
                styles.tabLabel,
                activeTab === 'fun' ? styles.activeTabLabel : null,
              ]}
            >
              Fun Stuff
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

      {/* Side Hamburger Drawer */}
      <SideDrawer
        visible={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        currentDevice={currentDevice}
        devices={devices}
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
  activeTabItem: {
    backgroundColor: Palette.surface0,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Palette.subtext0,
  },
  activeTabLabel: {
    color: Palette.mauve,
    fontWeight: '700',
  },
});
