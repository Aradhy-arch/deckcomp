import AsyncStorage from '@react-native-async-storage/async-storage';
import { FunPreset } from '../types';

const STORAGE_KEY_PRESETS = '@deck_fun_presets_v1';

export const DEFAULT_PRESETS: FunPreset[] = [
  {
    id: 'lavat',
    title: 'Lavat Lamp',
    command: 'lavat',
    icon: 'Flame',
    spawnMode: 'ambient',
    description: 'Metaballs fluid lava lamp visualizer',
  },
  {
    id: 'cmatrix',
    title: 'Matrix Rain',
    command: 'cmatrix -b -u 4',
    icon: 'Terminal',
    spawnMode: 'terminal',
    description: 'Falling green code glyphs',
  },
  {
    id: 'btop',
    title: 'Btop Monitor',
    command: 'btop',
    icon: 'Activity',
    spawnMode: 'terminal',
    description: 'Interactive system resource monitor',
  },
  {
    id: 'fastfetch',
    title: 'Fastfetch',
    command: 'fastfetch || neofetch',
    icon: 'Cpu',
    spawnMode: 'terminal',
    description: 'System specs and distro artwork',
  },
];

export async function loadPresets(): Promise<FunPreset[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_PRESETS);
    if (!raw) {
      await savePresets(DEFAULT_PRESETS);
      return DEFAULT_PRESETS;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
    return DEFAULT_PRESETS;
  } catch {
    return DEFAULT_PRESETS;
  }
}

export async function savePresets(presets: FunPreset[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY_PRESETS, JSON.stringify(presets));
}

export async function addPreset(preset: Omit<FunPreset, 'id'>): Promise<FunPreset[]> {
  const current = await loadPresets();
  const newPreset: FunPreset = {
    ...preset,
    id: `preset_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
  };
  const updated = [...current, newPreset];
  await savePresets(updated);
  return updated;
}

export async function deletePreset(id: string): Promise<FunPreset[]> {
  const current = await loadPresets();
  const updated = current.filter((p) => p.id !== id);
  await savePresets(updated);
  return updated;
}

export async function resetPresets(): Promise<FunPreset[]> {
  await savePresets(DEFAULT_PRESETS);
  return DEFAULT_PRESETS;
}
