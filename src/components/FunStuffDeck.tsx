import {
  Activity,
  Code,
  Coffee,
  Cpu,
  Eye,
  Flame,
  Gamepad2,
  Heart,
  Play,
  Plus,
  Rocket,
  RotateCcw,
  Sparkles,
  Terminal,
  Trash2,
  Tv,
  X,
  Zap,
} from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import {
  addPreset,
  deletePreset,
  loadPresets,
  resetPresets,
} from '../storage/presetStorage';
import { FunPreset, PresetIconName } from '../types';

interface FunStuffDeckProps {
  apiClient: ApiClient | null;
}

const AVAILABLE_ICONS: PresetIconName[] = [
  'Flame',
  'Sparkles',
  'Terminal',
  'Gamepad2',
  'Coffee',
  'Rocket',
  'Heart',
  'Zap',
  'Cpu',
  'Eye',
  'Tv',
  'Code',
  'Activity',
];

export const FunStuffDeck: React.FC<FunStuffDeckProps> = ({ apiClient }) => {
  const [presets, setPresets] = useState<FunPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCommand, setNewCommand] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newIcon, setNewIcon] = useState<PresetIconName>('Flame');
  const [newSpawnMode, setNewSpawnMode] = useState<'terminal' | 'ambient' | 'background'>('terminal');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function initPresets() {
      const data = await loadPresets();
      if (mounted) {
        setPresets(data);
        setLoading(false);
      }
    }
    initPresets();
    return () => {
      mounted = false;
    };
  }, []);

  const triggerFeedback = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 3500);
  };

  const renderIcon = (name: PresetIconName, size: number, color: string) => {
    switch (name) {
      case 'Flame':
        return <Flame size={size} color={color} />;
      case 'Sparkles':
        return <Sparkles size={size} color={color} />;
      case 'Terminal':
        return <Terminal size={size} color={color} />;
      case 'Gamepad2':
        return <Gamepad2 size={size} color={color} />;
      case 'Coffee':
        return <Coffee size={size} color={color} />;
      case 'Rocket':
        return <Rocket size={size} color={color} />;
      case 'Heart':
        return <Heart size={size} color={color} />;
      case 'Zap':
        return <Zap size={size} color={color} />;
      case 'Cpu':
        return <Cpu size={size} color={color} />;
      case 'Eye':
        return <Eye size={size} color={color} />;
      case 'Tv':
        return <Tv size={size} color={color} />;
      case 'Code':
        return <Code size={size} color={color} />;
      case 'Activity':
        return <Activity size={size} color={color} />;
      default:
        return <Sparkles size={size} color={color} />;
    }
  };

  const handleLaunch = async (preset: FunPreset) => {
    if (!apiClient) {
      triggerFeedback('Cannot launch: workstation offline');
      return;
    }

    setLaunchingId(preset.id);
    try {
      if (preset.spawnMode === 'ambient' && preset.command.trim() === 'lavat') {
        const res = await apiClient.spawnAmbient('lavat');
        triggerFeedback(`Spawned Lavat (PID: ${res.pid})`);
      } else if (preset.spawnMode === 'terminal') {
        const safeCmd = preset.command.replace(/"/g, '\\"');
        const termCmd = `( kitty -e bash -c "${safeCmd}" & ) || ( alacritty -e bash -c "${safeCmd}" & ) || ( foot -e bash -c "${safeCmd}" & ) || ( ${preset.command} & )`;
        await apiClient.executeShell(termCmd, 10);
        triggerFeedback(`Launched ${preset.title} in terminal window`);
      } else {
        const bgCmd = `( ${preset.command} >/dev/null 2>&1 & )`;
        await apiClient.executeShell(bgCmd, 10);
        triggerFeedback(`Dispatched ${preset.title}`);
      }
    } catch (err: unknown) {
      triggerFeedback(err instanceof Error ? err.message : 'Launch failed');
    } finally {
      setLaunchingId(null);
    }
  };

  const handleDelete = (id: string, title: string) => {
    Alert.alert('Delete Preset', `Remove "${title}" from your presets?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const updated = await deletePreset(id);
          setPresets(updated);
          triggerFeedback(`Deleted "${title}"`);
        },
      },
    ]);
  };

  const handleResetPresets = () => {
    Alert.alert(
      'Reset Defaults',
      'Restore all default visualizer and monitoring presets?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          onPress: async () => {
            const defaults = await resetPresets();
            setPresets(defaults);
            triggerFeedback('Restored default presets');
          },
        },
      ]
    );
  };

  const handleOpenAddModal = () => {
    setNewTitle('');
    setNewCommand('');
    setNewDescription('');
    setNewIcon('Flame');
    setNewSpawnMode('terminal');
    setFormError(null);
    setModalVisible(true);
  };

  const handleSavePreset = async () => {
    const trimmedTitle = newTitle.trim();
    const trimmedCmd = newCommand.trim();

    if (!trimmedTitle) {
      setFormError('Please enter a preset title.');
      return;
    }
    if (!trimmedCmd) {
      setFormError('Please enter a command to execute.');
      return;
    }

    try {
      const updated = await addPreset({
        title: trimmedTitle,
        command: trimmedCmd,
        description: newDescription.trim() || undefined,
        icon: newIcon,
        spawnMode: newSpawnMode,
      });
      setPresets(updated);
      setModalVisible(false);
      triggerFeedback(`Added "${trimmedTitle}"`);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to save preset');
    }
  };

  return (
    <View style={styles.container}>
      {/* Header with Title and Add Button */}
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.sectionHeader}>FUN PRESETS & EYE-CANDY</Text>
          <Text style={styles.sectionSub}>Custom terminal visualizers & launchers</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.resetBtn}
            onPress={handleResetPresets}
            activeOpacity={0.7}
          >
            <RotateCcw size={14} color={Palette.subtext0} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.addBtn}
            onPress={handleOpenAddModal}
            activeOpacity={0.7}
          >
            <Plus size={14} color={Palette.crust} />
            <Text style={styles.addBtnText}>Add</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Floating Status Feedback Toast */}
      {feedback && (
        <View style={styles.feedbackToast}>
          <Text style={styles.feedbackText}>{feedback}</Text>
        </View>
      )}

      {loading ? (
        <ActivityIndicator size="small" color={Palette.mauve} style={styles.loader} />
      ) : (
        <View style={styles.grid}>
          {presets.map((preset) => {
            const isLaunching = launchingId === preset.id;
            return (
              <View key={preset.id} style={styles.presetCard}>
                <View style={styles.cardTopRow}>
                  <View style={styles.iconCircle}>
                    {renderIcon(preset.icon, 20, Palette.mauve)}
                  </View>
                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => handleDelete(preset.id, preset.title)}
                    activeOpacity={0.7}
                  >
                    <Trash2 size={13} color={Palette.overlay0} />
                  </TouchableOpacity>
                </View>

                <Text style={styles.cardTitle} numberOfLines={1}>
                  {preset.title}
                </Text>

                <Text style={styles.cardDesc} numberOfLines={1}>
                  {preset.description || (preset.spawnMode === 'ambient' ? 'Ambient visualizer' : 'Terminal launcher')}
                </Text>

                <View style={styles.cmdBadge}>
                  <Text style={styles.cmdText} numberOfLines={1}>
                    $ {preset.command}
                  </Text>
                </View>

                <TouchableOpacity
                  style={[styles.launchBtn, isLaunching ? styles.launchBtnActive : null]}
                  onPress={() => handleLaunch(preset)}
                  disabled={isLaunching || !apiClient}
                  activeOpacity={0.7}
                >
                  {isLaunching ? (
                    <ActivityIndicator size="small" color={Palette.crust} />
                  ) : (
                    <View style={styles.launchBtnContent}>
                      <Play size={12} color={Palette.crust} fill={Palette.crust} />
                      <Text style={styles.launchBtnText}>Launch</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      )}

      {/* Add Preset Modal */}
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleRow}>
                <Sparkles size={18} color={Palette.mauve} />
                <Text style={styles.modalTitle}>New Fun Preset</Text>
              </View>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <X size={20} color={Palette.subtext0} />
              </TouchableOpacity>
            </View>

            {formError && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{formError}</Text>
              </View>
            )}

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.inputLabel}>Preset Name</Text>
              <TextInput
                style={styles.textInput}
                value={newTitle}
                onChangeText={(val) => {
                  setNewTitle(val);
                  setFormError(null);
                }}
                placeholder="e.g. Matrix Rain, Pipes, Neofetch"
                placeholderTextColor={Palette.overlay0}
              />

              <Text style={styles.inputLabel}>Command to Execute</Text>
              <TextInput
                style={[styles.textInput, styles.codeFont]}
                value={newCommand}
                onChangeText={(val) => {
                  setNewCommand(val);
                  setFormError(null);
                }}
                placeholder="e.g. cmatrix, btop, lavat"
                placeholderTextColor={Palette.overlay0}
                autoCapitalize="none"
                autoCorrect={false}
              />

              <Text style={styles.inputLabel}>Short Description (Optional)</Text>
              <TextInput
                style={styles.textInput}
                value={newDescription}
                onChangeText={setNewDescription}
                placeholder="e.g. Green digital rain"
                placeholderTextColor={Palette.overlay0}
              />

              <Text style={styles.inputLabel}>Spawn Execution Mode</Text>
              <View style={styles.modeRow}>
                <TouchableOpacity
                  style={[styles.modeChip, newSpawnMode === 'terminal' ? styles.activeModeChip : null]}
                  onPress={() => setNewSpawnMode('terminal')}
                >
                  <Text style={[styles.modeText, newSpawnMode === 'terminal' ? styles.activeModeText : null]}>
                    Terminal Window
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modeChip, newSpawnMode === 'ambient' ? styles.activeModeChip : null]}
                  onPress={() => setNewSpawnMode('ambient')}
                >
                  <Text style={[styles.modeText, newSpawnMode === 'ambient' ? styles.activeModeText : null]}>
                    Ambient Daemon
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modeChip, newSpawnMode === 'background' ? styles.activeModeChip : null]}
                  onPress={() => setNewSpawnMode('background')}
                >
                  <Text style={[styles.modeText, newSpawnMode === 'background' ? styles.activeModeText : null]}>
                    Silent Background
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.inputLabel}>Choose an Icon</Text>
              <View style={styles.iconPickerGrid}>
                {AVAILABLE_ICONS.map((iconName) => {
                  const isSelected = newIcon === iconName;
                  return (
                    <TouchableOpacity
                      key={iconName}
                      style={[styles.iconPickerItem, isSelected ? styles.selectedIconItem : null]}
                      onPress={() => setNewIcon(iconName)}
                      activeOpacity={0.7}
                    >
                      {renderIcon(iconName, 22, isSelected ? Palette.mauve : Palette.subtext0)}
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.modalBtnRow}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setModalVisible(false)}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.saveBtn}
                  onPress={handleSavePreset}
                >
                  <Text style={styles.saveBtnText}>Save Preset</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginTop: 14,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionHeader: {
    fontSize: 10,
    fontWeight: '700',
    color: Palette.subtext0,
    letterSpacing: 0.8,
  },
  sectionSub: {
    fontSize: 11,
    color: Palette.overlay0,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  resetBtn: {
    backgroundColor: Palette.surface0,
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Palette.surface1,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Palette.mauve,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  addBtnText: {
    color: Palette.crust,
    fontSize: 12,
    fontWeight: '700',
  },
  loader: {
    marginVertical: 30,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 12,
  },
  presetCard: {
    width: '48.5%',
    backgroundColor: Palette.surface0,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Palette.surface1,
    justifyContent: 'space-between',
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Palette.surface1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtn: {
    padding: 4,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Palette.text,
    marginBottom: 2,
  },
  cardDesc: {
    fontSize: 10,
    color: Palette.overlay0,
    marginBottom: 8,
  },
  cmdBadge: {
    backgroundColor: Palette.crust,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    marginBottom: 10,
  },
  cmdText: {
    fontSize: 9,
    fontFamily: 'monospace',
    color: Palette.subtext0,
  },
  launchBtn: {
    backgroundColor: Palette.mauve,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  launchBtnActive: {
    opacity: 0.8,
  },
  launchBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  launchBtnText: {
    color: Palette.crust,
    fontSize: 12,
    fontWeight: '700',
  },
  feedbackToast: {
    backgroundColor: Palette.surface1,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: Palette.teal,
    alignItems: 'center',
    marginBottom: 12,
  },
  feedbackText: {
    fontSize: 12,
    fontWeight: '600',
    color: Palette.teal,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(17, 17, 27, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxHeight: '85%',
    backgroundColor: Palette.surface0,
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: Palette.surface2,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  modalHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Palette.mauve,
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
  codeFont: {
    fontFamily: 'monospace',
  },
  modeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  modeChip: {
    backgroundColor: Palette.mantle,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Palette.surface1,
  },
  activeModeChip: {
    borderColor: Palette.mauve,
    backgroundColor: Palette.surface1,
  },
  modeText: {
    fontSize: 11,
    color: Palette.subtext0,
  },
  activeModeText: {
    color: Palette.mauve,
    fontWeight: '700',
  },
  iconPickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
    marginBottom: 16,
  },
  iconPickerItem: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: Palette.mantle,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Palette.surface1,
  },
  selectedIconItem: {
    borderColor: Palette.mauve,
    backgroundColor: Palette.surface1,
  },
  modalBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 10,
    paddingBottom: 6,
  },
  cancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Palette.mantle,
  },
  cancelBtnText: {
    color: Palette.subtext0,
    fontSize: 13,
    fontWeight: '600',
  },
  saveBtn: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Palette.mauve,
  },
  saveBtnText: {
    color: Palette.crust,
    fontSize: 13,
    fontWeight: '700',
  },
});
