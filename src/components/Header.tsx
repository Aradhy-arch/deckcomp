import { Menu, Settings } from 'lucide-react-native';
import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Palette } from '../constants/theme';
import { NetworkStatus } from '../types';

interface HeaderProps {
  hostIp: string;
  hostPort: number;
  networkStatus: NetworkStatus;
  hostname: string | null;
  isPaired?: boolean;
  onOpenConfig: () => void;
  onOpenDrawer: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  networkStatus,
  hostname,
  isPaired = true,
  onOpenConfig,
  onOpenDrawer,
}) => {
  const getStatusColor = () => {
    if (!isPaired) {
      return Palette.overlay0;
    }
    switch (networkStatus) {
      case 'online':
        return Palette.green;
      case 'checking':
        return Palette.yellow;
      case 'offline':
      default:
        return Palette.red;
    }
  };

  const getStatusLabel = () => {
    if (!isPaired) {
      return 'Not Paired';
    }
    switch (networkStatus) {
      case 'online':
        return hostname ? hostname : 'Connected';
      case 'checking':
        return 'Connecting...';
      case 'offline':
      default:
        return 'Offline';
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.leftRow}>
        <TouchableOpacity
          style={styles.drawerBtn}
          onPress={onOpenDrawer}
          activeOpacity={0.7}
        >
          <Menu size={20} color={Palette.text} />
        </TouchableOpacity>
        <View style={styles.brandContainer}>
          <Image
            source={require('../../assets/icon.png')}
            style={styles.logoImage}
            resizeMode="cover"
          />
          <Text style={styles.brandTitle}>DeckComp</Text>
        </View>
        <View style={styles.statusIndicator}>
          <View style={[styles.statusDot, { backgroundColor: getStatusColor() }]} />
          <Text style={styles.statusText}>
            {getStatusLabel()}
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.configBtn}
        onPress={onOpenConfig}
        activeOpacity={0.7}
      >
        <Settings size={18} color={Palette.subtext0} />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Palette.mantle,
    borderBottomWidth: 1,
    borderBottomColor: Palette.surface0,
  },
  leftRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  drawerBtn: {
    paddingRight: 12,
    paddingVertical: 4,
  },
  brandContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 10,
    gap: 6,
  },
  logoImage: {
    width: 22,
    height: 22,
    borderRadius: 6,
  },
  brandTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Palette.text,
    letterSpacing: -0.3,
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    gap: 5,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
    color: Palette.subtext0,
  },
  configBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
