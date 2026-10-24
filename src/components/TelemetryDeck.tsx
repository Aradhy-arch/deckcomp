import { Laptop, Monitor, Smartphone, Zap } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Palette } from '../constants/theme';
import { ClientBattery, HostTelemetry } from '../types';

interface TelemetryDeckProps {
  hostTelemetry: HostTelemetry | null;
  clientBattery: ClientBattery;
}

export const TelemetryDeck: React.FC<TelemetryDeckProps> = ({
  hostTelemetry,
  clientBattery,
}) => {
  const hostBat = hostTelemetry?.battery;

  // Check if host is a desktop PC vs a Laptop
  const isPC =
    hostTelemetry?.device_type === 'desktop' ||
    (hostTelemetry !== null && hostBat?.present === false && hostBat?.percent === null);

  const hostPercent = isPC
    ? 'PC'
    : hostBat?.percent !== null && hostBat?.percent !== undefined
    ? `${hostBat.percent}%`
    : hostTelemetry?.ac_connected
    ? 'AC Only'
    : 'Offline';

  const isHostCharging =
    !isPC && (hostBat?.status?.toLowerCase().includes('charging') || hostTelemetry?.ac_connected);

  const phonePercent =
    clientBattery.batteryLevel !== null
      ? `${Math.round(clientBattery.batteryLevel * 100)}%`
      : 'Unavailable';

  const isPhoneCharging = clientBattery.batteryState === 'charging';

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        {/* Host Side */}
        <View style={styles.deviceCol}>
          <View style={styles.headerRow}>
            <View style={styles.labelRow}>
              {isPC ? (
                <Monitor size={13} color={Palette.overlay1} style={styles.headerIcon} />
              ) : (
                <Laptop size={13} color={Palette.overlay1} style={styles.headerIcon} />
              )}
              <Text style={styles.deviceLabel} numberOfLines={1}>
                {isPC ? 'Desktop PC' : 'Laptop'}
              </Text>
            </View>
            {isHostCharging && (
              <Zap size={12} color={Palette.green} />
            )}
          </View>
          <Text style={styles.percentText} numberOfLines={1}>{hostPercent}</Text>
          <Text style={styles.detailText} numberOfLines={1} ellipsizeMode="tail">
            {isPC
              ? hostTelemetry?.ac_connected ? 'Mains Power' : 'Linux PC'
              : hostBat?.power_supply_name || (hostTelemetry?.ac_connected ? 'Mains Power' : 'Battery')}
          </Text>
        </View>

        {/* Subtle Vertical Divider */}
        <View style={styles.divider} />

        {/* Phone Side */}
        <View style={styles.deviceCol}>
          <View style={styles.headerRow}>
            <View style={styles.labelRow}>
              <Smartphone size={13} color={Palette.overlay1} style={styles.headerIcon} />
              <Text style={styles.deviceLabel} numberOfLines={1}>Phone</Text>
            </View>
            {isPhoneCharging && (
              <Zap size={12} color={Palette.green} />
            )}
          </View>
          <Text style={styles.percentText} numberOfLines={1}>{phonePercent}</Text>
          <Text style={styles.detailText} numberOfLines={1} ellipsizeMode="tail">
            {clientBattery.isLowPower ? 'Battery Saver' : 'Android Client'}
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginTop: 10,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: Palette.surface0,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: Palette.surface1,
    alignItems: 'center',
  },
  deviceCol: {
    flex: 1,
  },
  divider: {
    width: 1,
    height: '80%',
    backgroundColor: Palette.surface1,
    marginHorizontal: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIcon: {
    marginRight: 4,
  },
  deviceLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Palette.subtext0,
  },
  percentText: {
    fontSize: 18,
    fontWeight: '700',
    color: Palette.text,
    letterSpacing: -0.3,
  },
  detailText: {
    fontSize: 11,
    color: Palette.overlay0,
    marginTop: 1,
  },
});
