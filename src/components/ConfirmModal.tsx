import { AlertTriangle, Power, RotateCcw, Trash2, X } from 'lucide-react-native';
import React from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Palette } from '../constants/theme';

interface ConfirmModalProps {
  visible: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  icon?: 'trash' | 'warning' | 'reset' | 'power';
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  visible,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDestructive = false,
  icon,
  onConfirm,
  onCancel,
}) => {
  const renderIcon = () => {
    if (icon === 'trash' || (isDestructive && icon !== 'power')) {
      return <Trash2 size={18} color={Palette.red} />;
    }
    if (icon === 'reset') {
      return <RotateCcw size={18} color={Palette.sapphire} />;
    }
    if (icon === 'power') {
      return <Power size={18} color={isDestructive ? Palette.red : Palette.peach} />;
    }
    return <AlertTriangle size={18} color={isDestructive ? Palette.red : Palette.mauve} />;
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onCancel}
        />
        <View style={[styles.card, isDestructive && styles.destructiveCard]}>
          <View style={styles.headerRow}>
            <View style={styles.titleGroup}>
              {renderIcon()}
              <Text style={styles.title}>{title}</Text>
            </View>
            <TouchableOpacity
              onPress={onCancel}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X size={16} color={Palette.overlay0} />
            </TouchableOpacity>
          </View>

          <Text style={styles.message}>{message}</Text>

          <View style={styles.btnRow}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={onCancel}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelBtnText}>{cancelText}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.confirmBtn,
                isDestructive
                  ? styles.destructiveBtn
                  : icon === 'reset'
                  ? styles.resetBtn
                  : styles.primaryBtn,
              ]}
              onPress={onConfirm}
              activeOpacity={0.8}
            >
              <Text style={styles.confirmBtnText}>{confirmText}</Text>
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
    backgroundColor: 'rgba(17, 17, 27, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: Palette.surface0,
    borderRadius: 12,
    padding: 18,
    borderWidth: 1,
    borderColor: Palette.surface2,
  },
  destructiveCard: {
    borderColor: 'rgba(243, 139, 168, 0.35)',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    marginRight: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: Palette.text,
  },
  message: {
    fontSize: 13,
    color: Palette.subtext0,
    lineHeight: 18,
    marginBottom: 20,
  },
  btnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  cancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: Palette.surface1,
    borderWidth: 1,
    borderColor: Palette.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    color: Palette.subtext0,
    fontSize: 13,
    fontWeight: '600',
  },
  confirmBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  destructiveBtn: {
    backgroundColor: Palette.red,
  },
  primaryBtn: {
    backgroundColor: Palette.mauve,
  },
  resetBtn: {
    backgroundColor: Palette.sapphire,
  },
  confirmBtnText: {
    color: Palette.crust,
    fontSize: 13,
    fontWeight: '700',
  },
});
