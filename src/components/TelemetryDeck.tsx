import { Laptop, Smartphone, Zap } from 'lucide-react-native';
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
  const hostPercent =
    hostBat?.percent !== null && hostBat?.percent !== undefined
      ? `${hostBat.percent}%`
      : hostTelemetry?.ac_connected
      ? 'AC Only'
      : 'Offline';

  const isHostCharging =
    hostBat?.status?.toLowerCase().includes('charging') || hostTelemetry?.ac_connected;

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
              <Laptop size={12} color={Palette.subtext0} style={styles.headerIcon} />
              <Text style={styles.deviceLabel}>WORKSTATION</Text>
            </View>
            {isHostCharging && (
              <View style={[styles.badge, { backgroundColor: Palette.surface1 }]}>
                <Zap size={9} color={Palette.green} style={{ marginRight: 2 }} />
                <Text style={[styles.badgeText, { color: Palette.green }]}>CHARGING</Text>
              </View>
            )}
          </View>
          <Text style={styles.percentText}>{hostPercent}</Text>
          <Text style={styles.detailText}>
            {hostBat?.power_supply_name || (hostTelemetry?.ac_connected ? 'Mains Power' : 'Linux Host')}
          </Text>
        </View>

        {/* Subtle Vertical Divider */}
        <View style={styles.divider} />

        {/* Phone Side */}
        <View style={styles.deviceCol}>
          <View style={styles.headerRow}>
            <View style={styles.labelRow}>
              <Smartphone size={12} color={Palette.subtext0} style={styles.headerIcon} />
              <Text style={styles.deviceLabel}>PHONE</Text>
            </View>
            {isPhoneCharging && (
              <View style={[styles.badge, { backgroundColor: Palette.surface1 }]}>
                <Zap size={9} color={Palette.green} style={{ marginRight: 2 }} />
                <Text style={[styles.badgeText, { color: Palette.green }]}>CHARGING</Text>
              </View>
            )}
          </View>
          <Text style={styles.percentText}>{phonePercent}</Text>
          <Text style={styles.detailText}>
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
    marginTop: 14,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: Palette.surface0,
    borderRadius: 14,
    paddingVertical: 14,
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
    marginBottom: 4,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIcon: {
    marginRight: 4,
  },
  deviceLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Palette.subtext0,
    letterSpacing: 0.8,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  percentText: {
    fontSize: 22,
    fontWeight: '800',
    color: Palette.text,
    letterSpacing: -0.5,
  },
  detailText: {
    fontSize: 11,
    color: Palette.overlay0,
    marginTop: 2,
  },
});
