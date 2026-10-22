import {
  Check,
  KeyRound,
  Laptop,
  Radio,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { ApiClient } from '../api/client';
import { Palette } from '../constants/theme';
import { getLocalDeviceUuid } from '../storage/deviceStorage';
import { DeviceConfig, DiscoveredHost } from '../types';

interface PairingModalProps {
  visible: boolean;
  onClose: () => void;
  onPairSuccess: (device: DeviceConfig) => void;
  initialIp?: string;
}

export const PairingModal: React.FC<PairingModalProps> = ({
  visible,
  onClose,
  onPairSuccess,
  initialIp = '192.168.31.30',
}) => {
  const [step, setStep] = useState<'discover' | 'code'>('discover');
  const [ip, setIp] = useState(initialIp);
  const [port, setPort] = useState('8088');
  const [discoveredHosts, setDiscoveredHosts] = useState<DiscoveredHost[]>([]);
  const [scanning, setScanning] = useState(false);
  const [initiating, setInitiating] = useState(false);
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [deviceUuid, setDeviceUuid] = useState('phone');
  const [hostname, setHostname] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setStep('discover');
      setCode('');
      setErrorMsg(null);
      getLocalDeviceUuid().then(setDeviceUuid);
      runScan();
    }
  }, [visible]);

  const runScan = async () => {
    setScanning(true);
    setErrorMsg(null);
    try {
      // 1. Direct probe for default IP
      const direct = await ApiClient.scanHost(ip, parseInt(port, 10) || 8088);
      const hosts: DiscoveredHost[] = [];
      if (direct) {
        hosts.push(direct);
      }

      // 2. Discover local subnet
      const subnetBase = ip.split('.').slice(0, 3).join('.');
      const found = await ApiClient.discoverSubnet(subnetBase, parseInt(port, 10) || 8088);
      for (const h of found) {
        if (!hosts.some((existing) => existing.ip === h.ip)) {
          hosts.push(h);
        }
      }
      setDiscoveredHosts(hosts);
      if (hosts.length > 0 && !hosts.some((h) => h.ip === ip)) {
        setIp(hosts[0].ip);
      }
    } catch {
      // Fallback to manual IP
    } finally {
      setScanning(false);
    }
  };

  const handleInitiatePairing = async (targetIp?: string) => {
    const activeIp = (targetIp || ip).trim();
    const activePort = parseInt(port, 10) || 8088;
    if (!activeIp) {
      setErrorMsg('Please specify a valid IP address or select a discovered host.');
      return;
    }

    setInitiating(true);
    setErrorMsg(null);
    try {
      const client = new ApiClient({ hostIp: activeIp, hostPort: activePort });
      const health = await client.healthCheck();
      setHostname(health.hostname);

      await client.initiatePairing(deviceUuid, 'DeckComp Phone');
      setStep('code');
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Could not reach host. Verify deckcomp.service is running on the host (run "deckcomp status").'
      );
    } finally {
      setInitiating(false);
    }
  };

  const handleVerifyCode = async () => {
    const trimmedCode = code.trim();
    if (trimmedCode.length < 4) {
      setErrorMsg('Please enter the 6-digit code from your desktop notification.');
      return;
    }

    setVerifying(true);
    setErrorMsg(null);
    try {
      const activePort = parseInt(port, 10) || 8088;
      const client = new ApiClient({ hostIp: ip.trim(), hostPort: activePort });
      const res = await client.verifyPairing(deviceUuid, trimmedCode, 'DeckComp Phone');

      const pairedDevice: DeviceConfig = {
        id: `dev_${ip.trim()}_${activePort}`,
        name: hostname || res.device_name || 'Arch Linux Host',
        hostIp: ip.trim(),
        hostPort: activePort,
        isPaired: true,
        authToken: res.token,
        lastConnected: new Date().toISOString(),
      };

      onPairSuccess(pairedDevice);
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Pairing verification failed');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <View style={styles.titleRow}>
              {step === 'discover' ? (
                <Radio size={20} color={Palette.mauve} />
              ) : (
                <KeyRound size={20} color={Palette.mauve} />
              )}
              <Text style={styles.title}>
                {step === 'discover' ? 'Connect Workstation' : 'Enter Pairing Code'}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
              <X size={20} color={Palette.subtext0} />
            </TouchableOpacity>
          </View>

          {errorMsg && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          )}

          {step === 'discover' ? (
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.instruction}>
                Select an automatically discovered Arch host on your Wi-Fi, or enter its IP address:
              </Text>

              {/* Discovered Hosts List */}
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionLabel}>DISCOVERED ON LOCAL NETWORK</Text>
                <TouchableOpacity
                  style={styles.scanBtn}
                  onPress={runScan}
                  disabled={scanning}
                >
                  {scanning ? (
                    <ActivityIndicator size="small" color={Palette.mauve} />
                  ) : (
                    <RefreshCw size={12} color={Palette.subtext0} />
                  )}
                  <Text style={styles.scanBtnText}>{scanning ? 'Scanning...' : 'Rescan'}</Text>
                </TouchableOpacity>
              </View>

              {discoveredHosts.length === 0 && !scanning ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyText}>
                    No daemons discovered on Wi-Fi broadcast yet. You can pair directly via IP below:
                  </Text>
                </View>
              ) : (
                discoveredHosts.map((host) => {
                  const isSelected = host.ip === ip;
                  return (
                    <TouchableOpacity
                      key={host.ip}
                      style={[styles.hostCard, isSelected ? styles.selectedHostCard : null]}
                      onPress={() => {
                        setIp(host.ip);
                        setPort(host.port.toString());
                        handleInitiatePairing(host.ip);
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={styles.hostLeft}>
                        <View style={styles.hostIconCircle}>
                          <Laptop size={18} color={Palette.mauve} />
                        </View>
                        <View>
                          <Text style={styles.hostTitle}>{host.hostname}</Text>
                          <Text style={styles.hostSub}>{host.ip}:{host.port}</Text>
                        </View>
                      </View>
                      <View style={styles.pairBadge}>
                        <Text style={styles.pairBadgeText}>Pair</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}

              {/* Manual Connection Input */}
              <Text style={[styles.sectionLabel, { marginTop: 14 }]}>MANUAL HOST CONFIGURATION</Text>
              <Text style={styles.inputLabel}>Host IP Address</Text>
              <TextInput
                style={styles.textInput}
                value={ip}
                onChangeText={(val) => {
                  setIp(val);
                  setErrorMsg(null);
                }}
                placeholder="192.168.31.30"
                placeholderTextColor={Palette.overlay0}
                autoCapitalize="none"
              />

              <Text style={styles.inputLabel}>Port</Text>
              <TextInput
                style={styles.textInput}
                value={port}
                onChangeText={(val) => {
                  setPort(val);
                  setErrorMsg(null);
                }}
                placeholder="8088"
                placeholderTextColor={Palette.overlay0}
                keyboardType="numeric"
              />

              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => handleInitiatePairing()}
                disabled={initiating || scanning}
                activeOpacity={0.7}
              >
                {initiating ? (
                  <ActivityIndicator size="small" color={Palette.crust} />
                ) : (
                  <View style={styles.btnContent}>
                    <ShieldCheck size={16} color={Palette.crust} />
                    <Text style={styles.primaryBtnText}>Pair with Host</Text>
                  </View>
                )}
              </TouchableOpacity>
            </ScrollView>
          ) : (
            <View>
              <View style={styles.pinBanner}>
                <ShieldCheck size={28} color={Palette.green} />
                <Text style={styles.pinBannerTitle}>Desktop Notification Dispatched</Text>
                <Text style={styles.pinBannerSub}>
                  A critical notification with a 6-digit code has appeared on your Arch Linux screen.
                </Text>
              </View>

              <Text style={styles.pinPromptLabel}>Enter 6-Digit Pairing Code:</Text>
              <TextInput
                style={styles.pinInput}
                value={code}
                onChangeText={(val) => {
                  setCode(val.replace(/\D/g, '').slice(0, 6));
                  setErrorMsg(null);
                }}
                placeholder="000000"
                placeholderTextColor={Palette.surface2}
                keyboardType="number-pad"
                maxLength={6}
                autoFocus
              />

              <View style={styles.pinBtnRow}>
                <TouchableOpacity
                  style={styles.backBtn}
                  onPress={() => setStep('discover')}
                >
                  <Text style={styles.backBtnText}>Back</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.verifyBtn}
                  onPress={handleVerifyCode}
                  disabled={verifying || code.trim().length < 4}
                  activeOpacity={0.7}
                >
                  {verifying ? (
                    <ActivityIndicator size="small" color={Palette.crust} />
                  ) : (
                    <View style={styles.btnContent}>
                      <Check size={16} color={Palette.crust} />
                      <Text style={styles.verifyBtnText}>Confirm Code</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(17, 17, 27, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxHeight: '85%',
    backgroundColor: Palette.surface0,
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: Palette.surface2,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: Palette.mauve,
  },
  instruction: {
    fontSize: 12,
    color: Palette.subtext0,
    marginBottom: 14,
    lineHeight: 18,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Palette.overlay0,
    letterSpacing: 0.8,
  },
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  scanBtnText: {
    fontSize: 11,
    color: Palette.subtext0,
    fontWeight: '600',
  },
  emptyCard: {
    backgroundColor: Palette.mantle,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Palette.surface1,
    marginBottom: 10,
  },
  emptyText: {
    fontSize: 11,
    color: Palette.overlay0,
    fontStyle: 'italic',
  },
  hostCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Palette.mantle,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Palette.surface1,
    marginBottom: 8,
  },
  selectedHostCard: {
    borderColor: Palette.mauve,
    backgroundColor: Palette.surface1,
  },
  hostLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  hostIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Palette.surface1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hostTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Palette.text,
  },
  hostSub: {
    fontSize: 11,
    color: Palette.overlay0,
  },
  pairBadge: {
    backgroundColor: Palette.mauve,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  pairBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Palette.crust,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Palette.subtext0,
    marginBottom: 4,
    marginTop: 8,
  },
  textInput: {
    backgroundColor: Palette.mantle,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: Palette.text,
    borderWidth: 1,
    borderColor: Palette.surface1,
    marginBottom: 6,
  },
  primaryBtn: {
    backgroundColor: Palette.mauve,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 8,
  },
  btnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  primaryBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: Palette.crust,
  },
  errorBox: {
    backgroundColor: Palette.crust,
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Palette.red,
    marginBottom: 10,
  },
  errorText: {
    color: Palette.red,
    fontSize: 12,
  },
  pinBanner: {
    backgroundColor: Palette.mantle,
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Palette.surface1,
    marginBottom: 16,
  },
  pinBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Palette.text,
    marginTop: 8,
  },
  pinBannerSub: {
    fontSize: 11,
    color: Palette.subtext0,
    textAlign: 'center',
    marginTop: 4,
  },
  pinPromptLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Palette.subtext0,
    textAlign: 'center',
    marginBottom: 10,
  },
  pinInput: {
    backgroundColor: Palette.mantle,
    borderRadius: 10,
    paddingVertical: 12,
    fontSize: 26,
    fontWeight: '800',
    fontFamily: 'monospace',
    color: Palette.mauve,
    textAlign: 'center',
    letterSpacing: 10,
    borderWidth: 1,
    borderColor: Palette.mauve,
    marginBottom: 20,
  },
  pinBtnRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  backBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: Palette.mantle,
    alignItems: 'center',
  },
  backBtnText: {
    color: Palette.subtext0,
    fontSize: 13,
    fontWeight: '600',
  },
  verifyBtn: {
    flex: 2,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: Palette.mauve,
    alignItems: 'center',
  },
  verifyBtnText: {
    color: Palette.crust,
    fontSize: 13,
    fontWeight: '700',
  },
});
