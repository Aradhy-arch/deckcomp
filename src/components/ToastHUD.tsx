import { AlertCircle, CheckCircle2 } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Palette } from '../constants/theme';

interface ToastHUDProps {
  message: string | null;
  isError?: boolean;
  onDismiss?: () => void;
}

export const ToastHUD: React.FC<ToastHUDProps> = ({ message, isError = false, onDismiss }) => {
  if (!message) return null;

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onDismiss}
      style={[
        styles.container,
        {
          borderColor: isError ? Palette.red : Palette.mauve,
        },
      ]}
    >
      <View style={styles.iconWrapper}>
        {isError ? (
          <AlertCircle size={18} color={Palette.red} />
        ) : (
          <CheckCircle2 size={18} color={Palette.green} />
        )}
      </View>
      <Text style={styles.messageText} numberOfLines={2}>
        {message}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 65,
    left: 16,
    right: 16,
    zIndex: 9999,
    backgroundColor: Palette.mantle,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 12,
  },
  iconWrapper: {
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  messageText: {
    flex: 1,
    color: Palette.text,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
});
