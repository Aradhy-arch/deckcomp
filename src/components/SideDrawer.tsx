import {
  HelpCircle,
  Laptop,
  Plus,
  Radio,
  RefreshCw,
  Settings,
  Trash2,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Palette } from '../constants/theme';
import {
  checkAndApplyPeriodicUpdate,
  formatLastOtaCheckTime,
  getLastOtaCheckTime,
} from '../services/updateService';
import { DeviceConfig, NetworkStatus } from '../types';
import { ConfirmModal } from './ConfirmModal';

const DRAWER_WIDTH = Math.min(320, Dimensions.get('window').width * 0.82);

interface SideDrawerProps {
  visible: boolean;
  onClose: () => void;
  currentDevice: DeviceConfig | null;
  devices: DeviceConfig[];
  networkStatus: NetworkStatus;
  onSelectDevice: (device: DeviceConfig) => void;
  onRemoveDevice: (id: string) => void;
  onOpenPairingModal: () => void;
  onOpenSettings: () => void;
  onResetOnboarding: () => void;
}

export const SideDrawer: React.FC<SideDrawerProps> = ({
  visible,
  onClose,
  currentDevice,
  devices,
  networkStatus,
  onSelectDevice,
  onRemoveDevice,
  onOpenPairingModal,
  onOpenSettings,
  onResetOnboarding,
}) => {
  const [unpairTarget, setUnpairTarget] = useState<{ id: string; name: string } | null>(null);
  const [modalVisible, setModalVisible] = useState(visible);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateStatusText, setUpdateStatusText] = useState<string | null>(null);
  const [lastCheckText, setLastCheckText] = useState<string>('');
  const isClosingRef = useRef(false);

  const handleCheckForUpdates = async () => {
    setCheckingUpdate(true);
    setUpdateStatusText('Checking...');
    try {
      const res = await checkAndApplyPeriodicUpdate({
        force: true,
        onStatusMessage: (msg) => setUpdateStatusText(msg),
      });

      if (res.status === 'skipped_dev') {
        setUpdateStatusText('Disabled in Dev');
        setTimeout(() => setUpdateStatusText(null), 3000);
      } else if (res.status === 'up_to_date') {
        setUpdateStatusText('App is up to date!');
        setLastCheckText('Just now');
        setTimeout(() => setUpdateStatusText(null), 3500);
      } else if (res.status === 'deferred_transfer') {
        setUpdateStatusText('Update queued after transfers');
        setTimeout(() => setUpdateStatusText(null), 4000);
      } else if (res.status === 'error') {
        setUpdateStatusText('Check failed (offline)');
        setTimeout(() => setUpdateStatusText(null), 3500);
      }
    } catch {
      setUpdateStatusText('Check failed (offline)');
      setTimeout(() => setUpdateStatusText(null), 3500);
    } finally {
      setCheckingUpdate(false);
      getLastOtaCheckTime().then((ts) => setLastCheckText(formatLastOtaCheckTime(ts)));
    }
  };

  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      getLastOtaCheckTime().then((ts) => setLastCheckText(formatLastOtaCheckTime(ts)));
      isClosingRef.current = false;
      setModalVisible(true);
      slideAnim.setValue(-DRAWER_WIDTH);
      fadeAnim.setValue(0);
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 260,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      if (modalVisible && !isClosingRef.current) {
        isClosingRef.current = true;
        Animated.parallel([
          Animated.timing(slideAnim, {
            toValue: -DRAWER_WIDTH,
            duration: 200,
            easing: Easing.in(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(fadeAnim, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }),
        ]).start(() => {
          isClosingRef.current = false;
          setModalVisible(false);
        });
      }
    }
  }, [visible]);

  const handleClose = () => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: -DRAWER_WIDTH,
        duration: 200,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      isClosingRef.current = false;
      setModalVisible(false);
      onClose();
    });
  };

  const confirmDelete = (id: string, name: string) => {
    setUnpairTarget({ id, name });
  };

  const handlePerformUnpair = () => {
    if (unpairTarget) {
      onRemoveDevice(unpairTarget.id);
      setUnpairTarget(null);
    }
  };

  const getStatusBadge = (isActive: boolean) => {
    if (!isActive) {
      return (
        <View style={styles.savedTag}>
          <Text style={styles.savedTagText}>Saved</Text>
        </View>
      );
    }

    if (networkStatus === 'online') {
      return (
        <View style={styles.onlineTag}>
          <View style={[styles.statusDot, { backgroundColor: Palette.green }]} />
          <Text style={styles.onlineTagText}>Online</Text>
        </View>
      );
    }

    if (networkStatus === 'checking') {
      return (
        <View style={styles.checkingTag}>
          <View style={[styles.statusDot, { backgroundColor: Palette.yellow }]} />
          <Text style={styles.checkingTagText}>Connecting...</Text>
        </View>
      );
    }

    return (
      <View style={styles.offlineTag}>
        <View style={[styles.statusDot, { backgroundColor: Palette.red }]} />
        <Text style={styles.offlineTagText}>Disconnected</Text>
      </View>
    );
  };

  return (
    <Modal visible={modalVisible} transparent animationType="none" onRequestClose={handleClose}>
      <View style={styles.modalRoot}>
        {/* Animated Semi-transparent Dimming Backdrop */}
        <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
          <TouchableOpacity
            style={styles.backdropTouchable}
            activeOpacity={1}
            onPress={handleClose}
          />
        </Animated.View>

        {/* Translucent Glassmorphic Drawer Sliding from Left */}
        <Animated.View
          style={[
            styles.drawerCard,
            {
              width: DRAWER_WIDTH,
              transform: [{ translateX: slideAnim }],
            },
          ]}
        >
          {/* Drawer Header */}
          <View style={styles.drawerHeader}>
            <View style={styles.headerTitleRow}>
              <Laptop size={19} color={Palette.mauve} />
              <Text style={styles.headerTitle}>Workstation Manager</Text>
            </View>
            <TouchableOpacity onPress={handleClose} activeOpacity={0.7} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <X size={19} color={Palette.subtext0} />
            </TouchableOpacity>
          </View>

          <Text style={styles.subHeader}>
            Paired Linux computers available for remote control & file transfer:
          </Text>

          {/* Device List or Clean Empty State */}
          <ScrollView style={styles.deviceList} showsVerticalScrollIndicator={false}>
            {devices.length === 0 ? (
              <View style={styles.emptyContainer}>
                <WifiOff size={32} color={Palette.overlay0} style={styles.emptyIcon} />
                <Text style={styles.emptyTitle}>No Workstations Paired</Text>
                <Text style={styles.emptySub}>
                  No Linux hosts connected yet. Tap "Pair New Workstation" below to discover your desktop via local network or QR code.
                </Text>
              </View>
            ) : (
              devices.map((device) => {
                const isActive = currentDevice?.id === device.id;
                return (
                  <View
                    key={device.id}
                    style={[styles.deviceCard, isActive ? styles.activeDeviceCard : null]}
                  >
                    <TouchableOpacity
                      style={styles.deviceSelectable}
                      onPress={() => {
                        onSelectDevice(device);
                        handleClose();
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={styles.deviceLeft}>
                        <View style={[styles.deviceIconCircle, isActive ? styles.activeIconCircle : null]}>
                          <Radio size={15} color={isActive ? Palette.mauve : Palette.overlay0} />
                        </View>
                        <View style={styles.deviceInfo}>
                          <View style={styles.nameRow}>
                            <Text style={styles.deviceName} numberOfLines={1} ellipsizeMode="tail">
                              {device.name}
                            </Text>
                            {getStatusBadge(isActive)}
                          </View>
                          <Text style={styles.deviceSub} numberOfLines={1} ellipsizeMode="middle">
                            {device.hostIp}:{device.hostPort}
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>

                    {/* Unpair button is available for every workstation */}
                    <TouchableOpacity
                      style={styles.deleteBtn}
                      onPress={() => confirmDelete(device.id, device.name)}
                      activeOpacity={0.7}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Trash2 size={15} color={Palette.overlay0} />
                    </TouchableOpacity>
                  </View>
                );
              })
            )}
          </ScrollView>

          {/* Add / Pair New Device Button */}
          <TouchableOpacity
            style={styles.addDeviceBtn}
            onPress={() => {
              handleClose();
              onOpenPairingModal();
            }}
            activeOpacity={0.75}
          >
            <Plus size={16} color={Palette.crust} />
            <Text style={styles.addDeviceText}>Pair New Workstation</Text>
          </TouchableOpacity>

          {/* Bottom Settings & Tour Links */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.footerItem}
              onPress={() => {
                handleClose();
                onOpenSettings();
              }}
              activeOpacity={0.7}
            >
              <Settings size={15} color={Palette.subtext0} />
              <Text style={styles.footerItemText}>Host Configuration</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.footerItem}
              onPress={() => {
                handleClose();
                onResetOnboarding();
              }}
              activeOpacity={0.7}
            >
              <HelpCircle size={15} color={Palette.subtext0} />
              <Text style={styles.footerItemText}>App Onboarding Tour</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.footerItem}
              onPress={handleCheckForUpdates}
              disabled={checkingUpdate}
              activeOpacity={0.7}
            >
              <RefreshCw size={15} color={checkingUpdate ? Palette.mauve : Palette.subtext0} />
              <View style={styles.updateTextContainer}>
                <Text style={[styles.footerItemText, updateStatusText ? { color: Palette.mauve } : null]}>
                  {updateStatusText || 'Check for App Updates'}
                </Text>
                <Text style={styles.updateCadenceText}>
                  Auto-checks every 2 days {lastCheckText ? `• Last: ${lastCheckText}` : ''}
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* Unpair Confirmation Modal */}
        <ConfirmModal
          visible={unpairTarget !== null}
          title="Unpair Workstation"
          message={`Remove "${unpairTarget?.name}" from your saved devices? This workstation will be disconnected.`}
          confirmText="Unpair"
          cancelText="Cancel"
          isDestructive={true}
          onConfirm={handlePerformUnpair}
          onCancel={() => setUnpairTarget(null)}
        />
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    position: 'relative',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(17, 17, 27, 0.65)',
  },
  backdropTouchable: {
    flex: 1,
  },
  drawerCard: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(24, 24, 37, 0.94)',
    paddingTop: 48,
    paddingHorizontal: 18,
    paddingBottom: 24,
    borderRightWidth: 1,
    borderRightColor: 'rgba(205, 214, 244, 0.12)',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 16,
  },
  drawerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Palette.mauve,
    letterSpacing: -0.2,
  },
  subHeader: {
    fontSize: 11,
    color: Palette.overlay0,
    marginBottom: 16,
    lineHeight: 16,
  },
  deviceList: {
    flex: 1,
    marginBottom: 12,
  },
  emptyContainer: {
    paddingVertical: 36,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(30, 30, 46, 0.6)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(205, 214, 244, 0.08)',
    borderStyle: 'dashed',
    marginTop: 12,
  },
  emptyIcon: {
    marginBottom: 10,
    opacity: 0.6,
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Palette.subtext0,
    marginBottom: 6,
    textAlign: 'center',
  },
  emptySub: {
    fontSize: 11,
    color: Palette.overlay0,
    textAlign: 'center',
    lineHeight: 16,
  },
  deviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(49, 50, 68, 0.65)',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(205, 214, 244, 0.1)',
    marginBottom: 8,
  },
  activeDeviceCard: {
    borderColor: Palette.mauve,
    backgroundColor: 'rgba(49, 50, 68, 0.95)',
  },
  deviceSelectable: {
    flex: 1,
    marginRight: 6,
  },
  deviceLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  deviceIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Palette.mantle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeIconCircle: {
    backgroundColor: Palette.surface0,
  },
  deviceInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: 4,
    gap: 6,
  },
  deviceName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: Palette.text,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  onlineTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(166, 227, 161, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  onlineTagText: {
    fontSize: 9,
    fontWeight: '800',
    color: Palette.green,
  },
  checkingTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(249, 226, 175, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  checkingTagText: {
    fontSize: 9,
    fontWeight: '800',
    color: Palette.yellow,
  },
  offlineTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(243, 139, 168, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  offlineTagText: {
    fontSize: 9,
    fontWeight: '800',
    color: Palette.red,
  },
  savedTag: {
    backgroundColor: Palette.surface1,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  savedTagText: {
    fontSize: 9,
    fontWeight: '700',
    color: Palette.overlay0,
  },
  deviceSub: {
    fontSize: 10,
    color: Palette.overlay0,
    marginTop: 2,
    fontFamily: 'monospace',
  },
  deleteBtn: {
    padding: 6,
  },
  addDeviceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Palette.mauve,
    borderRadius: 8,
    paddingVertical: 11,
    marginBottom: 16,
    shadowColor: Palette.mauve,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  addDeviceText: {
    color: Palette.crust,
    fontSize: 13,
    fontWeight: '700',
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(205, 214, 244, 0.08)',
    paddingTop: 12,
    gap: 10,
  },
  footerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  footerItemText: {
    fontSize: 12,
    color: Palette.subtext0,
    fontWeight: '600',
  },
  updateTextContainer: {
    flex: 1,
  },
  updateCadenceText: {
    fontSize: 10,
    color: Palette.overlay0,
    marginTop: 1,
  },
});
