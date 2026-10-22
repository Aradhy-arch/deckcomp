import {
  Check,
  HelpCircle,
  Laptop,
  Plus,
  Radio,
  Settings,
  Trash2,
  X,
} from 'lucide-react-native';
import React, { useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Palette } from '../constants/theme';
import { DeviceConfig } from '../types';
import { ConfirmModal } from './ConfirmModal';

interface SideDrawerProps {
  visible: boolean;
  onClose: () => void;
  currentDevice: DeviceConfig;
  devices: DeviceConfig[];
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
  onSelectDevice,
  onRemoveDevice,
  onOpenPairingModal,
  onOpenSettings,
  onResetOnboarding,
}) => {
  const [unpairTarget, setUnpairTarget] = useState<{ id: string; name: string } | null>(null);
  const [warningModal, setWarningModal] = useState<{ title: string; message: string } | null>(null);

  const confirmDelete = (id: string, name: string) => {
    if (devices.length <= 1) {
      setWarningModal({
        title: 'Cannot Remove',
        message: 'You must have at least one configured workstation.',
      });
      return;
    }
    setUnpairTarget({ id, name });
  };

  const handlePerformUnpair = () => {
    if (unpairTarget) {
      onRemoveDevice(unpairTarget.id);
      setUnpairTarget(null);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity
          style={styles.backdropTouchable}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={styles.drawerCard}>
          {/* Drawer Header */}
          <View style={styles.drawerHeader}>
            <View style={styles.headerTitleRow}>
              <Laptop size={20} color={Palette.mauve} />
              <Text style={styles.headerTitle}>Workstation Manager</Text>
            </View>
            <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
              <X size={20} color={Palette.subtext0} />
            </TouchableOpacity>
          </View>

          <Text style={styles.subHeader}>
            Switch effortlessly between workstations without re-entering IP addresses:
          </Text>

          {/* Saved Workstations List */}
          <ScrollView style={styles.deviceList} showsVerticalScrollIndicator={false}>
            {devices.map((device) => {
              const isActive = device.id === currentDevice.id;
              return (
                <View
                  key={device.id}
                  style={[styles.deviceCard, isActive ? styles.activeDeviceCard : null]}
                >
                  <TouchableOpacity
                    style={styles.deviceSelectable}
                    onPress={() => {
                      onSelectDevice(device);
                      onClose();
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.deviceLeft}>
                      <View style={[styles.deviceIconCircle, isActive ? styles.activeIconCircle : null]}>
                        <Radio size={16} color={isActive ? Palette.mauve : Palette.overlay0} />
                      </View>
                      <View style={styles.deviceInfo}>
                        <View style={styles.nameRow}>
                          <Text style={styles.deviceName} numberOfLines={1}>
                            {device.name}
                          </Text>
                          {isActive && (
                            <View style={styles.activeTag}>
                              <Text style={styles.activeTagText}>Active</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.deviceSub}>
                          {device.hostIp}:{device.hostPort}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>

                  {/* Delete button (only if more than 1 device) */}
                  {devices.length > 1 && (
                    <TouchableOpacity
                      style={styles.deleteBtn}
                      onPress={() => confirmDelete(device.id, device.name)}
                      activeOpacity={0.7}
                    >
                      <Trash2 size={15} color={Palette.overlay0} />
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </ScrollView>

          {/* Add / Pair New Device Button */}
          <TouchableOpacity
            style={styles.addDeviceBtn}
            onPress={() => {
              onClose();
              onOpenPairingModal();
            }}
            activeOpacity={0.7}
          >
            <Plus size={16} color={Palette.crust} />
            <Text style={styles.addDeviceText}>Pair New Workstation</Text>
          </TouchableOpacity>

          {/* Bottom Settings & Tour Links */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.footerItem}
              onPress={() => {
                onClose();
                onOpenSettings();
              }}
              activeOpacity={0.7}
            >
              <Settings size={16} color={Palette.subtext0} />
              <Text style={styles.footerItemText}>Host Configuration</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.footerItem}
              onPress={() => {
                onClose();
                onResetOnboarding();
              }}
              activeOpacity={0.7}
            >
              <HelpCircle size={16} color={Palette.subtext0} />
              <Text style={styles.footerItemText}>App Onboarding Tour</Text>
            </TouchableOpacity>
          </View>
        </View>

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

        {/* Warning Modal (when only 1 device remains) */}
        <ConfirmModal
          visible={warningModal !== null}
          title={warningModal?.title || 'Notice'}
          message={warningModal?.message || ''}
          confirmText="Understood"
          cancelText="Close"
          isDestructive={false}
          onConfirm={() => setWarningModal(null)}
          onCancel={() => setWarningModal(null)}
        />
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(17, 17, 27, 0.75)',
    flexDirection: 'row',
  },
  backdropTouchable: {
    flex: 1,
  },
  drawerCard: {
    width: '84%',
    maxWidth: 340,
    backgroundColor: Palette.mantle,
    padding: 20,
    borderRightWidth: 1,
    borderRightColor: Palette.surface1,
    justifyContent: 'space-between',
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
  deviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Palette.surface0,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: Palette.surface1,
    marginBottom: 8,
  },
  activeDeviceCard: {
    borderColor: Palette.mauve,
    backgroundColor: Palette.surface1,
  },
  deviceSelectable: {
    flex: 1,
    marginRight: 8,
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
    gap: 6,
  },
  deviceName: {
    fontSize: 13,
    fontWeight: '700',
    color: Palette.text,
  },
  activeTag: {
    backgroundColor: Palette.mauve,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  activeTagText: {
    fontSize: 9,
    fontWeight: '800',
    color: Palette.crust,
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
  },
  addDeviceText: {
    color: Palette.crust,
    fontSize: 13,
    fontWeight: '700',
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: Palette.surface0,
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
});
