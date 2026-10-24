import {
  Minus,
  Pause,
  Play,
  Plus,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  GestureResponderEvent,
  LayoutChangeEvent,
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
  const [localVolume, setLocalVolume] = useState<number>(mediaStatus?.volume ?? 0.5);
  const [localMuted, setLocalMuted] = useState<boolean>(mediaStatus?.muted ?? false);
  const [isInteracting, setIsInteracting] = useState(false);

  const trackRef = useRef<any>(null);
  const trackLayoutRef = useRef<{ pageX: number; width: number }>({ pageX: 0, width: 200 });
  const cooldownUntilRef = useRef<number>(0);

  // Sync from props when user is not actively touching the volume slider and cooldown has expired
  useEffect(() => {
    if (!isInteracting && mediaStatus && Date.now() > cooldownUntilRef.current) {
      setLocalVolume(mediaStatus.volume);
      setLocalMuted(mediaStatus.muted);
    }
  }, [mediaStatus, isInteracting]);

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

  const handleVolumeStep = async (direction: 'up' | 'down') => {
    if (!apiClient) return;
    cooldownUntilRef.current = Date.now() + 2500;
    const delta = direction === 'up' ? 0.05 : -0.05;
    const next = Math.max(0, Math.min(1, Math.round((localVolume + delta) * 100) / 100));
    setLocalVolume(next);
    if (localMuted && direction === 'up') {
      setLocalMuted(false);
    }
    try {
      const res = await apiClient.adjustVolume(direction, 5);
      if (res && typeof res.volume === 'number') {
        setLocalVolume(res.volume);
        setLocalMuted(res.muted);
      }
    } catch {
      // Silent catch
    }
  };

  const handleToggleMute = async () => {
    if (!apiClient) return;
    cooldownUntilRef.current = Date.now() + 2500;
    const nextMute = !localMuted;
    setLocalMuted(nextMute);
    try {
      const res = await apiClient.adjustVolume('mute');
      if (res && typeof res.muted === 'boolean') {
        setLocalMuted(res.muted);
      }
    } catch {
      setLocalMuted(!nextMute);
    }
  };

  const measureTrack = () => {
    trackRef.current?.measure((_x: number, _y: number, width: number, _height: number, pageX: number) => {
      if (width > 0) {
        trackLayoutRef.current = { pageX, width };
      }
    });
  };

  const handleTrackLayout = (_e: LayoutChangeEvent) => {
    measureTrack();
  };

  const calculateRatioFromEvent = (evt: GestureResponderEvent): number => {
    const { pageX: trackPageX, width } = trackLayoutRef.current;
    const touchPageX = evt.nativeEvent.pageX;
    const effectiveWidth = width > 0 ? width : 200;
    const relativeX = touchPageX - trackPageX;
    const clampedRatio = Math.max(0, Math.min(1, relativeX / effectiveWidth));
    return Math.round(clampedRatio * 100) / 100;
  };

  const handleTouchStart = (evt: GestureResponderEvent) => {
    measureTrack();
    setIsInteracting(true);
    cooldownUntilRef.current = Date.now() + 3000;
    const newVol = calculateRatioFromEvent(evt);
    setLocalVolume(newVol);
    if (localMuted && newVol > 0) {
      setLocalMuted(false);
    }
  };

  const handleTouchMove = (evt: GestureResponderEvent) => {
    const newVol = calculateRatioFromEvent(evt);
    setLocalVolume(newVol);
  };

  const handleTouchEnd = async (evt: GestureResponderEvent) => {
    const newVol = calculateRatioFromEvent(evt);
    setLocalVolume(newVol);
    setIsInteracting(false);
    cooldownUntilRef.current = Date.now() + 2500;
    if (!apiClient) return;
    try {
      const res = await apiClient.adjustVolume('set', 5, newVol);
      if (res && typeof res.volume === 'number') {
        setLocalVolume(res.volume);
        setLocalMuted(res.muted);
      }
    } catch {
      // Silent catch
    }
  };

  const isPlaying = mediaStatus?.playback_status === 'Playing';
  const volumePercent = Math.round(localVolume * 100);

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        {/* Track Metadata */}
        <View style={styles.trackSection}>
          <Text style={styles.trackTitle} numberOfLines={1} ellipsizeMode="tail">
            {mediaStatus?.title || 'No Media Playing'}
          </Text>
          <Text style={styles.trackArtist} numberOfLines={1} ellipsizeMode="tail">
            {mediaStatus?.artist || (mediaStatus?.player ? mediaStatus.player : 'Playback Idle')}
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

        {/* Interactive Volume Attenuation Bar */}
        <View style={styles.volumeBar}>
          <TouchableOpacity
            style={styles.volStep}
            onPress={() => handleVolumeStep('down')}
            activeOpacity={0.6}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Minus size={14} color={Palette.text} />
          </TouchableOpacity>

          {/* Interactive touch/drag slider track with pure absolute pageX tracking */}
          <View
            ref={trackRef}
            style={styles.volTrack}
            onLayout={handleTrackLayout}
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
            onResponderTerminationRequest={() => false}
            onResponderGrant={handleTouchStart}
            onResponderMove={handleTouchMove}
            onResponderRelease={handleTouchEnd}
            onResponderTerminate={() => {
              setIsInteracting(false);
              cooldownUntilRef.current = Date.now() + 1500;
            }}
          >
            <View
              pointerEvents="none"
              style={[
                styles.volFill,
                {
                  width: `${Math.min(100, Math.max(0, volumePercent))}%`,
                  backgroundColor: localMuted ? Palette.surface2 : 'rgba(203, 166, 247, 0.45)',
                },
              ]}
            />
            {/* Draggable indicator knob */}
            <View
              pointerEvents="none"
              style={[
                styles.sliderKnob,
                {
                  left: `${Math.min(97, Math.max(1, volumePercent))}%`,
                },
              ]}
            />
            <Text pointerEvents="none" style={styles.volLabel}>
              {localMuted ? 'Muted' : `${volumePercent}%`}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.volStep}
            onPress={() => handleVolumeStep('up')}
            activeOpacity={0.6}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Plus size={14} color={Palette.text} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.muteBtn, localMuted ? styles.muteActive : null]}
            onPress={handleToggleMute}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {localMuted ? (
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
    marginTop: 10,
  },
  card: {
    backgroundColor: Palette.surface0,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: Palette.surface1,
  },
  trackSection: {
    marginBottom: 10,
  },
  trackTitle: {
    fontSize: 15,
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
    marginBottom: 12,
  },
  circleBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Palette.surface1,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 14,
  },
  mainPlayBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: Palette.mauve,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Palette.mauve,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 4,
  },
  pauseActive: {
    backgroundColor: Palette.lavender,
  },
  volumeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Palette.surface1,
  },
  volStep: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Palette.surface1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  volTrack: {
    flex: 1,
    height: 28,
    backgroundColor: Palette.surface1,
    borderRadius: 14,
    marginHorizontal: 8,
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
  },
  sliderKnob: {
    position: 'absolute',
    width: 4,
    height: 16,
    borderRadius: 2,
    backgroundColor: Palette.mauve,
    marginLeft: -2,
    top: 6,
  },
  volLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Palette.text,
    zIndex: 2,
  },
  muteBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Palette.surface1,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  muteActive: {
    backgroundColor: 'rgba(243, 139, 168, 0.15)',
  },
});
