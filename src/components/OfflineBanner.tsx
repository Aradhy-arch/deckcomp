import { RefreshCw, WifiOff } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Palette } from '../constants/theme';

interface OfflineBannerProps {
  onRetry: () => void;
  errorMessage?: string | null;
}

export const OfflineBanner: React.FC<OfflineBannerProps> = ({ onRetry, errorMessage }) => {
  return (
    <View style={styles.container}>
      <WifiOff size={18} color={Palette.red} style={styles.icon} />
      <View style={styles.textContainer}>
        <Text style={styles.title}>Workstation Unreachable</Text>
        <Text style={styles.subtext} numberOfLines={2}>
          {errorMessage || 'Cannot establish connection to host daemon.'}
        </Text>
      </View>
      <TouchableOpacity style={styles.retryButton} onPress={onRetry} activeOpacity={0.7}>
        <RefreshCw size={12} color={Palette.text} style={styles.retryIcon} />
        <Text style={styles.retryText}>Retry</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: Palette.crust,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Palette.red,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  icon: {
    marginRight: 10,
  },
  textContainer: {
    flex: 1,
    marginRight: 12,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: Palette.red,
  },
  subtext: {
    fontSize: 11,
    color: Palette.subtext0,
    marginTop: 2,
  },
  retryButton: {
    backgroundColor: Palette.surface1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Palette.red,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  retryIcon: {
    marginRight: 2,
  },
  retryText: {
    color: Palette.text,
    fontSize: 12,
    fontWeight: '600',
  },
});
