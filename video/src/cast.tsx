import {Img, interpolateColors, random, staticFile} from 'remotion';
import {Star} from './fx';
import {color, heading, INK_WIDTH} from './theme';

// Every character is drawn in local coordinates with its feet at (0, 0), so squash and stretch
// pivot on the floor.

export type MouthKind = 'smile' | 'grin' | 'o' | 'frown' | 'flat' | 'smirk' | 'wavy';

export type Pose = {
  x: number;
  y: number;
  scale?: number;
  /** >1 stretches tall, <1 squashes flat. Volume is roughly kept. */
  squash?: number;
  lean?: number;
  /** Pupil direction, each axis -1..1. */
  look?: [number, number];
  /** 0 open, 1 closed. */
  lid?: number;
  /** Positive knits the brows (cross), negative raises the inner ends (worried). */
  brow?: number;
  mouth?: MouthKind;
  /** How far an open mouth is open, 0..1. */
  open?: number;
  /** Arm angles in degrees: 0 hangs down, 90 points sideways, 180 points up. [left, right]. */
  arms?: [number, number];
  opacity?: number;
};

const stroke = {stroke: color.ink, strokeWidth: INK_WIDTH, strokeLinejoin: 'round', strokeLinecap: 'round'} as const;

const Body: React.FC<{pose: Pose; children: React.ReactNode}> = ({pose, children}) => {
  const {x, y, scale = 1, squash = 1, lean = 0, opacity = 1} = pose;
  if (opacity <= 0.01) return null;
  const sx = scale / Math.sqrt(squash);
  const sy = scale * squash;
  return (
    <g transform={`translate(${x} ${y}) rotate(${lean}) scale(${sx} ${sy})`} opacity={opacity}>
      {children}
    </g>
  );
};

const Eye: React.FC<{x: number; y: number; r: number; look: [number, number]; lid: number; lidFill: string}> = ({
  x,
  y,
  r,
  look,
  lid,
  lidFill,
}) => {
  const h = r * 1.15;
  if (lid >= 0.95) {
    return <path d={`M ${x - r} ${y} Q ${x} ${y + r * 0.7} ${x + r} ${y}`} fill="none" {...stroke} strokeWidth={3.5} />;
  }
  const lidY = y - h + 2 * h * lid;
  const half = r * Math.sqrt(Math.max(0, 1 - ((lidY - y) / h) ** 2));
  return (
    <g>
      <ellipse cx={x} cy={y} rx={r} ry={h} fill={color.card} {...stroke} strokeWidth={3.5} />
      <circle cx={x + look[0] * r * 0.45} cy={y + look[1] * r * 0.4} r={r * 0.52} fill={color.ink} />
      <circle cx={x + look[0] * r * 0.45 + r * 0.18} cy={y + look[1] * r * 0.4 - r * 0.2} r={r * 0.16} fill={color.card} />
      {lid > 0.02 && (
        <path
          d={`M ${x - half} ${lidY} A ${r} ${h} 0 ${lid > 0.5 ? 1 : 0} 1 ${x + half} ${lidY} Z`}
          fill={lidFill}
          {...stroke}
          strokeWidth={3.5}
        />
      )}
    </g>
  );
};

const Eyes: React.FC<{x: number; y: number; gap: number; r: number; pose: Pose; lidFill: string}> = ({x, y, gap, r, pose, lidFill}) => {
  const {look = [0, 0], lid = 0, brow = 0} = pose;
  return (
    <g>
      {[-1, 1].map((side) => {
        const ex = x + side * gap;
        const browY = y - r * 1.15 - 10;
        return (
          <g key={side}>
            <Eye x={ex} y={y} r={r} look={look} lid={lid} lidFill={lidFill} />
            {brow !== 0 && (
              <line
                x1={ex - side * r * 1.1}
                y1={browY + brow}
                x2={ex + side * r * 1.1}
                y2={browY - brow * 0.6}
                {...stroke}
                strokeWidth={5}
              />
            )}
          </g>
        );
      })}
    </g>
  );
};

const Mouth: React.FC<{x: number; y: number; w: number; kind: MouthKind; open?: number; ink?: string}> = ({
  x,
  y,
  w,
  kind,
  open = 1,
  ink = color.ink,
}) => {
  const line = {fill: 'none', stroke: ink, strokeWidth: INK_WIDTH, strokeLinecap: 'round'} as const;
  switch (kind) {
    case 'smile':
      return <path d={`M ${x - w} ${y} Q ${x} ${y + w * 0.8} ${x + w} ${y}`} {...line} />;
    case 'grin':
      return (
        <g>
          <path d={`M ${x - w} ${y} Q ${x} ${y + w * (0.4 + open)} ${x + w} ${y} Z`} fill={ink} stroke={ink} strokeWidth={3} strokeLinejoin="round" />
          <ellipse cx={x} cy={y + w * (0.2 + open * 0.3)} rx={w * 0.45} ry={w * 0.18 * open} fill={color.coral} />
        </g>
      );
    case 'o':
      return <ellipse cx={x} cy={y + w * 0.2} rx={w * 0.38} ry={w * 0.5 * (0.6 + open * 0.4)} fill={ink} />;
    case 'frown':
      return <path d={`M ${x - w} ${y + w * 0.35} Q ${x} ${y - w * 0.35} ${x + w} ${y + w * 0.35}`} {...line} />;
    case 'flat':
      return <line x1={x - w * 0.8} y1={y} x2={x + w * 0.8} y2={y} {...line} />;
    case 'smirk':
      return <path d={`M ${x - w} ${y + 2} Q ${x} ${y + w * 0.5} ${x + w} ${y - w * 0.45}`} {...line} />;
    case 'wavy':
      return (
        <path
          d={`M ${x - w} ${y} q ${w / 4} ${-w / 4} ${w / 2} 0 q ${w / 4} ${w / 4} ${w / 2} 0 q ${w / 4} ${-w / 4} ${w / 2} 0 q ${w / 4} ${w / 4} ${w / 2} 0`}
          {...line}
        />
      );
  }
};

const Arm: React.FC<{x: number; y: number; angle: number; side: -1 | 1; length?: number; hand?: React.ReactNode}> = ({
  x,
  y,
  angle,
  side,
  length = 64,
  hand,
}) => {
  const radians = (angle * Math.PI) / 180;
  const ex = x + side * Math.sin(radians) * length;
  const ey = y + Math.cos(radians) * length;
  const midX = (x + ex) / 2 + side * 8;
  const midY = (y + ey) / 2 + 6;
  return (
    <g>
      <path d={`M ${x} ${y} Q ${midX} ${midY} ${ex} ${ey}`} fill="none" stroke={color.ink} strokeWidth={7} strokeLinecap="round" />
      <circle cx={ex} cy={ey} r={12} fill={color.card} {...stroke} strokeWidth={3.5} />
      {hand && <g transform={`translate(${ex} ${ey})`}>{hand}</g>}
    </g>
  );
};

/** The hero. A stout USB studio mic. `lit` 0 turns it grey and asleep (unplugged). */
export const UsbMic: React.FC<Pose & {lit?: number}> = (pose) => {
  const {lit = 1, arms = [25, 25], mouth = 'smile', open = 0.6} = pose;
  const head = interpolateColors(lit, [0, 1], [color.grey, color.sky]);
  return (
    <Body pose={pose}>
      <ellipse cx={0} cy={-12} rx={76} ry={18} fill={color.screen} {...stroke} />
      <rect x={-15} y={-80} width={30} height={66} rx={8} fill={color.screen} {...stroke} />
      <path d="M -84 -186 Q -84 -86 0 -86 Q 84 -86 84 -186" fill="none" stroke={color.ink} strokeWidth={12} strokeLinecap="round" />
      <Arm x={-64} y={-150} angle={arms[0]} side={-1} />
      <Arm x={64} y={-150} angle={arms[1]} side={1} />
      <rect x={-66} y={-304} width={132} height={200} rx={66} fill={head} {...stroke} />
      {[0, 1, 2].map((i) => (
        <line key={i} x1={-40 + i * 6} y1={-278 + i * 14} x2={40 - i * 6} y2={-278 + i * 14} stroke={color.ink} strokeWidth={3} strokeLinecap="round" opacity={0.55} />
      ))}
      <rect x={-66} y={-150} width={132} height={18} fill={color.butter} {...stroke} />
      <Eyes x={0} y={-212} gap={25} r={15} pose={pose} lidFill={head} />
      <Mouth x={0} y={-176} w={18} kind={mouth} open={open} />
    </Body>
  );
};

/** The MacBook's built-in mic. A polite understudy with a cup of tea. */
export const Laptop: React.FC<Pose & {sweat?: number; steam?: number}> = (pose) => {
  const {arms = [70, 70], mouth = 'smile', sweat = 0, steam = 0} = pose;
  return (
    <Body pose={pose}>
      <Arm x={-140} y={-70} angle={arms[0]} side={-1} length={56} />
      <Arm x={140} y={-70} angle={arms[1]} side={1} length={56} />
      <rect x={-140} y={-232} width={280} height={206} rx={18} fill={color.coral} {...stroke} />
      <rect x={-120} y={-214} width={240} height={168} rx={10} fill={color.card} {...stroke} />
      <circle cx={0} cy={-223} r={3.5} fill={color.ink} />
      <Eyes x={0} y={-140} gap={42} r={16} pose={pose} lidFill={color.card} />
      <Mouth x={0} y={-94} w={20} kind={mouth} />
      <rect x={-164} y={-30} width={328} height={30} rx={12} fill={color.coral} {...stroke} />
      {[0, 1, 2].map((i) => (
        <circle key={i} cx={-128 + i * 11} cy={-15} r={3} fill={color.ink} />
      ))}
      <g transform="translate(118 -30)">
        <path d="M 16 -40 q 16 0 16 16 q 0 16 -16 16" fill="none" {...stroke} />
        <rect x={-18} y={-52} width={38} height={52} rx={8} fill={color.sky} {...stroke} />
        {steam > 0 &&
          [-6, 8].map((dx, i) => (
            <path
              key={dx}
              d={`M ${dx} -62 q ${8 * Math.sin(steam + i)} -12 0 -24 q ${-8 * Math.sin(steam + i)} -12 0 -24`}
              fill="none"
              stroke={color.ink}
              strokeWidth={3}
              strokeLinecap="round"
              opacity={0.6}
            />
          ))}
      </g>
      {sweat > 0.02 && (
        <path d="M 150 -250 q -14 22 0 30 q 14 -8 0 -30 Z" fill={color.sky} {...stroke} strokeWidth={3} opacity={sweat} />
      )}
    </Body>
  );
};

/** The thieves. A pair of amber earbuds with one arm each. `hop` is a walk phase in radians. */
export const AirPods: React.FC<Pose & {hop?: number; hopHeight?: number; deflate?: number}> = (pose) => {
  const {hop = 0, hopHeight = 0, deflate = 0, mouth = 'smirk', arms = [20, 20]} = pose;
  const fill = interpolateColors(deflate, [0, 1], [color.amber, '#F2C98A']);
  return (
    <Body pose={pose}>
      {([-1, 1] as const).map((side) => {
        const lift = -Math.abs(Math.sin(hop + (side === 1 ? Math.PI / 2 : 0))) * hopHeight;
        return (
          <g key={side} transform={`translate(${side * 54} ${lift}) scale(1 ${1 - deflate * 0.3}) rotate(${side * 6})`}>
            <Arm x={side * 12} y={-84} angle={arms[side === -1 ? 0 : 1]} side={side} length={46} />
            <rect x={-14} y={-118} width={28} height={118} rx={14} fill={fill} {...stroke} />
            <circle cx={-side * 6} cy={-146} r={42} fill={fill} {...stroke} />
            <ellipse cx={-side * 34} cy={-150} rx={7} ry={11} fill={color.ink} opacity={0.75} />
            <Eyes x={-side * 6} y={-152} gap={14} r={9.5} pose={pose} lidFill={fill} />
            <Mouth x={-side * 6} y={-124} w={11} kind={mouth} open={0.4} />
          </g>
        );
      })}
    </Body>
  );
};

/** Mic Guard: a calm green shield bouncer with a whistle, wearing the real app icon as a badge. */
export const Guard: React.FC<Pose & {blow?: number}> = (pose) => {
  const {arms = [20, 20], blow = 0} = pose;
  const whistleShake = blow > 0 ? (random(`whistle-${Math.round(blow * 100)}`) - 0.5) * 6 : 0;
  const doubled = (d: string) => (
    <>
      <path d={d} fill="none" stroke={color.ink} strokeWidth={24} strokeLinecap="round" />
      <path d={d} fill="none" stroke={color.card} strokeWidth={14} strokeLinecap="round" />
    </>
  );
  return (
    <Body pose={pose}>
      <line x1={-32} y1={-80} x2={-36} y2={-8} stroke={color.ink} strokeWidth={9} strokeLinecap="round" />
      <line x1={32} y1={-80} x2={36} y2={-8} stroke={color.ink} strokeWidth={9} strokeLinecap="round" />
      <ellipse cx={-44} cy={-6} rx={22} ry={9} fill={color.ink} />
      <ellipse cx={44} cy={-6} rx={22} ry={9} fill={color.ink} />
      <Arm x={-132} y={-250} angle={arms[0]} side={-1} length={70} />
      <Arm x={132} y={-250} angle={arms[1]} side={1} length={70} />
      <path
        d="M 0 -350 C 55 -315 105 -310 140 -306 L 140 -200 C 140 -120 75 -72 0 -50 C -75 -72 -140 -120 -140 -200 L -140 -306 C -105 -310 -55 -315 0 -350 Z"
        fill={color.green}
        stroke={color.ink}
        strokeWidth={5}
        strokeLinejoin="round"
      />
      {doubled('M -66 -222 Q -66 -150 0 -150 Q 66 -150 66 -222')}
      {doubled('M 0 -150 L 0 -118')}
      {doubled('M -38 -114 L 38 -114')}
      <foreignObject x={-124} y={-300} width={62} height={62} transform="rotate(-10 -93 -269)">
        <Img src={staticFile('AppIcon-1024.png')} style={{width: 62, height: 62, display: 'block'}} />
      </foreignObject>
      <rect x={-37} y={-300} width={74} height={124} rx={37} fill={color.card} {...stroke} />
      <Eyes x={0} y={-258} gap={16} r={10.5} pose={pose} lidFill={color.card} />
      {blow > 0.05 && [-1, 1].map((side) => <circle key={side} cx={side * 24} cy={-212} r={9} fill={color.coral} opacity={0.75 * blow} />)}
      <g transform={`translate(${whistleShake} 0)`}>
        <rect x={-6} y={-222} width={48} height={22} rx={10} fill={color.butter} {...stroke} strokeWidth={3.5} />
        <circle cx={44} cy={-208} r={13} fill={color.butter} {...stroke} strokeWidth={3.5} />
      </g>
    </Body>
  );
};

/**
 * Your voice: a speech-bubble blob, centered on (x, y). `muffle` 1 turns it grey and glum, the way a
 * Bluetooth headset mic sounds. `stretch` pulls it wide during the tug of war.
 */
export const VoiceBlob: React.FC<{
  x: number;
  y: number;
  scale?: number;
  muffle: number;
  stretch?: number;
  rotate?: number;
  look?: [number, number];
  phase?: number;
}> = ({x, y, scale = 1, muffle, stretch = 1, rotate = 0, look = [0, 0], phase = 0}) => {
  const fill = interpolateColors(muffle, [0, 1], [color.butter, '#CEC8D0']);
  const pose: Pose = {x: 0, y: 0, look, lid: muffle * 0.45, brow: -muffle * 6};
  const clear = 1 - muffle;
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${scale * stretch} ${scale / stretch})`}>
      {clear > 0.05 &&
        [0, 1].map((i) => {
          const r = 34 + i * 22 + 4 * Math.sin(phase + i);
          return (
            <path
              key={i}
              d={`M ${82 + i * 10} ${-r * 0.6} A ${r} ${r} 0 0 1 ${82 + i * 10} ${r * 0.6}`}
              fill="none"
              stroke={color.ink}
              strokeWidth={5}
              strokeLinecap="round"
              opacity={clear}
            />
          );
        })}
      <path
        d="M -72 -8 C -72 -50 -40 -58 0 -58 C 42 -58 74 -50 74 -6 C 74 34 42 50 0 50 C -12 50 -22 49 -32 47 L -60 68 L -50 38 C -64 30 -72 14 -72 -8 Z"
        fill={fill}
        {...stroke}
        strokeWidth={5}
      />
      <Eyes x={0} y={-14} gap={22} r={12} pose={pose} lidFill={fill} />
      <Mouth x={0} y={18} w={13} kind={muffle > 0.5 ? 'wavy' : 'grin'} open={0.5} />
      {muffle > 0.5 && (
        <text x={92} y={-30} fontFamily={heading} fontWeight={800} fontSize={30} fill={color.muted} opacity={(muffle - 0.5) * 2} transform="rotate(12 92 -30)">
          mmf
        </text>
      )}
    </g>
  );
};

export const Spotlight: React.FC<{x: number; floor: number; tint: string}> = ({x, floor, tint}) => (
  <g>
    <polygon points={`890,-40 1030,-40 ${x + 250},${floor} ${x - 250},${floor}`} fill={tint} opacity={0.32} />
    <ellipse cx={x} cy={floor} rx={260} ry={44} fill={tint} opacity={0.55} />
  </g>
);

// Things flung around the brawl: a cable with its plug, sound waves, a mic, a star.
const Debris: React.FC<{kind: number}> = ({kind}) => {
  switch (kind % 4) {
    case 0:
      return (
        <g>
          <path d="M -70 0 q 17 -24 35 0 q 17 24 35 0 q 17 -24 35 0" fill="none" stroke={color.ink} strokeWidth={8} strokeLinecap="round" />
          <rect x={35} y={-11} width={30} height={22} rx={4} fill={color.screen} {...stroke} strokeWidth={3} />
        </g>
      );
    case 1:
      return (
        <g>
          {[0, 1, 2].map((i) => (
            <path key={i} d={`M ${i * 18} -${26 + i * 12} A ${30 + i * 12} ${30 + i * 12} 0 0 1 ${i * 18} ${26 + i * 12}`} fill="none" stroke={color.sky} strokeWidth={8} strokeLinecap="round" />
          ))}
        </g>
      );
    case 2:
      return <rect x={-22} y={-36} width={44} height={72} rx={22} fill={color.sky} {...stroke} />;
    default:
      return <Star x={0} y={0} r={30} fill={color.butter} />;
  }
};

/** The brawl: a boiling dust cloud with limbs poking out and debris swirling around it. `t` is frames since it started. */
export const FightCloud: React.FC<{x: number; y: number; scale: number; t: number}> = ({x, y, scale, t}) => {
  if (scale <= 0.01) return null;
  const puffs = Array.from({length: 11}, (_, i) => {
    const angle = (i / 11) * Math.PI * 2;
    return {cx: Math.cos(angle) * 150, cy: Math.sin(angle) * 105, r: 100 + 16 * Math.sin(t * 0.9 + i * 1.7)};
  });
  const step = Math.floor(t / 4);
  const bits = Array.from({length: 6}, (_, i) => {
    const angle = random(`fight-angle-${step}-${i}`) * Math.PI * 2;
    return {
      x: Math.cos(angle) * 250,
      y: Math.sin(angle) * 170,
      kind: Math.floor(random(`fight-kind-${step}-${i}`) * 4),
      rotate: random(`fight-rot-${step}-${i}`) * 360,
    };
  });
  const [jx, jy] = [(random(`cloud-x-${Math.floor(t / 2)}`) - 0.5) * 14, (random(`cloud-y-${Math.floor(t / 2)}`) - 0.5) * 14];
  const swirl = t * 0.16;
  return (
    <g transform={`translate(${x + jx} ${y + jy}) scale(${scale})`}>
      {[0, 1, 2].map((i) => {
        const start = swirl + (i * Math.PI * 2) / 3;
        const [rx, ry] = [420, 280];
        return (
          <path
            key={`swoosh${i}`}
            d={`M ${Math.cos(start) * rx} ${Math.sin(start) * ry} A ${rx} ${ry} 0 0 1 ${Math.cos(start + 1.1) * rx} ${Math.sin(start + 1.1) * ry}`}
            fill="none"
            stroke={color.ink}
            strokeWidth={7}
            strokeLinecap="round"
            opacity={0.5}
          />
        );
      })}
      {bits.map((bit, i) => (
        <g key={i} transform={`translate(${bit.x} ${bit.y}) rotate(${bit.rotate})`}>
          {bit.kind === 0 && <rect x={-14} y={-60} width={28} height={110} rx={14} fill={color.amber} {...stroke} />}
          {bit.kind === 1 && <rect x={-40} y={-60} width={80} height={120} rx={40} fill={color.sky} {...stroke} />}
          {bit.kind === 2 && <rect x={-50} y={-40} width={100} height={80} rx={10} fill={color.coral} {...stroke} />}
          {bit.kind === 3 && <line x1={0} y1={-70} x2={0} y2={70} stroke={color.ink} strokeWidth={7} strokeLinecap="round" />}
        </g>
      ))}
      {[...puffs, {cx: 0, cy: 0, r: 170}].map((puff, i) => (
        <circle key={`o${i}`} cx={puff.cx} cy={puff.cy} r={puff.r} fill="none" stroke={color.ink} strokeWidth={12} />
      ))}
      {[...puffs, {cx: 0, cy: 0, r: 170}].map((puff, i) => (
        <circle key={`f${i}`} cx={puff.cx} cy={puff.cy} r={puff.r} fill={color.card} />
      ))}
      {['#@!', '%&!', '@#?'].map((word, i) => {
        const wiggle = Math.sin(t * 0.8 + i * 2) * 10;
        return (
          <text
            key={word}
            x={(i - 1) * 130}
            y={(i % 2 === 0 ? -30 : 50) + wiggle}
            textAnchor="middle"
            fontFamily={heading}
            fontWeight={800}
            fontSize={72}
            fill={[color.amber, color.ink, color.sky][i]}
            transform={`rotate(${(i - 1) * 12 + wiggle / 2} ${(i - 1) * 130} ${i % 2 === 0 ? -30 : 50})`}
          >
            {word}
          </text>
        );
      })}
      {Array.from({length: 8}, (_, i) => {
        const angle = swirl * 1.4 + (i / 8) * Math.PI * 2;
        return (
          <g key={`debris${i}`} transform={`translate(${Math.cos(angle) * 390} ${Math.sin(angle) * 250}) rotate(${(angle * 180) / Math.PI + 90})`}>
            <Debris kind={i} />
          </g>
        );
      })}
    </g>
  );
};
