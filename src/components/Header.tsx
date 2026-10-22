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
  onOpenConfig: () => void;
  onOpenDrawer: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  networkStatus,
  hostname,
  onOpenConfig,
  onOpenDrawer,
}) => {
  const getStatusColor = () => {
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
          <Text style={styles.brandTitle}>Deck</Text>
          <Text style={styles.brandAccent}>Comp</Text>
        </View>
        <View style={styles.statusBadge}>
          <View style={[styles.statusDot, { backgroundColor: getStatusColor() }]} />
          <Text style={[styles.statusText, { color: getStatusColor() }]}>
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
    fontSize: 18,
    fontWeight: '800',
    color: Palette.text,
    letterSpacing: -0.3,
  },
  brandAccent: {
    fontSize: 18,
    fontWeight: '800',
    color: Palette.mauve,
    letterSpacing: -0.3,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Palette.surface0,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Palette.surface1,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  configBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Palette.surface0,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Palette.surface1,
  },
});
