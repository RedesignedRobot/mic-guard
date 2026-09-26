import {AbsoluteFill, interpolate, random, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {color, heading} from './theme';

type Easing = (t: number) => number;

export const lerp = (value: number, input: number[], output: number[], easing?: Easing) =>
  interpolate(value, input, output, {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing});

// Cartoon springs. `pop` overshoots on purpose; `glide` settles without bounce.
export const pop = (frame: number, fps: number, at: number) =>
  spring({frame: frame - at, fps, config: {damping: 9, stiffness: 170}});
export const glide = (frame: number, fps: number, at: number) =>
  spring({frame: frame - at, fps, config: {damping: 200}});

// Squash and stretch after an impact: a decaying bounce around 1.
export const wobble = (elapsed: number, amount = 0.25) =>
  elapsed < 0 ? 1 : 1 - amount * Math.exp(-elapsed * 0.16) * Math.cos(elapsed * 0.75);

// A point on a parabola from a to b that peaks `height` px above the straight line.
export const arc = (t: number, a: [number, number], b: [number, number], height: number): [number, number] => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t - Math.sin(t * Math.PI) * height,
];

// Deterministic shake that fades out over `length` frames.
export const shake = (elapsed: number, strength: number, length = 12, seed = 'shake'): [number, number] => {
  if (elapsed < 0 || elapsed > length) return [0, 0];
  const fade = 1 - elapsed / length;
  const step = Math.floor(elapsed / 2);
  return [
    (random(`${seed}-x-${step}`) - 0.5) * 2 * strength * fade,
    (random(`${seed}-y-${step}`) - 0.5) * 2 * strength * fade,
  ];
};

// Hand-drawn line boil plus a hard offset shadow. The noise seed steps every 3 frames.
export const BoilDefs: React.FC<{id: string; strength?: number}> = ({id, strength = 5}) => {
  const frame = useCurrentFrame();
  return (
    <defs>
      <filter id={id} x="-15%" y="-15%" width="130%" height="130%">
        <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves={2} seed={Math.floor(frame / 3)} result="noise" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale={strength} xChannelSelector="R" yChannelSelector="G" result="wobble" />
        <feDropShadow in="wobble" dx={7} dy={7} stdDeviation={0} floodColor={color.ink} floodOpacity={1} />
      </filter>
    </defs>
  );
};

export const Paper: React.FC<{children: React.ReactNode}> = ({children}) => (
  <AbsoluteFill style={{backgroundColor: color.paper}}>
    {children}
    <AbsoluteFill style={{pointerEvents: 'none', mixBlendMode: 'multiply'}}>
      <svg width="100%" height="100%">
        <filter id="paper-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves={3} seed={11} stitchTiles="stitch" />
          <feColorMatrix type="matrix" values="0 0 0 0 0.42  0 0 0 0 0.36  0 0 0 0 0.28  0.9 0 0 0 -0.32" />
        </filter>
        <rect width="100%" height="100%" filter="url(#paper-grain)" />
      </svg>
    </AbsoluteFill>
  </AbsoluteFill>
);

export type Caption = {from: number; text: string};

// A sticker in the top-left corner. An empty text clears it; \n breaks a line where the joke needs it.
export const Captions: React.FC<{list: Caption[]; top?: number}> = ({list, top = 64}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const index = list.findLastIndex((caption) => frame >= caption.from);

  return (
    <>
      {list.map((caption, i) => {
        const isCurrent = i === index;
        const isPrevious = i === index - 1;
        if ((!isCurrent && !isPrevious) || caption.text === '') return null;
        const enter = pop(frame, fps, caption.from);
        const leave = isPrevious ? lerp(frame - list[index].from, [0, 6], [0, 1]) : 0;
        const scale = Math.max(0, enter * (1 - leave));
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: 80,
              top,
              maxWidth: 1400,
              padding: '20px 34px 24px',
              background: color.card,
              border: `5px solid ${color.ink}`,
              borderRadius: 22,
              boxShadow: `9px 9px 0 ${color.ink}`,
              fontFamily: heading,
              fontWeight: 800,
              fontSize: 58,
              lineHeight: 1.08,
              letterSpacing: '-0.01em',
              color: color.ink,
              whiteSpace: 'pre-line',
              transform: `rotate(${-1.5 + (i % 2) * 2.5}deg) scale(${scale})`,
              transformOrigin: '0 0',
            }}
          >
            {caption.text}
          </div>
        );
      })}
    </>
  );
};

// Motion streaks trailing behind something that moves along `angle` (degrees, 0 = moving right).
export const SpeedLines: React.FC<{x: number; y: number; angle: number; strength: number; seed: string; spread?: number}> = ({
  x,
  y,
  angle,
  strength,
  seed,
  spread = 120,
}) => {
  if (strength <= 0.02) return null;
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle})`} opacity={Math.min(1, strength)}>
      {[0, 1, 2, 3, 4].map((i) => {
        const offset = (i / 4 - 0.5) * spread;
        const length = (80 + random(`${seed}-${i}`) * 140) * strength;
        const gap = 40 + random(`${seed}-gap-${i}`) * 50;
        return (
          <line
            key={i}
            x1={-gap}
            y1={offset}
            x2={-gap - length}
            y2={offset}
            stroke={color.ink}
            strokeWidth={6}
            strokeLinecap="round"
          />
        );
      })}
    </g>
  );
};

export const Burst: React.FC<{x: number; y: number; scale: number; rotate?: number; text: string; fill?: string; radius?: number}> = ({
  x,
  y,
  scale,
  rotate = 0,
  text,
  fill = color.butter,
  radius = 170,
}) => {
  if (scale <= 0.01) return null;
  const points = 14;
  const outline = Array.from({length: points * 2}, (_, i) => {
    const angle = (i / (points * 2)) * Math.PI * 2;
    const r = i % 2 === 0 ? radius * (0.92 + random(`burst-${i}`) * 0.16) : radius * 0.68;
    return `${Math.cos(angle) * r},${Math.sin(angle) * r}`;
  }).join(' ');
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${scale})`}>
      <polygon points={outline} fill={fill} stroke={color.ink} strokeWidth={6} strokeLinejoin="round" />
      <text
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily={heading}
        fontWeight={800}
        fontSize={Math.min(radius * 0.42, (radius * 2.1) / text.length)}
        fill={color.ink}
      >
        {text}
      </text>
    </g>
  );
};

export const Star: React.FC<{x: number; y: number; r: number; rotate?: number; fill?: string}> = ({x, y, r, rotate = 0, fill = color.butter}) => {
  if (r < 3) return null;
  const outline = Array.from({length: 10}, (_, i) => {
    const angle = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const radius = i % 2 === 0 ? r : r * 0.45;
    return `${Math.cos(angle) * radius},${Math.sin(angle) * radius}`;
  }).join(' ');
  return (
    <polygon
      transform={`translate(${x} ${y}) rotate(${rotate})`}
      points={outline}
      fill={fill}
      stroke={color.ink}
      strokeWidth={3.5}
      strokeLinejoin="round"
    />
  );
};

// Camera punch-ins: each punch zooms toward a point, holds, and eases back out.
export type Punch = {at: number; x: number; y: number; zoom: number; hold: number};

export const cameraTransform = (frame: number, fps: number, punches: Punch[]) => {
  const active = punches.findLast((punch) => frame >= punch.at - 2);
  if (!active) return '';
  const inAmount = spring({frame: frame - active.at, fps, config: {damping: 12, stiffness: 220}});
  const outAmount = glide(frame, fps, active.at + active.hold);
  const zoom = 1 + (active.zoom - 1) * inAmount * (1 - outAmount);
  const [dx, dy] = shake(frame - active.at, 14, 12, `punch-${active.at}`);
  return `translate(${active.x + dx} ${active.y + dy}) scale(${zoom}) translate(${-active.x} ${-active.y})`;
};
