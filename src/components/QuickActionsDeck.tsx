import * as Clipboard from 'expo-clipboard';
import {
  ClipboardCopy,
  ClipboardPaste,
  Lock,
  Power,
} from 'lucide-react-native';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { ApiClient } from '../api/client';
import { Palette } from '../constants/theme';
import { updateNotificationFeedback } from '../services/notificationService';
import { ConfirmModal } from './ConfirmModal';

interface QuickActionsDeckProps {
  apiClient: ApiClient | null;
}

export const QuickActionsDeck: React.FC<QuickActionsDeckProps> = ({ apiClient }) => {
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showPower, setShowPower] = useState(false);
  const [powerModal, setPowerModal] = useState<{ title: string; actionFn: () => Promise<void> } | null>(null);

  const triggerFeedback = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 3000);
  };

  const handlePushClipboard = async () => {
    if (!apiClient) return;
    setActiveAction('push_clip');
    try {
      const text = await Clipboard.getStringAsync();
      if (!text) {
        triggerFeedback('Phone clipboard is empty');
        return;
      }
      await apiClient.pushClipboard(text);
      const preview = text.trim().slice(0, 24);
      const suffix = text.trim().length > 24 ? '...' : '';
      triggerFeedback(`Copied to desktop (${text.length} chars)`);
      updateNotificationFeedback(`✓ Pushed to PC: "${preview}${suffix}"`);
    } catch (err: unknown) {
      triggerFeedback(err instanceof Error ? err.message : 'Push failed');
    } finally {
      setActiveAction(null);
    }
  };

  const handlePullClipboard = async () => {
    if (!apiClient) return;
    setActiveAction('pull_clip');
    try {
      const data = await apiClient.getClipboard();
      if (!data || !data.content) {
        triggerFeedback('Desktop clipboard is empty');
        return;
      }
      await Clipboard.setStringAsync(data.content);
      const preview = data.content.trim().slice(0, 24);
      const suffix = data.content.trim().length > 24 ? '...' : '';
      triggerFeedback(`Saved ${data.length} chars to phone`);
      updateNotificationFeedback(`✓ Pulled from PC: "${preview}${suffix}"`);
    } catch (err: unknown) {
      triggerFeedback(err instanceof Error ? err.message : 'Pull failed');
    } finally {
      setActiveAction(null);
    }
  };

  const handleLockSession = async () => {
    if (!apiClient) return;
    setActiveAction('lock');
    try {
      await apiClient.lockSession();
      triggerFeedback('Wayland session locked');
    } catch (err: unknown) {
      triggerFeedback(err instanceof Error ? err.message : 'Lock failed');
    } finally {
      setActiveAction(null);
    }
  };

  const confirmPower = (title: string, actionFn: () => Promise<void>) => {
    setPowerModal({ title, actionFn });
  };

  const handleExecutePower = async () => {
    if (!powerModal) return;
    const { title, actionFn } = powerModal;
    setPowerModal(null);
    try {
      await actionFn();
      triggerFeedback(`${title} command dispatched`);
    } catch (err: unknown) {
      triggerFeedback(err instanceof Error ? err.message : 'Action failed');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.sectionHeader}>QUICK ACTIONS</Text>

      {/* Balanced 2x2 Action Grid */}
      <View style={styles.grid}>
        {/* Push Clipboard */}
        <TouchableOpacity
          style={styles.gridTile}
          onPress={handlePushClipboard}
          disabled={activeAction !== null || !apiClient}
          activeOpacity={0.7}
        >
          <View style={styles.iconCircle}>
            {activeAction === 'push_clip' ? (
              <ActivityIndicator size="small" color={Palette.blue} />
            ) : (
              <ClipboardCopy size={18} color={Palette.blue} />
            )}
          </View>
          <Text style={styles.tileTitle}>Push Clip</Text>
          <Text style={styles.tileSub}>Phone → Host</Text>
        </TouchableOpacity>

        {/* Pull Clipboard */}
        <TouchableOpacity
          style={styles.gridTile}
          onPress={handlePullClipboard}
          disabled={activeAction !== null || !apiClient}
          activeOpacity={0.7}
        >
          <View style={styles.iconCircle}>
            {activeAction === 'pull_clip' ? (
              <ActivityIndicator size="small" color={Palette.lavender} />
            ) : (
              <ClipboardPaste size={18} color={Palette.lavender} />
            )}
          </View>
          <Text style={styles.tileTitle}>Pull Clip</Text>
          <Text style={styles.tileSub}>Host → Phone</Text>
        </TouchableOpacity>

        {/* Lock Screen */}
        <TouchableOpacity
          style={styles.gridTile}
          onPress={handleLockSession}
          disabled={activeAction !== null || !apiClient}
          activeOpacity={0.7}
        >
          <View style={styles.iconCircle}>
            {activeAction === 'lock' ? (
              <ActivityIndicator size="small" color={Palette.mauve} />
            ) : (
              <Lock size={18} color={Palette.mauve} />
            )}
          </View>
          <Text style={styles.tileTitle}>Lock Session</Text>
          <Text style={styles.tileSub}>Wayland lock</Text>
        </TouchableOpacity>

        {/* Toggle Power Controls */}
        <TouchableOpacity
          style={[styles.gridTile, showPower ? styles.activeTile : null]}
          onPress={() => setShowPower(!showPower)}
          activeOpacity={0.7}
        >
          <View style={styles.iconCircle}>
            <Power size={18} color={Palette.red} />
          </View>
          <Text style={styles.tileTitle}>Power</Text>
          <Text style={styles.tileSub}>{showPower ? 'Hide options' : 'Options...'}</Text>
        </TouchableOpacity>
      </View>

      {/* Floating Status Feedback Toast */}
      {feedback && (
        <View style={styles.feedbackToast}>
          <Text style={styles.feedbackText}>{feedback}</Text>
        </View>
      )}

      {/* Guarded Collapsible Power Controls */}
      {showPower && (
        <View style={styles.powerCard}>
          <Text style={styles.powerCardHeader}>SYSTEM POWER CONTROLS</Text>
          <View style={styles.powerRow}>
            <TouchableOpacity
              style={[styles.powerBtn, { borderColor: Palette.peach }]}
              onPress={() => confirmPower('Suspend', () => apiClient!.suspendHost())}
              activeOpacity={0.7}
            >
              <Text style={[styles.powerBtnText, { color: Palette.peach }]}>Suspend</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.powerBtn, { borderColor: Palette.yellow }]}
              onPress={() => confirmPower('Reboot', () => apiClient!.rebootHost())}
              activeOpacity={0.7}
            >
              <Text style={[styles.powerBtnText, { color: Palette.yellow }]}>Reboot</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.powerBtn, { borderColor: Palette.red }]}
              onPress={() => confirmPower('Power Off', () => apiClient!.poweroffHost())}
              activeOpacity={0.7}
            >
              <Text style={[styles.powerBtnText, { color: Palette.red }]}>Power Off</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Confirmation Modal for Host Power Actions */}
      <ConfirmModal
        visible={powerModal !== null}
        title={`${powerModal?.title} Host`}
        message={`Are you sure you want to ${powerModal?.title.toLowerCase()} your computer?`}
        confirmText={powerModal?.title || 'Confirm'}
        cancelText="Cancel"
        isDestructive={true}
        onConfirm={handleExecutePower}
        onCancel={() => setPowerModal(null)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginTop: 14,
  },
  sectionHeader: {
    fontSize: 10,
    fontWeight: '700',
    color: Palette.subtext0,
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
  },
  gridTile: {
    width: '48.5%',
    backgroundColor: Palette.surface0,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Palette.surface1,
  },
  activeTile: {
    borderColor: Palette.mauve,
    backgroundColor: Palette.surface1,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Palette.surface1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  tileTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Palette.text,
  },
  tileSub: {
    fontSize: 9,
    color: Palette.overlay0,
    marginTop: 2,
    textAlign: 'center',
  },
  feedbackToast: {
    backgroundColor: Palette.surface1,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: Palette.teal,
    alignItems: 'center',
    marginBottom: 10,
  },
  feedbackText: {
    fontSize: 12,
    fontWeight: '600',
    color: Palette.teal,
  },
  powerCard: {
    backgroundColor: Palette.surface0,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Palette.surface2,
    marginBottom: 10,
  },
  powerCardHeader: {
    fontSize: 9,
    fontWeight: '800',
    color: Palette.subtext0,
    letterSpacing: 0.5,
    marginBottom: 8,
    textAlign: 'center',
  },
  powerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  powerBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Palette.surface1,
    borderWidth: 1,
    alignItems: 'center',
    marginHorizontal: 3,
  },
  powerBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
});
