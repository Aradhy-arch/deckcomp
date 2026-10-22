import {
  Minus,
  Music,
  Pause,
  Play,
  Plus,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
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
import { MediaStatus } from '../types';

interface MediaDeckProps {
  mediaStatus: MediaStatus | null;
  apiClient: ApiClient | null;
  onRefresh: () => void;
}

export const MediaDeck: React.FC<MediaDeckProps> = ({
  mediaStatus,
  apiClient,
  onRefresh,
}) => {
  const [busy, setBusy] = useState(false);

  const handleMediaControl = async (action: 'play-pause' | 'next' | 'previous') => {
    if (!apiClient) return;
    setBusy(true);
    try {
      await apiClient.controlMedia(action);
      onRefresh();
    } catch {
      // Handled silently
    } finally {
      setBusy(false);
    }
  };

  const handleVolume = async (direction: 'up' | 'down' | 'mute') => {
    if (!apiClient) return;
    try {
      await apiClient.adjustVolume(direction, 5);
      onRefresh();
    } catch {
      // Handled silently
    }
  };

  const isPlaying = mediaStatus?.playback_status === 'Playing';
  const volumePercent = mediaStatus ? Math.round(mediaStatus.volume * 100) : 0;
  const isMuted = mediaStatus?.muted || false;

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        {/* Track Metadata */}
        <View style={styles.trackSection}>
          <View style={styles.playerTag}>
            <Music size={10} color={Palette.mauve} style={{ marginRight: 4 }} />
            <Text style={styles.playerTagText}>
              {mediaStatus?.player ? mediaStatus.player : 'MPRIS'}
            </Text>
          </View>
          <Text style={styles.trackTitle} numberOfLines={1}>
            {mediaStatus?.title || 'No Media Playing'}
          </Text>
          <Text style={styles.trackArtist} numberOfLines={1}>
            {mediaStatus?.artist || (mediaStatus?.player ? 'Active Player' : 'Playback Idle')}
          </Text>
        </View>

        {/* Playback Controls */}
        <View style={styles.controlsRow}>
          <TouchableOpacity
            style={styles.circleBtn}
            onPress={() => handleMediaControl('previous')}
            disabled={busy || !apiClient}
            activeOpacity={0.7}
          >
            <SkipBack size={18} color={Palette.text} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.mainPlayBtn, isPlaying ? styles.pauseActive : null]}
            onPress={() => handleMediaControl('play-pause')}
            disabled={busy || !apiClient}
            activeOpacity={0.8}
          >
            {busy ? (
              <ActivityIndicator size="small" color={Palette.crust} />
            ) : isPlaying ? (
              <Pause size={22} color={Palette.crust} fill={Palette.crust} />
            ) : (
              <Play size={22} color={Palette.crust} fill={Palette.crust} style={{ marginLeft: 2 }} />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.circleBtn}
            onPress={() => handleMediaControl('next')}
            disabled={busy || !apiClient}
            activeOpacity={0.7}
          >
            <SkipForward size={18} color={Palette.text} />
          </TouchableOpacity>
        </View>

        {/* Integrated Volume Attenuation Bar */}
        <View style={styles.volumeBar}>
          <TouchableOpacity
            style={styles.volStep}
            onPress={() => handleVolume('down')}
            activeOpacity={0.7}
          >
            <Minus size={14} color={Palette.text} />
          </TouchableOpacity>

          <View style={styles.volTrack}>
            <View style={[styles.volFill, { width: `${Math.min(100, volumePercent)}%` }]} />
            <Text style={styles.volLabel}>
              {isMuted ? 'Muted' : `${volumePercent}%`}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.volStep}
            onPress={() => handleVolume('up')}
            activeOpacity={0.7}
          >
            <Plus size={14} color={Palette.text} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.muteBtn, isMuted ? styles.muteActive : null]}
            onPress={() => handleVolume('mute')}
            activeOpacity={0.7}
          >
            {isMuted ? (
              <VolumeX size={15} color={Palette.red} />
            ) : (
              <Volume2 size={15} color={Palette.subtext0} />
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginTop: 12,
  },
  card: {
    backgroundColor: Palette.surface0,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Palette.surface1,
  },
  trackSection: {
    marginBottom: 14,
  },
  playerTag: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Palette.surface1,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    marginBottom: 6,
  },
  playerTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: Palette.mauve,
    textTransform: 'uppercase',
  },
  trackTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Palette.text,
    letterSpacing: -0.2,
  },
  trackArtist: {
    fontSize: 12,
    color: Palette.subtext0,
    marginTop: 2,
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  circleBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Palette.surface1,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 14,
  },
  mainPlayBtn: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: Palette.mauve,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Palette.mauve,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  pauseActive: {
    backgroundColor: Palette.lavender,
  },
  volumeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Palette.surface1,
  },
  volStep: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Palette.surface1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  volTrack: {
    flex: 1,
    height: 26,
    backgroundColor: Palette.surface1,
    borderRadius: 13,
    marginHorizontal: 10,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  volFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: Palette.surface2,
  },
  volLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Palette.text,
  },
  muteBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Palette.surface1,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  muteActive: {
    backgroundColor: Palette.surface2,
  },
});
