import {
  AlertTriangle,
  Bell,
  Check,
  ChevronRight,
  ClipboardCopy,
  FolderUp,
  KeyRound,
  Laptop,
  Radio,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Terminal,
  Zap,
} from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiClient } from '../api/client';
import { Palette } from '../constants/theme';
import {
  getLocalDeviceUuid,
  getUserDistro,
  setOnboardingCompleted,
  setUserDistro,
} from '../storage/deviceStorage';
import { DeviceConfig, DiscoveredHost } from '../types';

interface DistroPreset {
  name: string;
  pkg: string;
  tag: string;
}

const DISTRO_PRESETS: DistroPreset[] = [
  { name: 'Arch Linux', pkg: 'pacman', tag: 'rolling' },
  { name: 'Fedora', pkg: 'dnf', tag: 'wayland' },
  { name: 'NixOS', pkg: 'nix', tag: 'declarative' },
  { name: 'Void Linux', pkg: 'xbps', tag: 'runit' },
  { name: 'Debian', pkg: 'apt', tag: 'stable' },
  { name: 'Gentoo', pkg: 'portage', tag: 'source' },
  { name: 'openSUSE', pkg: 'zypper', tag: 'tumbleweed' },
  { name: 'Ubuntu', pkg: 'apt', tag: 'lts' },
];

interface OnboardingModalProps {
  visible: boolean;
  onComplete: (pairedDevice?: DeviceConfig) => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({ visible, onComplete }) => {
  const insets = useSafeAreaInsets();
  const [currentStep, setCurrentStep] = useState<
    'welcome' | 'distro' | 'pair' | 'code' | 'done'
  >('welcome');
  const [distro, setDistro] = useState('Arch Linux');
  const [customDistroInput, setCustomDistroInput] = useState('');
  const [showEasterEgg, setShowEasterEgg] = useState(false);

  const [ip, setIp] = useState('');
  const [port, setPort] = useState('8088');
  const [discoveredHosts, setDiscoveredHosts] = useState<DiscoveredHost[]>([]);
  const [scanning, setScanning] = useState(false);
  const [initiating, setInitiating] = useState(false);
  const [pinCode, setPinCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [deviceUuid, setDeviceUuid] = useState('phone');
  const [pairedDevice, setPairedDevice] = useState<DeviceConfig | null>(null);

  useEffect(() => {
    if (visible) {
      setCurrentStep('welcome');
      setPinCode('');
      setErrorMsg(null);
      setShowEasterEgg(false);
      getUserDistro().then((saved) => {
        if (saved) setDistro(saved);
      });
      getLocalDeviceUuid().then(setDeviceUuid);
    }
  }, [visible]);

  const handleDistroInputChange = (val: string) => {
    setCustomDistroInput(val);
    if (/windows/i.test(val)) {
      setShowEasterEgg(true);
    } else if (val.trim()) {
      setDistro(val.trim());
    }
  };

  const handleSelectChip = (d: string) => {
    if (/windows/i.test(d)) {
      setShowEasterEgg(true);
      return;
    }
    setDistro(d);
    setCustomDistroInput(d);
  };

  const handleProceedToPairing = async () => {
    const chosen = (customDistroInput.trim() || distro || 'Linux').trim();
    if (/windows/i.test(chosen)) {
      setShowEasterEgg(true);
      return;
    }
    await setUserDistro(chosen);
    setDistro(chosen);
    setCurrentStep('pair');
    scanLocalNetwork();
  };

  const handleStartPairing = () => {
    setCurrentStep('distro');
  };

  const scanLocalNetwork = async () => {
    setScanning(true);
    setErrorMsg(null);
    try {
      const hosts: DiscoveredHost[] = [];
      if (ip && ip.trim()) {
        const direct = await ApiClient.scanHost(ip.trim(), 8088);
        if (direct) hosts.push(direct);
      }

      const subnetBase = ip && ip.includes('.') ? ip.trim().split('.').slice(0, 3).join('.') : undefined;
      const found = await ApiClient.discoverSubnet(subnetBase, 8088);
      for (const h of found) {
        if (!hosts.some((existing) => existing.ip === h.ip)) {
          hosts.push(h);
        }
      }
      setDiscoveredHosts(hosts);
      if (hosts.length > 0 && !ip) {
        setIp(hosts[0].ip);
      }
    } catch {
      // Fallback
    } finally {
      setScanning(false);
    }
  };

  const requestPairingCode = async (targetIp?: string) => {
    const activeIp = (targetIp || ip).trim();
    const activePort = parseInt(port, 10) || 8088;
    if (!activeIp) {
      setErrorMsg('Please specify an IP or select a discovered host.');
      return;
    }

    setInitiating(true);
    setErrorMsg(null);
    try {
      const client = new ApiClient({ hostIp: activeIp, hostPort: activePort });
      await client.healthCheck();
      await client.initiatePairing(deviceUuid, 'DeckComp Phone');
      setCurrentStep('code');
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Could not contact host. Check that deckcomp.service is running (run "deckcomp status").'
      );
    } finally {
      setInitiating(false);
    }
  };

  const verifyPinCode = async () => {
    const trimmed = pinCode.trim();
    if (trimmed.length < 4) {
      setErrorMsg('Please enter the 6-digit code shown on your computer screen.');
      return;
    }

    setVerifying(true);
    setErrorMsg(null);
    try {
      const activePort = parseInt(port, 10) || 8088;
      const client = new ApiClient({ hostIp: ip.trim(), hostPort: activePort });
      const res = await client.verifyPairing(deviceUuid, trimmed, 'DeckComp Phone');

      const dev: DeviceConfig = {
        id: `dev_${ip.trim()}_${activePort}`,
        name: res.device_name || `${distro || 'Linux'} Host`,
        hostIp: ip.trim(),
        hostPort: activePort,
        isPaired: true,
        authToken: res.token,
        lastConnected: new Date().toISOString(),
      };

      setPairedDevice(dev);
      setCurrentStep('done');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Invalid pairing code.');
    } finally {
      setVerifying(false);
    }
  };

  const handleFinish = async () => {
    await setOnboardingCompleted(true);
    onComplete(pairedDevice || undefined);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} statusBarTranslucent={true}>
      <View style={styles.container}>
        {/* Step 1: Welcome & Overview */}
        {currentStep === 'welcome' && (
          <ScrollView
            contentContainerStyle={[
              styles.scrollContent,
              {
                paddingTop: Math.max(insets.top + 16, 44),
                paddingBottom: Math.max(insets.bottom + 24, 32),
              },
            ]}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.heroSection}>
              <Image
                source={require('../../assets/icon.png')}
                style={styles.heroLogo}
                resizeMode="cover"
              />
              <Text style={styles.brandTitle}>DeckComp</Text>
              <Text style={styles.brandSub}>
                Zero-bloat Linux companion ecosystem on Wayland.
              </Text>
            </View>

            <View style={styles.featureList}>
              <View style={styles.featureItem}>
                <View style={[styles.featureIcon, { backgroundColor: Palette.surface1 }]}>
                  <Radio size={18} color={Palette.mauve} />
                </View>
                <View style={styles.featureText}>
                  <Text style={styles.featureTitle}>Instant Wi-Fi Pairing</Text>
                  <Text style={styles.featureDesc}>
                    Like KDE Connect, pair automatically with a simple 6-digit desktop code.
                  </Text>
                </View>
              </View>

              <View style={styles.featureItem}>
                <View style={[styles.featureIcon, { backgroundColor: Palette.surface1 }]}>
                  <ClipboardCopy size={18} color={Palette.blue} />
                </View>
                <View style={styles.featureText}>
                  <Text style={styles.featureTitle}>Two-Way Clipboard</Text>
                  <Text style={styles.featureDesc}>
                    Sync text between phone and desktop effortlessly with status bar actions.
                  </Text>
                </View>
              </View>

              <View style={styles.featureItem}>
                <View style={[styles.featureIcon, { backgroundColor: Palette.surface1 }]}>
                  <FolderUp size={18} color={Palette.teal} />
                </View>
                <View style={styles.featureText}>
                  <Text style={styles.featureTitle}>Bidirectional File Drops</Text>
                  <Text style={styles.featureDesc}>
                    Send photos to ~/Downloads, or run 'deck-send &lt;file&gt;' on your PC to receive them here.
                  </Text>
                </View>
              </View>

              <View style={styles.featureItem}>
                <View style={[styles.featureIcon, { backgroundColor: Palette.surface1 }]}>
                  <Sparkles size={18} color={Palette.peach} />
                </View>
                <View style={styles.featureText}>
                  <Text style={styles.featureTitle}>Visualizers & Eye-Candy</Text>
                  <Text style={styles.featureDesc}>
                    Spawn lavat, btop, cmatrix and custom presets directly from your phone.
                  </Text>
                </View>
              </View>
            </View>

            <TouchableOpacity
              style={styles.actionBtn}
              onPress={handleStartPairing}
              activeOpacity={0.7}
            >
              <Text style={styles.actionBtnText}>Connect My Workstation</Text>
              <ChevronRight size={18} color={Palette.crust} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.skipBtn} onPress={handleFinish}>
              <Text style={styles.skipBtnText}>Skip and configure manually later</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {/* Step 1.5: Linux Distribution Selection */}
        {currentStep === 'distro' && (
          <ScrollView
            contentContainerStyle={[
              styles.scrollContent,
              {
                paddingTop: Math.max(insets.top + 16, 44),
                paddingBottom: Math.max(insets.bottom + 24, 32),
              },
            ]}
            showsVerticalScrollIndicator={false}
          >
            {/* Terminal Window Header */}
            <View style={styles.termWindow}>
              <View style={styles.termTitlebar}>
                <View style={styles.termDots}>
                  <View style={[styles.termDot, { backgroundColor: Palette.red }]} />
                  <View style={[styles.termDot, { backgroundColor: Palette.yellow }]} />
                  <View style={[styles.termDot, { backgroundColor: Palette.green }]} />
                </View>
                <Text style={styles.termTitleText}>deckcomp@workstation:~</Text>
                <View style={{ width: 42 }} />
              </View>

              <View style={styles.termBody}>
                <View style={styles.cliPromptRow}>
                  <Text style={styles.cliPromptSymbol}>❯</Text>
                  <Text style={styles.cliPromptCmd}>select-host-distro --target-env</Text>
                </View>
                <Text style={styles.cliNoticeText}>
                  Select your desktop distribution to tune daemon IPC &amp; native desktop integrations.
                </Text>
              </View>
            </View>

            {/* Distro Preset Grid */}
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionMonoLabel}>// DETECTED PRESETS</Text>
              <Text style={styles.sectionSubLabel}>8 targets</Text>
            </View>

            <View style={styles.distroGrid}>
              {DISTRO_PRESETS.map((item) => {
                const isSelected =
                  (distro.toLowerCase() === item.name.toLowerCase() &&
                    !customDistroInput) ||
                  customDistroInput.toLowerCase() === item.name.toLowerCase();
                return (
                  <TouchableOpacity
                    key={item.name}
                    style={[styles.distroTile, isSelected && styles.distroTileActive]}
                    onPress={() => handleSelectChip(item.name)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.distroTileTop}>
                      <Text
                        style={[
                          styles.distroTileName,
                          isSelected && styles.distroTileNameActive,
                        ]}
                        numberOfLines={1}
                      >
                        {item.name}
                      </Text>
                      {isSelected ? (
                        <View style={styles.activeDotOuter}>
                          <View style={styles.activeDotInner} />
                        </View>
                      ) : (
                        <View style={styles.inactiveDot} />
                      )}
                    </View>
                    <View style={styles.distroMetaRow}>
                      <View
                        style={[
                          styles.distroPkgBadge,
                          isSelected && styles.distroPkgBadgeActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.distroPkgText,
                            isSelected && styles.distroPkgTextActive,
                          ]}
                        >
                          {item.pkg}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.distroTagText,
                          isSelected && styles.distroTagTextActive,
                        ]}
                      >
                        {item.tag}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Custom Distro Input Card */}
            <View style={styles.customDistroCard}>
              <View style={styles.customDistroHeader}>
                <Text style={styles.customDistroLabel}>CUSTOM / OTHER DISTRO</Text>
                <Text style={styles.customDistroFlag}>--manual</Text>
              </View>
              <View style={styles.cliInputRow}>
                <Text style={styles.cliInputPrompt}>$ DISTRO=</Text>
                <TextInput
                  style={styles.cliTextInput}
                  value={customDistroInput}
                  onChangeText={handleDistroInputChange}
                  placeholder={`"${distro || 'Arch Linux'}"`}
                  placeholderTextColor={Palette.surface2}
                  autoCapitalize="words"
                  autoCorrect={false}
                />
              </View>
            </View>

            {/* Continue Execution Button */}
            <TouchableOpacity
              style={styles.termActionBtn}
              onPress={handleProceedToPairing}
              activeOpacity={0.8}
            >
              <View style={styles.termActionBtnContent}>
                <Text style={styles.termActionBtnPrompt}>❯</Text>
                <Text style={styles.termActionBtnText} numberOfLines={1}>
                  deckcomp connect --distro "{(customDistroInput.trim() || distro || 'Linux')}"
                </Text>
              </View>
              <ChevronRight size={18} color={Palette.crust} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.termBackBtn}
              onPress={() => setCurrentStep('welcome')}
              activeOpacity={0.7}
            >
              <Text style={styles.termBackBtnText}>cd .. (back to welcome)</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {/* Step 2: Auto-Discovery & Pairing Request */}
        {currentStep === 'pair' && (
          <ScrollView
            contentContainerStyle={[
              styles.scrollContent,
              {
                paddingTop: Math.max(insets.top + 16, 44),
                paddingBottom: Math.max(insets.bottom + 24, 32),
              },
            ]}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.stepHeader}>
              <Text style={styles.stepTitle}>Locate Your {distro || 'Linux'} Host</Text>
              <Text style={styles.stepDesc}>
                Make sure your phone is on the same Wi-Fi network as your {distro || 'Linux'} computer.
              </Text>
            </View>

            {errorMsg && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{errorMsg}</Text>
              </View>
            )}

            <View style={styles.scanHeaderRow}>
              <Text style={styles.scanLabel}>DISCOVERED WORKSTATIONS</Text>
              <TouchableOpacity
                style={styles.rescanBtn}
                onPress={scanLocalNetwork}
                disabled={scanning}
              >
                {scanning ? (
                  <ActivityIndicator size="small" color={Palette.mauve} />
                ) : (
                  <RefreshCw size={12} color={Palette.subtext0} />
                )}
                <Text style={styles.rescanText}>{scanning ? 'Scanning...' : 'Rescan'}</Text>
              </TouchableOpacity>
            </View>

            {discoveredHosts.length === 0 && !scanning ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>
                  No active daemons detected automatically yet. You can pair manually with your host's local IP below:
                </Text>
              </View>
            ) : (
              discoveredHosts.map((host) => (
                <TouchableOpacity
                  key={host.ip}
                  style={styles.hostCard}
                  onPress={() => {
                    setIp(host.ip);
                    setPort(host.port.toString());
                    requestPairingCode(host.ip);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.hostCardLeft}>
                    <Laptop size={22} color={Palette.mauve} />
                    <View>
                      <Text style={styles.hostName}>{host.hostname}</Text>
                      <Text style={styles.hostIp}>{host.ip}:{host.port}</Text>
                    </View>
                  </View>
                  <View style={styles.pairTag}>
                    <Text style={styles.pairTagText}>Pair</Text>
                  </View>
                </TouchableOpacity>
              ))
            )}

            {/* Manual IP input */}
            <Text style={[styles.scanLabel, { marginTop: 18 }]}>OR ENTER HOST IP MANUALLY</Text>
            <TextInput
              style={styles.manualInput}
              value={ip}
              onChangeText={(val) => {
                setIp(val);
                setErrorMsg(null);
              }}
              placeholder="e.g. 192.168.1.50"
              placeholderTextColor={Palette.overlay0}
              autoCapitalize="none"
            />

            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => requestPairingCode()}
              disabled={initiating || scanning}
              activeOpacity={0.7}
            >
              {initiating ? (
                <ActivityIndicator size="small" color={Palette.crust} />
              ) : (
                <Text style={styles.actionBtnText}>Request Pairing Code</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.skipBtn} onPress={handleFinish}>
              <Text style={styles.skipBtnText}>Skip for now</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {/* Step 3: Enter 6-digit Code */}
        {currentStep === 'code' && (
          <View
            style={[
              styles.codeContainer,
              {
                paddingTop: Math.max(insets.top + 16, 44),
                paddingBottom: Math.max(insets.bottom + 24, 32),
              },
            ]}
          >
            <View style={styles.pinIconCircle}>
              <KeyRound size={36} color={Palette.mauve} />
            </View>

            <Text style={styles.stepTitle}>Enter Pairing Code</Text>
            <Text style={styles.codeInstructions}>
              A critical notification has appeared on your {distro || 'Linux'} screen. Enter the 6-digit code shown there:
            </Text>

            {errorMsg && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{errorMsg}</Text>
              </View>
            )}

            <TextInput
              style={styles.pinInput}
              value={pinCode}
              onChangeText={(val) => {
                setPinCode(val.replace(/\D/g, '').slice(0, 6));
                setErrorMsg(null);
              }}
              placeholder="000000"
              placeholderTextColor={Palette.surface2}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
            />

            <TouchableOpacity
              style={styles.actionBtn}
              onPress={verifyPinCode}
              disabled={verifying || pinCode.trim().length < 4}
              activeOpacity={0.7}
            >
              {verifying ? (
                <ActivityIndicator size="small" color={Palette.crust} />
              ) : (
                <Text style={styles.actionBtnText}>Confirm & Link Workstation</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.skipBtn} onPress={() => setCurrentStep('pair')}>
              <Text style={styles.skipBtnText}>Back to host selection</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Step 4: Finished & All Set */}
        {currentStep === 'done' && (
          <View
            style={[
              styles.codeContainer,
              {
                paddingTop: Math.max(insets.top + 16, 44),
                paddingBottom: Math.max(insets.bottom + 24, 32),
              },
            ]}
          >
            <View style={[styles.pinIconCircle, { backgroundColor: Palette.surface1 }]}>
              <ShieldCheck size={40} color={Palette.green} />
            </View>

            <Text style={styles.stepTitle}>Workstation Linked!</Text>
            <Text style={styles.codeInstructions}>
              Successfully paired with {pairedDevice?.name || `${distro || 'Linux'} computer`}.
            </Text>

            <View style={styles.notifHintCard}>
              <Bell size={20} color={Palette.mauve} />
              <View style={styles.notifHintText}>
                <Text style={styles.notifHintTitle}>Continuous Silent Notification</Text>
                <Text style={styles.notifHintDesc}>
                  DeckComp maintains a silent background notification with quick 'Pull Clip' and 'Push Clip' buttons.
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.actionBtn}
              onPress={handleFinish}
              activeOpacity={0.7}
            >
              <Text style={styles.actionBtnText}>Launch DeckComp</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Easter Egg Modal when Windows is typed anywhere */}
        <Modal
          visible={showEasterEgg}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowEasterEgg(false)}
        >
          <View style={styles.easterEggBackdrop}>
            <View style={styles.easterEggCard}>
              <View style={styles.hazardIconOuter}>
                <View style={styles.hazardIconInner}>
                  <AlertTriangle size={38} color={Palette.peach} />
                </View>
              </View>

              <Text style={styles.easterEggTitle}>DeckComp - Setup Aborted</Text>

              <View style={styles.roastBadge}>
                <Text style={styles.roastBadgeText}>🚫 MICROSLOP &amp; WINDOWS DETECTED 🚫</Text>
              </View>

              <Text style={styles.easterEggBody}>
                <Text style={styles.boldKindly}>Kindly</Text> uninstall this app an go on with your miserable life,as we don't want to touch your dirty system and uninstall it Ourselves...
              </Text>

              <Text style={styles.easterEggRoastSub}>
                DeckComp is handcrafted exclusively for clean, zero-bloat Linux workstations on Wayland. We refuse to connect to proprietary telemetry, forced restarts, and Edge spyware.
              </Text>

              <View style={styles.easterEggBtnCol}>
                <TouchableOpacity
                  style={styles.repentBtn}
                  onPress={() => {
                    setCustomDistroInput('');
                    setDistro('Arch Linux');
                    setShowEasterEgg(false);
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.repentBtnText}>I Repent (I'll Install Linux 🐧)</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.dismissEasterBtn}
                  onPress={() => {
                    setCustomDistroInput('');
                    setShowEasterEgg(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.dismissEasterText}>Clear &amp; Try Again</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Palette.base,
  },
  scrollContent: {
    paddingHorizontal: 22,
    paddingTop: 40,
    paddingBottom: 30,
  },
  heroSection: {
    alignItems: 'center',
    marginBottom: 28,
  },
  heroLogo: {
    width: 68,
    height: 68,
    borderRadius: 18,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: Palette.surface2,
  },
  heroIconBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Palette.mantle,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Palette.surface1,
    marginBottom: 16,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Palette.green,
  },
  brandTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: Palette.text,
    letterSpacing: -0.5,
  },
  brandSub: {
    fontSize: 13,
    color: Palette.subtext0,
    textAlign: 'center',
    marginTop: 6,
    maxWidth: 280,
  },
  featureList: {
    gap: 14,
    marginBottom: 30,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Palette.mantle,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Palette.surface0,
    gap: 14,
  },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Palette.text,
  },
  featureDesc: {
    fontSize: 11,
    color: Palette.subtext0,
    marginTop: 2,
    lineHeight: 16,
  },
  stepHeader: {
    marginBottom: 20,
  },
  stepTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Palette.text,
  },
  stepDesc: {
    fontSize: 13,
    color: Palette.subtext0,
    marginTop: 6,
  },
  scanHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  scanLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Palette.overlay0,
    letterSpacing: 0.8,
  },
  rescanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  rescanText: {
    fontSize: 12,
    color: Palette.subtext0,
    fontWeight: '600',
  },
  emptyBox: {
    backgroundColor: Palette.mantle,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Palette.surface1,
    marginBottom: 10,
  },
  emptyText: {
    fontSize: 12,
    color: Palette.subtext0,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  hostCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Palette.mantle,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Palette.surface1,
    marginBottom: 10,
  },
  hostCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  hostName: {
    fontSize: 14,
    fontWeight: '700',
    color: Palette.text,
  },
  hostIp: {
    fontSize: 11,
    color: Palette.overlay0,
    fontFamily: 'monospace',
    marginTop: 2,
  },
  pairTag: {
    backgroundColor: Palette.mauve,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
  },
  pairTagText: {
    fontSize: 12,
    fontWeight: '700',
    color: Palette.crust,
  },
  manualInput: {
    backgroundColor: Palette.mantle,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: Palette.text,
    borderWidth: 1,
    borderColor: Palette.surface1,
    marginTop: 8,
    marginBottom: 20,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Palette.mauve,
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 10,
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: Palette.crust,
  },
  skipBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 6,
  },
  skipBtnText: {
    fontSize: 12,
    color: Palette.overlay0,
  },
  codeContainer: {
    flex: 1,
    paddingHorizontal: 26,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pinIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Palette.mantle,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Palette.surface1,
    marginBottom: 18,
  },
  codeInstructions: {
    fontSize: 13,
    color: Palette.subtext0,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 20,
    lineHeight: 18,
    maxWidth: 290,
  },
  pinInput: {
    backgroundColor: Palette.mantle,
    borderRadius: 12,
    paddingVertical: 14,
    fontSize: 32,
    fontWeight: '800',
    fontFamily: 'monospace',
    color: Palette.mauve,
    textAlign: 'center',
    letterSpacing: 12,
    borderWidth: 1,
    borderColor: Palette.mauve,
    width: '100%',
    marginBottom: 24,
  },
  errorBox: {
    backgroundColor: Palette.crust,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Palette.red,
    marginBottom: 14,
    width: '100%',
  },
  errorText: {
    color: Palette.red,
    fontSize: 12,
    textAlign: 'center',
  },
  notifHintCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Palette.mantle,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Palette.surface1,
    marginTop: 10,
    marginBottom: 24,
  },
  notifHintText: {
    flex: 1,
  },
  notifHintTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Palette.text,
  },
  notifHintDesc: {
    fontSize: 11,
    color: Palette.subtext0,
    marginTop: 2,
    lineHeight: 15,
  },
  termWindow: {
    backgroundColor: Palette.mantle,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Palette.surface1,
    overflow: 'hidden',
    marginBottom: 18,
  },
  termTitlebar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Palette.crust,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: Palette.surface0,
  },
  termDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    width: 48,
  },
  termDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
  },
  termTitleText: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: Palette.subtext0,
    fontWeight: '600',
  },
  termBody: {
    padding: 14,
  },
  cliPromptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  cliPromptSymbol: {
    fontSize: 14,
    fontWeight: '900',
    color: Palette.mauve,
    fontFamily: 'monospace',
  },
  cliPromptCmd: {
    fontSize: 13,
    fontWeight: '700',
    color: Palette.text,
    fontFamily: 'monospace',
  },
  cliNoticeText: {
    fontSize: 12,
    color: Palette.subtext0,
    lineHeight: 17,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionMonoLabel: {
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: '700',
    color: Palette.overlay1,
    letterSpacing: 0.5,
  },
  sectionSubLabel: {
    fontSize: 10,
    fontFamily: 'monospace',
    color: Palette.overlay0,
  },
  distroGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  distroTile: {
    width: '48.5%',
    backgroundColor: Palette.mantle,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Palette.surface0,
  },
  distroTileActive: {
    backgroundColor: Palette.surface0,
    borderColor: Palette.mauve,
    borderWidth: 1.5,
  },
  distroTileTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  distroTileName: {
    fontSize: 13,
    fontWeight: '700',
    color: Palette.subtext1,
    flex: 1,
  },
  distroTileNameActive: {
    color: Palette.text,
    fontWeight: '800',
  },
  activeDotOuter: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(203, 166, 247, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeDotInner: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: Palette.mauve,
  },
  inactiveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: Palette.surface2,
  },
  distroMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  distroPkgBadge: {
    backgroundColor: Palette.crust,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Palette.surface1,
  },
  distroPkgBadgeActive: {
    borderColor: Palette.mauve,
    backgroundColor: Palette.crust,
  },
  distroPkgText: {
    fontSize: 10,
    fontFamily: 'monospace',
    color: Palette.subtext0,
    fontWeight: '700',
  },
  distroPkgTextActive: {
    color: Palette.mauve,
  },
  distroTagText: {
    fontSize: 10,
    fontFamily: 'monospace',
    color: Palette.overlay0,
  },
  distroTagTextActive: {
    color: Palette.subtext1,
  },
  customDistroCard: {
    backgroundColor: Palette.mantle,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Palette.surface0,
    padding: 12,
    marginBottom: 18,
  },
  customDistroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  customDistroLabel: {
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: '700',
    color: Palette.overlay1,
    letterSpacing: 0.5,
  },
  customDistroFlag: {
    fontSize: 10,
    fontFamily: 'monospace',
    color: Palette.overlay0,
  },
  cliInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Palette.crust,
    borderRadius: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: Palette.surface1,
  },
  cliInputPrompt: {
    fontSize: 12,
    fontFamily: 'monospace',
    fontWeight: '700',
    color: Palette.mauve,
    marginRight: 6,
  },
  cliTextInput: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'monospace',
    color: Palette.text,
    paddingVertical: 10,
  },
  termActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Palette.mauve,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 4,
  },
  termActionBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  termActionBtnPrompt: {
    fontSize: 14,
    fontWeight: '900',
    color: Palette.crust,
    fontFamily: 'monospace',
  },
  termActionBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: Palette.crust,
    fontFamily: 'monospace',
    flex: 1,
  },
  termBackBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 4,
  },
  termBackBtnText: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: Palette.overlay0,
  },
  easterEggBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(17, 17, 27, 0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  easterEggCard: {
    backgroundColor: Palette.mantle,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1.5,
    borderColor: Palette.red,
    alignItems: 'center',
    width: '100%',
    maxWidth: 380,
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
  },
  hazardIconOuter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(250, 179, 135, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(250, 179, 135, 0.35)',
  },
  hazardIconInner: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(243, 139, 168, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  easterEggTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Palette.red,
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  roastBadge: {
    backgroundColor: 'rgba(243, 139, 168, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(243, 139, 168, 0.25)',
  },
  roastBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: Palette.red,
    letterSpacing: 0.5,
  },
  easterEggBody: {
    fontSize: 15,
    color: Palette.text,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 14,
  },
  boldKindly: {
    fontWeight: '900',
    color: Palette.peach,
    textDecorationLine: 'underline',
  },
  easterEggRoastSub: {
    fontSize: 12,
    color: Palette.subtext0,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 24,
  },
  easterEggBtnCol: {
    width: '100%',
    gap: 10,
  },
  repentBtn: {
    backgroundColor: Palette.mauve,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    elevation: 4,
  },
  repentBtnText: {
    color: Palette.crust,
    fontSize: 14,
    fontWeight: '800',
  },
  dismissEasterBtn: {
    backgroundColor: Palette.surface0,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Palette.surface1,
  },
  dismissEasterText: {
    color: Palette.subtext1,
    fontSize: 13,
    fontWeight: '600',
  },
});
