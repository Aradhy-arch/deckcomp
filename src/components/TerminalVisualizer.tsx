import { Flame, Sparkles, X } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Palette } from '../constants/theme';

export interface TerminalVisualizerProps {
  app: 'lavat' | 'cmatrix';
  onClose: () => void;
}

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  temp: number;
}

interface LineSegment {
  text: string;
  color: string;
}

const W = 34;
const H = 13;

const PALETTES = {
  mauve: {
    name: 'Mauve',
    core: Palette.mauve,
    inner: Palette.pink,
    outer: Palette.lavender,
    halo: Palette.surface2,
  },
  sunset: {
    name: 'Sunset',
    core: Palette.peach,
    inner: Palette.maroon,
    outer: Palette.red,
    halo: Palette.surface2,
  },
  cyber: {
    name: 'Cyber',
    core: Palette.green,
    inner: Palette.teal,
    outer: Palette.sapphire,
    halo: Palette.surface1,
  },
  party: {
    name: 'Party 🪩',
    core: Palette.flamingo,
    inner: Palette.yellow,
    outer: Palette.sky,
    halo: Palette.surface2,
  },
};

const MATRIX_GLYPHS = '0123456789ABCDEF$#@%&*+=:<>~ｦｱｳｴｵｶｷｹｺｻｼｽｾｿﾀﾂﾃﾅﾆﾇﾈﾊﾋﾎﾏﾐﾑﾒﾓﾔﾕﾗﾘﾜ';

export const TerminalVisualizer: React.FC<TerminalVisualizerProps> = ({ app, onClose }) => {
  const [frameCount, setFrameCount] = useState(0);
  const [paletteMode, setPaletteMode] = useState<keyof typeof PALETTES>('mauve');
  const [convectionMode, setConvectionMode] = useState(true);

  // Lavat Metaballs
  const ballsRef = useRef<Ball[]>([
    { x: 8, y: 10, vx: 0.15, vy: -0.22, r: 3.2, temp: 1.0 },
    { x: 18, y: 3, vx: -0.18, vy: 0.18, r: 3.8, temp: 0.2 },
    { x: 26, y: 8, vx: 0.12, vy: -0.16, r: 2.9, temp: 0.8 },
    { x: 12, y: 4, vx: 0.22, vy: 0.12, r: 3.4, temp: 0.3 },
    { x: 22, y: 11, vx: -0.14, vy: -0.28, r: 3.1, temp: 0.9 },
    { x: 5, y: 6, vx: 0.12, vy: 0.14, r: 2.6, temp: 0.5 },
    { x: 29, y: 5, vx: -0.16, vy: 0.11, r: 2.8, temp: 0.4 },
  ]);

  // CMatrix Columns
  const matrixColsRef = useRef<
    { head: number; len: number; speed: number; chars: string[] }[]
  >(
    Array.from({ length: W }, () => ({
      head: Math.floor(Math.random() * -12),
      len: 4 + Math.floor(Math.random() * 7),
      speed: 0.6 + Math.random() * 0.7,
      chars: Array.from(
        { length: H + 12 },
        () => MATRIX_GLYPHS[Math.floor(Math.random() * MATRIX_GLYPHS.length)]
      ),
    }))
  );

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (app === 'lavat') {
      timer = setInterval(() => {
        // Step lavat physics
        const balls = ballsRef.current;
        for (const b of balls) {
          if (convectionMode) {
            if (b.y > H - 2.8) {
              b.temp = Math.min(1.0, b.temp + 0.08);
              b.vy -= 0.05 * b.temp;
            } else if (b.y < 2.2) {
              b.temp = Math.max(0.0, b.temp - 0.08);
              b.vy += 0.05 * (1.0 - b.temp);
            } else {
              b.vy += b.temp > 0.5 ? -0.015 : 0.015;
            }
            b.vx += (Math.random() - 0.5) * 0.02;
          }

          // Clamp velocity
          b.vx = Math.max(-0.4, Math.min(0.4, b.vx));
          b.vy = Math.max(-0.4, Math.min(0.4, b.vy));

          b.x += b.vx;
          b.y += b.vy;

          // Bounds
          if (b.x < 1.4) {
            b.x = 1.4;
            b.vx = Math.abs(b.vx);
          } else if (b.x > W - 1.4) {
            b.x = W - 1.4;
            b.vx = -Math.abs(b.vx);
          }

          if (b.y < 0.8) {
            b.y = 0.8;
            b.vy = Math.abs(b.vy);
          } else if (b.y > H - 0.8) {
            b.y = H - 0.8;
            b.vy = -Math.abs(b.vy);
          }
        }
        setFrameCount((f) => f + 1);
      }, 42); // ~24 FPS
    } else {
      timer = setInterval(() => {
        // Step matrix rain
        const cols = matrixColsRef.current;
        for (const col of cols) {
          col.head += col.speed;
          if (col.head - col.len > H) {
            col.head = -Math.floor(Math.random() * 8);
            col.len = 4 + Math.floor(Math.random() * 7);
            col.speed = 0.6 + Math.random() * 0.7;
          }
        }
        setFrameCount((f) => f + 1);
      }, 50); // ~20 FPS
    }

    return () => clearInterval(timer);
  }, [app, convectionMode]);

  // Render Lavat Frame
  const renderLavatLines = (): LineSegment[][] => {
    const curPal = PALETTES[paletteMode];
    const balls = ballsRef.current;
    const lines: LineSegment[][] = [];

    // Rainbow party cycle
    const partyColors = [
      Palette.red,
      Palette.peach,
      Palette.yellow,
      Palette.green,
      Palette.teal,
      Palette.sky,
      Palette.blue,
      Palette.lavender,
      Palette.mauve,
      Palette.pink,
    ];
    const partyCore =
      paletteMode === 'party'
        ? partyColors[Math.floor(frameCount / 4) % partyColors.length]
        : curPal.core;

    for (let y = 0; y < H; y++) {
      const segments: LineSegment[] = [];
      let currentRun = '';
      let currentColor = '';

      for (let x = 0; x < W; x++) {
        let sum = 0;
        for (let i = 0; i < balls.length; i++) {
          const b = balls[i];
          const dx = (x - b.x) * 0.55;
          const dy = y - b.y;
          sum += (b.r * b.r) / (dx * dx + dy * dy + 0.001);
        }

        let char = ' ';
        let color: string = Palette.crust;

        if (sum >= 1.4) {
          char = '█';
          color = partyCore;
        } else if (sum >= 0.95) {
          char = '▓';
          color = curPal.inner;
        } else if (sum >= 0.6) {
          char = '▒';
          color = curPal.outer;
        } else if (sum >= 0.35) {
          char = '░';
          color = curPal.halo;
        }

        if (color === currentColor) {
          currentRun += char;
        } else {
          if (currentRun) {
            segments.push({ text: currentRun, color: currentColor });
          }
          currentRun = char;
          currentColor = color;
        }
      }

      if (currentRun) {
        segments.push({ text: currentRun, color: currentColor });
      }
      lines.push(segments);
    }

    return lines;
  };

  // Render CMatrix Frame
  const renderCMatrixLines = (): LineSegment[][] => {
    const cols = matrixColsRef.current;
    const lines: LineSegment[][] = [];

    for (let y = 0; y < H; y++) {
      const segments: LineSegment[] = [];
      let currentRun = '';
      let currentColor = '';

      for (let x = 0; x < W; x++) {
        const col = cols[x];
        const dist = col.head - y;

        let char = ' ';
        let color: string = Palette.crust;

        if (dist >= 0 && dist < col.len) {
          const charIdx = (Math.floor(col.head) + x + y) % col.chars.length;
          char = col.chars[charIdx] || '0';

          if (dist < 1) {
            color = '#ffffff'; // Leading white head
          } else if (dist < 3) {
            color = Palette.green; // Bright green
          } else if (dist < 6) {
            color = Palette.teal; // Medium teal/green
          } else {
            color = Palette.surface2; // Faded tail
          }
        }

        if (color === currentColor) {
          currentRun += char;
        } else {
          if (currentRun) {
            segments.push({ text: currentRun, color: currentColor });
          }
          currentRun = char;
          currentColor = color;
        }
      }

      if (currentRun) {
        segments.push({ text: currentRun, color: currentColor });
      }
      lines.push(segments);
    }

    return lines;
  };

  const renderedLines = app === 'lavat' ? renderLavatLines() : renderCMatrixLines();

  return (
    <View style={styles.container}>
      {/* Visualizer Top Bar */}
      <View style={styles.topBar}>
        <View style={styles.titleBadge}>
          {app === 'lavat' ? (
            <Flame size={13} color={Palette.peach} />
          ) : (
            <Sparkles size={13} color={Palette.green} />
          )}
          <Text style={styles.titleText}>
            {app === 'lavat' ? 'LAVAT FLUID VISUALIZER' : 'CMATRIX DIGITAL STREAM'}
          </Text>
        </View>

        <TouchableOpacity style={styles.stopBtn} onPress={onClose} activeOpacity={0.7}>
          <X size={12} color={Palette.red} />
          <Text style={styles.stopBtnText}>Stop (Ctrl+C)</Text>
        </TouchableOpacity>
      </View>

      {/* Modifier Controls */}
      {app === 'lavat' && (
        <View style={styles.controlsRow}>
          <TouchableOpacity
            style={styles.modChip}
            onPress={() => {
              const keys = Object.keys(PALETTES) as (keyof typeof PALETTES)[];
              const nextIdx = (keys.indexOf(paletteMode) + 1) % keys.length;
              setPaletteMode(keys[nextIdx]);
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.modChipText}>Palette: {PALETTES[paletteMode].name}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.modChip, convectionMode && styles.modChipActive]}
            onPress={() => setConvectionMode((v) => !v)}
            activeOpacity={0.7}
          >
            <Text style={[styles.modChipText, convectionMode && styles.modChipTextActive]}>
              {convectionMode ? '♨ Convection' : '● Bounce'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ASCII Viewport Canvas */}
      <View style={styles.viewport}>
        {renderedLines.map((line, lIdx) => (
          <Text key={lIdx} style={styles.lineText} numberOfLines={1}>
            {line.map((seg, sIdx) => (
              <Text key={sIdx} style={{ color: seg.color }}>
                {seg.text}
              </Text>
            ))}
          </Text>
        ))}
      </View>

      {/* Telemetry Status Line */}
      <View style={styles.footerRow}>
        <Text style={styles.footerPrompt}>
          ❯ {app === 'lavat' ? `lavat -g -b ${ballsRef.current.length} (${PALETTES[paletteMode].name})` : 'cmatrix -b -u 4'} • 25 FPS
        </Text>
        <Text style={styles.footerSub}>tap Stop to return</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: Palette.mantle,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Palette.surface1,
    padding: 10,
    marginBottom: 12,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  titleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Palette.surface0,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Palette.surface1,
  },
  titleText: {
    fontSize: 10,
    fontWeight: '800',
    fontFamily: 'monospace',
    color: Palette.text,
    letterSpacing: 0.5,
  },
  stopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(243, 139, 168, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(243, 139, 168, 0.3)',
  },
  stopBtnText: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: 'monospace',
    color: Palette.red,
  },
  controlsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  modChip: {
    backgroundColor: Palette.surface0,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Palette.surface1,
  },
  modChipActive: {
    borderColor: Palette.mauve,
    backgroundColor: Palette.surface1,
  },
  modChipText: {
    fontSize: 10,
    fontFamily: 'monospace',
    color: Palette.subtext0,
    fontWeight: '600',
  },
  modChipTextActive: {
    color: Palette.mauve,
    fontWeight: '700',
  },
  viewport: {
    backgroundColor: Palette.crust,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: Palette.surface0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lineText: {
    fontFamily: 'monospace',
    fontSize: 11,
    lineHeight: 13,
    letterSpacing: 1.2,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingHorizontal: 2,
  },
  footerPrompt: {
    fontSize: 10,
    fontFamily: 'monospace',
    color: Palette.mauve,
    fontWeight: '600',
  },
  footerSub: {
    fontSize: 9,
    fontFamily: 'monospace',
    color: Palette.overlay0,
  },
});
