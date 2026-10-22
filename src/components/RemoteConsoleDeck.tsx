import { Play, Terminal, Trash } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { ApiClient } from '../api/client';
import { Palette } from '../constants/theme';
import { getUserDistro } from '../storage/deviceStorage';
import { ShellResult } from '../types';
import { TerminalVisualizer } from './TerminalVisualizer';

interface RemoteConsoleDeckProps {
  apiClient: ApiClient | null;
}

export const RemoteConsoleDeck: React.FC<RemoteConsoleDeckProps> = ({ apiClient }) => {
  const [command, setCommand] = useState('');
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<{ cmd: string; res: ShellResult }[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeVisualizer, setActiveVisualizer] = useState<'lavat' | 'cmatrix' | null>(null);
  const [distro, setDistro] = useState('Linux');

  const presets = ['lavat', 'cmatrix', 'uptime -p', 'free -h', 'uname -r', 'hyprctl activewindow -j'];

  useEffect(() => {
    getUserDistro().then((d) => {
      if (d) setDistro(d);
    });
  }, []);

  const handleExecute = async (cmdToRun?: string) => {
    const targetCmd = (cmdToRun || command).trim();
    if (!targetCmd) return;

    if (targetCmd === 'clear') {
      setHistory([]);
      setActiveVisualizer(null);
      if (!cmdToRun) setCommand('');
      return;
    }

    const lower = targetCmd.toLowerCase();
    if (lower === 'lavat' || lower.startsWith('lavat ')) {
      setActiveVisualizer('lavat');
      if (!cmdToRun) setCommand('');
      // Also spawn on workstation in background if available
      if (apiClient) {
        apiClient.spawnAmbient('lavat').catch(() => {
          apiClient.executeShell('( kitty -e lavat & ) || ( alacritty -e lavat & ) || ( foot -e lavat & ) || ( lavat & )', 5).catch(() => {});
        });
      }
      return;
    }

    if (lower === 'cmatrix' || lower.startsWith('cmatrix ') || lower === 'matrix') {
      setActiveVisualizer('cmatrix');
      if (!cmdToRun) setCommand('');
      // Also spawn on workstation in background if available
      if (apiClient) {
        apiClient.executeShell('( kitty -e cmatrix & ) || ( alacritty -e cmatrix & ) || ( foot -e cmatrix & ) || ( cmatrix & )', 5).catch(() => {});
      }
      return;
    }

    if (!apiClient) {
      setErrorMsg('Workstation offline - connect in Controls tab to run bash commands');
      return;
    }

    setRunning(true);
    setErrorMsg(null);
    try {
      const res = await apiClient.executeShell(targetCmd, 15);
      setHistory((prev) => [{ cmd: targetCmd, res }, ...prev.slice(0, 9)]);
      if (!cmdToRun) setCommand('');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Execution failed');
    } finally {
      setRunning(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Quick Preset Chips */}
      <View style={styles.presetRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {presets.map((preset) => (
            <TouchableOpacity
              key={preset}
              style={styles.presetChip}
              onPress={() => {
                setCommand(preset);
                handleExecute(preset);
              }}
              disabled={running}
            >
              <Text style={styles.presetText}>{preset}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Input Bar */}
      <View style={styles.inputCard}>
        <Text style={styles.prompt}>$</Text>
        <TextInput
          style={styles.textInput}
          value={command}
          onChangeText={setCommand}
          placeholder="Enter bash command..."
          placeholderTextColor={Palette.overlay0}
          autoCapitalize="none"
          autoCorrect={false}
          onSubmitEditing={() => handleExecute()}
        />
        <TouchableOpacity
          style={styles.runBtn}
          onPress={() => handleExecute()}
          disabled={running || !command.trim() || !apiClient}
          activeOpacity={0.7}
        >
          {running ? (
            <ActivityIndicator size="small" color={Palette.crust} />
          ) : (
            <View style={styles.runBtnContent}>
              <Play size={11} color={Palette.crust} fill={Palette.crust} />
              <Text style={styles.runBtnText}>Run</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {errorMsg && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{errorMsg}</Text>
        </View>
      )}

      {/* Terminal History */}
      <View style={styles.terminalCard}>
        <View style={styles.terminalHeader}>
          <View style={styles.headerLeft}>
            <View style={styles.headerDots}>
              <View style={[styles.dot, { backgroundColor: Palette.red }]} />
              <View style={[styles.dot, { backgroundColor: Palette.yellow }]} />
              <View style={[styles.dot, { backgroundColor: Palette.green }]} />
            </View>
            <View style={styles.terminalTitleRow}>
              <Terminal size={12} color={Palette.subtext0} style={styles.titleIcon} />
              <Text style={styles.terminalHeaderTitle}>{(distro || 'LINUX').toUpperCase()} TERMINAL</Text>
            </View>
          </View>
          {history.length > 0 && (
            <TouchableOpacity
              onPress={() => setHistory([])}
              style={styles.clearBtn}
              activeOpacity={0.7}
            >
              <Trash size={11} color={Palette.overlay0} />
              <Text style={styles.clearText}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>

        <ScrollView style={styles.terminalBuffer} nestedScrollEnabled>
          {activeVisualizer && (
            <TerminalVisualizer
              app={activeVisualizer}
              onClose={() => {
                const stopped = activeVisualizer;
                setActiveVisualizer(null);
                setHistory((prev) => [
                  {
                    cmd: stopped,
                    res: {
                      stdout: `[${stopped}: animation terminated by SIGINT / Ctrl+C]`,
                      stderr: '',
                      exit_code: 0,
                      duration_ms: 180,
                      timed_out: false,
                    },
                  },
                  ...prev.slice(0, 9),
                ]);
              }}
            />
          )}

          {history.length === 0 && !activeVisualizer ? (
            <Text style={styles.emptyPrompt}>Ready. Tap a preset chip or type a command above.</Text>
          ) : (
            history.map((item, idx) => (
              <View key={idx} style={styles.logItem}>
                <View style={styles.logCmdRow}>
                  <Text style={styles.logPrompt}>❯</Text>
                  <Text style={styles.logCmdText}>{item.cmd}</Text>
                  <View
                    style={[
                      styles.exitBadge,
                      {
                        backgroundColor:
                          item.res.exit_code === 0 && !item.res.timed_out
                            ? Palette.green
                            : Palette.red,
                      },
                    ]}
                  >
                    <Text style={styles.exitBadgeText}>
                      {item.res.timed_out ? 'TIMEOUT' : `EXIT ${item.res.exit_code}`}
                    </Text>
                  </View>
                  <Text style={styles.durationText}>{item.res.duration_ms}ms</Text>
                </View>

                {item.res.stdout ? (
                  <Text style={styles.stdoutText}>{item.res.stdout}</Text>
                ) : null}
                {item.res.stderr ? (
                  <Text style={styles.stderrText}>{item.res.stderr}</Text>
                ) : null}
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginTop: 14,
  },
  presetRow: {
    marginBottom: 10,
  },
  presetChip: {
    backgroundColor: Palette.surface0,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 6,
    borderWidth: 1,
    borderColor: Palette.surface1,
  },
  presetText: {
    color: Palette.teal,
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  inputCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Palette.surface0,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: Palette.surface1,
    marginBottom: 12,
  },
  prompt: {
    fontSize: 15,
    fontWeight: '800',
    color: Palette.mauve,
    marginRight: 8,
  },
  textInput: {
    flex: 1,
    color: Palette.text,
    fontSize: 13,
    fontFamily: 'monospace',
    paddingVertical: 6,
  },
  runBtn: {
    backgroundColor: Palette.mauve,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  runBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  runBtnText: {
    color: Palette.crust,
    fontSize: 12,
    fontWeight: '700',
  },
  errorBox: {
    backgroundColor: Palette.crust,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Palette.red,
    marginBottom: 10,
  },
  errorText: {
    color: Palette.red,
    fontSize: 12,
  },
  terminalCard: {
    backgroundColor: Palette.crust,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Palette.surface1,
    overflow: 'hidden',
  },
  terminalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Palette.mantle,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Palette.surface0,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  terminalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  titleIcon: {
    marginRight: 5,
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  headerDots: {
    flexDirection: 'row',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 4,
  },
  terminalHeaderTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: Palette.subtext0,
    letterSpacing: 0.8,
  },
  clearText: {
    fontSize: 11,
    color: Palette.overlay0,
  },
  terminalBuffer: {
    maxHeight: 340,
    minHeight: 200,
    padding: 12,
  },
  emptyPrompt: {
    color: Palette.overlay0,
    fontSize: 12,
    fontFamily: 'monospace',
    fontStyle: 'italic',
  },
  logItem: {
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Palette.surface0,
  },
  logCmdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  logPrompt: {
    color: Palette.mauve,
    fontSize: 12,
    marginRight: 6,
  },
  logCmdText: {
    flex: 1,
    color: Palette.text,
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  exitBadge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 6,
  },
  exitBadgeText: {
    color: Palette.crust,
    fontSize: 9,
    fontWeight: '800',
  },
  durationText: {
    color: Palette.overlay0,
    fontSize: 10,
    fontFamily: 'monospace',
  },
  stdoutText: {
    color: Palette.text,
    fontFamily: 'monospace',
    fontSize: 11,
    lineHeight: 16,
  },
  stderrText: {
    color: Palette.red,
    fontFamily: 'monospace',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2,
  },
});
