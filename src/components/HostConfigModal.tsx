import { ChevronDown, ChevronUp, Radio, Server, X } from 'lucide-react-native';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { ApiClient, formatErrorMessage } from '../api/client';
import { Palette } from '../constants/theme';
import { validateHostIp, validateHostPort } from '../storage/hostStorage';
import { HostConfig } from '../types';

interface HostConfigModalProps {
  visible: boolean;
  currentConfig: HostConfig;
  onClose: () => void;
  onSave: (newConfig: HostConfig) => Promise<void>;
}

export const HostConfigModal: React.FC<HostConfigModalProps> = ({
  visible,
  currentConfig,
  onClose,
  onSave,
}) => {
  const [ip, setIp] = useState(currentConfig.hostIp);
  const [port, setPort] = useState(currentConfig.hostPort.toString());
  const [showAdvanced, setShowAdvanced] = useState(currentConfig.hostPort !== 8088);
  const [enableFunTab, setEnableFunTab] = useState(currentConfig.enableFunTab !== false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  React.useEffect(() => {
    if (visible) {
      setIp(currentConfig.hostIp);
      setPort(currentConfig.hostPort.toString());
      setShowAdvanced(currentConfig.hostPort !== 8088);
      setEnableFunTab(currentConfig.enableFunTab !== false);
      setValidationError(null);
      setTestResult(null);
    }
  }, [visible, currentConfig]);

  const validateInputs = (): HostConfig | null => {
    setValidationError(null);
    try {
      const validIp = validateHostIp(ip.trim());
      const validPort = validateHostPort(port.trim());
      return {
        hostIp: validIp,
        hostPort: validPort,
        enableFunTab,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid configuration';
      setValidationError(msg);
      return null;
    }
  };

  const handleTest = async () => {
    const validConfig = validateInputs();
    if (!validConfig) return;

    setTesting(true);
    setTestResult(null);

    try {
      const client = new ApiClient(validConfig);
      const res = await client.healthCheck();
      setTestResult({
        success: true,
        message: `Connected: ${res.hostname} (${res.version})`,
      });
    } catch (err: unknown) {
      const msg = formatErrorMessage(err, 'Host is disconnected');
      setTestResult({ success: false, message: msg });
    } finally {
      setTesting(false);
    }
  };

  // Dynamically apply settings when exited by tapping outside the box or header close
  const handleExitAndApply = async () => {
    const isChanged =
      ip.trim() !== currentConfig.hostIp ||
      port.trim() !== currentConfig.hostPort.toString() ||
      enableFunTab !== (currentConfig.enableFunTab !== false);

    if (isChanged) {
      try {
        const validIp = validateHostIp(ip.trim());
        const validPort = validateHostPort(port.trim());
        await onSave({
          hostIp: validIp,
          hostPort: validPort,
          enableFunTab,
        });
      } catch {
        // If inputs are invalid/incomplete on exit, safely keep existing config
      }
    }
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleExitAndApply}>
      <View style={styles.backdrop}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={handleExitAndApply}
        />
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.headerTitleGroup}>
              <Server size={18} color={Palette.mauve} />
              <Text style={styles.headerTitle}>Connection Settings</Text>
            </View>
            <TouchableOpacity
              onPress={handleExitAndApply}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X size={18} color={Palette.overlay1} />
            </TouchableOpacity>
          </View>
          <Text style={styles.instruction}>
            Configure your Linux companion daemon connection.
          </Text>

          {validationError && (
            <View style={styles.errorBox}>
              <Text style={styles.errorBoxText}>{validationError}</Text>
            </View>
          )}

          <Text style={styles.inputLabel}>Host IP / Hostname</Text>
          <TextInput
            style={styles.textInput}
            value={ip}
            onChangeText={(val) => {
              setIp(val);
              setValidationError(null);
            }}
            placeholder="e.g. 192.168.1.50"
            placeholderTextColor={Palette.overlay0}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <TouchableOpacity
            style={styles.advancedToggleRow}
            onPress={() => setShowAdvanced(!showAdvanced)}
            activeOpacity={0.7}
          >
            <Text style={styles.advancedToggleText}>Advanced Network Settings</Text>
            {showAdvanced ? (
              <ChevronUp size={16} color={Palette.subtext0} />
            ) : (
              <ChevronDown size={16} color={Palette.subtext0} />
            )}
          </TouchableOpacity>

          {showAdvanced && (
            <View style={styles.advancedContainer}>
              <Text style={styles.inputLabel}>Daemon Port (Default: 8088)</Text>
              <TextInput
                style={styles.textInput}
                value={port}
                onChangeText={(val) => {
                  setPort(val);
                  setValidationError(null);
                }}
                placeholder="8088"
                placeholderTextColor={Palette.overlay0}
                keyboardType="numeric"
              />
            </View>
          )}

          {testResult && (
            <View
              style={[
                styles.resultBadge,
                { backgroundColor: testResult.success ? Palette.surface0 : Palette.crust },
              ]}
            >
              <Text
                style={[
                  styles.resultText,
                  { color: testResult.success ? Palette.green : Palette.red },
                ]}
              >
                {testResult.message}
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.toggleRow}
            onPress={() => setEnableFunTab(!enableFunTab)}
            activeOpacity={0.7}
          >
            <View style={styles.toggleTextContainer}>
              <Text style={styles.toggleTitle}>Enable 'Visuals' Tab</Text>
              <Text style={styles.toggleSubtitle}>
                Show visualizers, eye-candy & custom presets in navigation
              </Text>
            </View>
            <View style={[styles.toggleSwitch, enableFunTab ? styles.toggleSwitchActive : null]}>
              <View style={[styles.toggleThumb, enableFunTab ? styles.toggleThumbActive : null]} />
            </View>
          </TouchableOpacity>

          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.testBtn}
              onPress={handleTest}
              disabled={testing}
              activeOpacity={0.8}
            >
              {testing ? (
                <ActivityIndicator size="small" color={Palette.mauve} />
              ) : (
                <Text style={styles.testBtnText}>Test Ping</Text>
              )}
            </TouchableOpacity>

            <Text style={styles.autoSaveHint}>Applies on exit</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(17, 17, 27, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: Palette.surface0,
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: Palette.surface2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  headerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Palette.mauve,
  },
  instruction: {
    fontSize: 12,
    color: Palette.subtext0,
    marginBottom: 12,
  },
  errorBox: {
    backgroundColor: Palette.crust,
    padding: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Palette.red,
    marginBottom: 10,
  },
  errorBoxText: {
    color: Palette.red,
    fontSize: 12,
    fontWeight: '600',
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Palette.lavender,
    marginBottom: 4,
    marginTop: 8,
  },
  textInput: {
    backgroundColor: Palette.surface1,
    color: Palette.text,
    fontSize: 13,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: Palette.surface2,
  },
  advancedToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    marginTop: 6,
  },
  advancedToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: Palette.subtext0,
  },
  advancedContainer: {
    marginTop: 2,
    marginBottom: 4,
  },
  resultBadge: {
    marginTop: 10,
    padding: 9,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Palette.surface1,
  },
  resultText: {
    fontSize: 12,
    fontWeight: '600',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Palette.mantle,
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Palette.surface1,
  },
  toggleTextContainer: {
    flex: 1,
    marginRight: 10,
  },
  toggleTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Palette.text,
  },
  toggleSubtitle: {
    fontSize: 10,
    color: Palette.overlay0,
    marginTop: 2,
  },
  toggleSwitch: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: Palette.surface1,
    padding: 2,
    justifyContent: 'center',
  },
  toggleSwitchActive: {
    backgroundColor: Palette.mauve,
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Palette.subtext0,
  },
  toggleThumbActive: {
    alignSelf: 'flex-end',
    backgroundColor: Palette.crust,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  testBtn: {
    backgroundColor: Palette.surface1,
    borderWidth: 1,
    borderColor: Palette.mauve,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    minWidth: 80,
  },
  testBtnText: {
    color: Palette.mauve,
    fontWeight: '600',
    fontSize: 12,
  },
  autoSaveHint: {
    fontSize: 11,
    color: Palette.overlay0,
    fontStyle: 'italic',
  },
});
