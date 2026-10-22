import { Radio, Server } from 'lucide-react-native';
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
import { ApiClient } from '../api/client';
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
  const [enableFunTab, setEnableFunTab] = useState(currentConfig.enableFunTab !== false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  React.useEffect(() => {
    if (visible) {
      setIp(currentConfig.hostIp);
      setPort(currentConfig.hostPort.toString());
      setEnableFunTab(currentConfig.enableFunTab !== false);
      setValidationError(null);
      setTestResult(null);
    }
  }, [visible, currentConfig]);

  const validateInputs = (): HostConfig | null => {
    setValidationError(null);
    try {
      const validIp = validateHostIp(ip);
      const validPort = validateHostPort(port);
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
      const msg = err instanceof Error ? err.message : 'Connection failed';
      setTestResult({ success: false, message: msg });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    const validConfig = validateInputs();
    if (!validConfig) return;

    setSaving(true);
    try {
      await onSave(validConfig);
      onClose();
    } catch (err: unknown) {
      setValidationError(err instanceof Error ? err.message : 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Server size={18} color={Palette.mauve} />
            <Text style={styles.headerTitle}>Workstation Connection</Text>
          </View>
          <Text style={styles.instruction}>
            Enter the local IP and port of your Arch Linux daemon.
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

          <Text style={styles.inputLabel}>Port (Default: 8088)</Text>
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
              <Text style={styles.toggleTitle}>Enable 'Fun Stuff' Tab</Text>
              <Text style={styles.toggleSubtitle}>
                Show visualizers, eye-candy & custom presets in navigation
              </Text>
            </View>
            <View style={[styles.toggleSwitch, enableFunTab ? styles.toggleSwitchActive : null]}>
              <View style={[styles.toggleThumb, enableFunTab ? styles.toggleThumbActive : null]} />
            </View>
          </TouchableOpacity>

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.testBtn]}
              onPress={handleTest}
              disabled={testing || saving}
            >
              {testing ? (
                <ActivityIndicator size="small" color={Palette.mauve} />
              ) : (
                <Text style={styles.testBtnText}>Test Ping</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, styles.cancelBtn]}
              onPress={onClose}
              disabled={saving}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, styles.saveBtn]}
              onPress={handleSave}
              disabled={testing || saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color={Palette.crust} />
              ) : (
                <Text style={styles.saveBtnText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
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
    backgroundColor: Palette.surface0,
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: Palette.surface2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Palette.mauve,
  },
  instruction: {
    fontSize: 13,
    color: Palette.subtext0,
    marginBottom: 14,
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
    fontSize: 12,
    fontWeight: '600',
    color: Palette.lavender,
    marginBottom: 4,
    marginTop: 8,
  },
  textInput: {
    backgroundColor: Palette.surface1,
    color: Palette.text,
    fontSize: 14,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Palette.surface2,
  },
  resultBadge: {
    marginTop: 12,
    padding: 10,
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
    marginTop: 10,
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
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 20,
  },
  actionBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginLeft: 8,
    minWidth: 70,
    alignItems: 'center',
  },
  testBtn: {
    backgroundColor: Palette.surface1,
    borderWidth: 1,
    borderColor: Palette.mauve,
    marginRight: 'auto',
    marginLeft: 0,
  },
  testBtnText: {
    color: Palette.mauve,
    fontWeight: '600',
    fontSize: 13,
  },
  cancelBtn: {
    backgroundColor: Palette.surface1,
  },
  cancelBtnText: {
    color: Palette.subtext0,
    fontWeight: '600',
    fontSize: 13,
  },
  saveBtn: {
    backgroundColor: Palette.mauve,
  },
  saveBtnText: {
    color: Palette.crust,
    fontWeight: '700',
    fontSize: 13,
  },
});
