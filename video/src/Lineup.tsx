import {AbsoluteFill, Easing, useCurrentFrame, useVideoConfig} from 'remotion';
import {AirPods, Guard, Laptop, Spotlight, UsbMic, VoiceBlob, type Pose} from './cast';
import {arc, BoilDefs, Burst, cameraTransform, Captions, lerp, Paper, pop, wobble, type Caption, type Punch} from './fx';
import {color, heading} from './theme';

// Act 2: Mic Guard lines the mics up by tier and hands your voice back to the USB mic. Then the
// USB mic gets unplugged, the built-in mic covers, and it gets plugged back in.

export const LINEUP_DURATION = 300;

const FLOOR = 1000;
const STEPS = [
  {rank: '1', label: 'Wired', left: 810, right: 1110, top: 700, fill: color.green, size: 96},
  {rank: '2', label: 'Built-in', left: 400, right: 810, top: 800, fill: color.sky, size: 80},
  {rank: '3', label: 'Bluetooth', left: 1110, right: 1450, top: 870, fill: color.silver, size: 60},
];
const MIC = {x: 960, y: 700, scale: 0.95};
const LAPTOP = {x: 600, y: 800};
const PODS = {x: 1280, y: 870};
const GUARD = {x: 230, y: FLOOR};

// Measured from the drawings in cast.tsx, in local units.
const MIC_HEAD_TOP = 304;
const LAPTOP_TOP = 232;
const PODS_HEAD_TOP = 188;
const GUARD_SHOULDER = {x: 132, y: -250, arm: 70};
const BLOB_ABOVE = 62;

const PORT = {x: 792, y: 785};
const HANGING = {x: 832, y: 905};
const CABLE_START = {x: 885, y: 694};
const CABLE_BEND = {x: 806, y: 700};

const LAND = {mic: 12, laptop: 22, pods: 32};
const TOSS = {from: 60, to: 82};
const UNPLUG = 150;
const TO_LAPTOP = {from: 180, to: 202};
const REPLUG = 225;
const TO_MIC = {from: 240, to: 265};

const captions: Caption[] = [
  {from: 0, text: 'It lines them up.\nWired, then built-in, then Bluetooth.'},
  {from: TOSS.from, text: 'Your voice goes back to the USB mic.'},
  {from: UNPLUG, text: 'Unplug it, and the built-in mic takes over.'},
  {from: REPLUG, text: 'Plug it back in, and the USB mic has it again.'},
];

const punches: Punch[] = [{at: UNPLUG, x: 860, y: 760, zoom: 1.15, hold: 30}];

// Characters fall onto their step, stretched on the way down and squashed on landing.
const dropIn = (f: number, at: number, seat: number) => ({
  y: lerp(f, [at - 12, at], [-420, seat], Easing.in(Easing.quad)),
  squash: f < at ? 1.25 : wobble(f - at, 0.3),
});

const micPose = (f: number): Pose & {lit: number} => {
  const lit = lerp(f, [UNPLUG, UNPLUG + 10, REPLUG, REPLUG + 8], [1, 0, 0, 1]);
  const base = {x: MIC.x, scale: MIC.scale, lit, ...dropIn(f, LAND.mic, MIC.y)};
  if (f < TOSS.to) return {...base, look: [-1, -0.6], brow: -4, mouth: 'o', arms: [150, 150]};
  if (f < UNPLUG) return {...base, squash: wobble(f - TOSS.to, -0.2), lid: 1, mouth: 'grin', open: 0.7, arms: [125, 125]};
  if (f < UNPLUG + 10) return {...base, squash: wobble(f - UNPLUG, -0.3), mouth: 'o', brow: -6, arms: [150, 150]};
  if (f < REPLUG) return {...base, squash: 0.94, lean: 4, lid: 1, mouth: 'flat', arms: [8, 8]};
  if (f < TO_MIC.to) return {...base, squash: wobble(f - REPLUG, -0.3), mouth: 'grin', look: [-1, -0.3], arms: [150, 150]};
  return {...base, squash: wobble(f - TO_MIC.to, -0.2), lid: 1, mouth: 'grin', open: 0.7, arms: [125, 125]};
};

const laptopPose = (f: number): React.ComponentProps<typeof Laptop> => {
  const base = {x: LAPTOP.x, ...dropIn(f, LAND.laptop, LAPTOP.y), steam: f * 0.12};
  if (f < UNPLUG + 10) return {...base, lid: 0.35, look: [1, -0.4], mouth: 'smile'};
  if (f < TO_LAPTOP.to) return {...base, look: [1, -0.5], mouth: 'o', brow: -5, arms: [150, 150]};
  if (f < REPLUG + 5) return {...base, squash: wobble(f - TO_LAPTOP.to, -0.15), look: [0, -0.6], mouth: 'grin'};
  // Hands it back with a little bow.
  if (f < TO_MIC.to) return {...base, lean: lerp(f, [REPLUG + 5, REPLUG + 13], [0, -8]), lid: 0.5, look: [1, -0.3], mouth: 'smile', arms: [70, 150]};
  return {...base, lean: lerp(f, [TO_MIC.to, TO_MIC.to + 10], [-8, 0]), lid: 0.35, look: [1, -0.4], mouth: 'smile'};
};

const podsPose = (f: number): React.ComponentProps<typeof AirPods> => {
  const sulk = {x: PODS.x, ...dropIn(f, LAND.pods, PODS.y), look: [0, 0.8] as [number, number], lid: 0.45, brow: -6, mouth: 'frown' as const};
  // When the USB mic drops out they reach for your voice, and it sails past them to the laptop.
  if (f >= UNPLUG + 12 && f < TO_LAPTOP.to) return {...sulk, look: [-1, -0.6], lid: 0, brow: 4, mouth: 'smirk', arms: [160, 20]};
  if (f >= TO_LAPTOP.to && f < TO_LAPTOP.to + 20) return {...sulk, look: [-1, 0], lid: 0, mouth: 'o', squash: wobble(f - TO_LAPTOP.to, 0.15)};
  return sulk;
};

const guardPose = (f: number): React.ComponentProps<typeof Guard> => ({
  x: GUARD.x,
  y: GUARD.y,
  squash: wobble(f - TOSS.from, 0.18),
  arms: [30, lerp(f, [TOSS.from, TOSS.from + 5, TOSS.from + 18], [170, 60, 30])],
  blow: lerp(f, [2, 6, 18, 22], [0, 1, 1, 0]),
  look: f < TOSS.to ? [1, -0.6] : [1, -0.3],
  lid: f > TOSS.to + 10 ? 0.4 : 0,
  brow: 3,
});

const HAND: [number, number] = [GUARD.x + GUARD_SHOULDER.x + 12, GUARD.y + GUARD_SHOULDER.y - GUARD_SHOULDER.arm - BLOB_ABOVE];

const micSeat = (mic: Pose): [number, number] => [MIC.x, mic.y - MIC_HEAD_TOP * MIC.scale * (mic.squash ?? 1) - BLOB_ABOVE];
const laptopSeat = (laptop: Pose): [number, number] => [LAPTOP.x, laptop.y - LAPTOP_TOP * (laptop.squash ?? 1) - BLOB_ABOVE];

const hop = (f: number, range: {from: number; to: number}, from: [number, number], to: [number, number], height: number) => {
  const progress = lerp(f, [range.from, range.to], [0, 1], Easing.inOut(Easing.quad));
  const [x, y] = arc(progress, from, to, height);
  return {x, y, rotate: 360 * progress * Math.sign(to[0] - from[0])};
};

const blobAt = (f: number, mic: Pose, laptop: Pose) => {
  const bob = 5 * Math.sin(f * 0.25);
  if (f < TOSS.from) return {x: HAND[0], y: HAND[1], rotate: 0};
  if (f < TOSS.to) return hop(f, TOSS, HAND, micSeat(mic), 260);
  if (f < TO_LAPTOP.from) return {x: MIC.x, y: micSeat(mic)[1] + bob, rotate: 0};
  if (f < TO_LAPTOP.to) return hop(f, TO_LAPTOP, micSeat(mic), laptopSeat(laptop), 170);
  if (f < TO_MIC.from) return {x: LAPTOP.x, y: laptopSeat(laptop)[1] + bob, rotate: 0};
  if (f < TO_MIC.to) return hop(f, TO_MIC, laptopSeat(laptop), micSeat(mic), 190);
  return {x: MIC.x, y: micSeat(mic)[1] + bob, rotate: 0};
};

// The USB cable runs from the mic's stand, over the step edge, into the laptop's port.
const Cable: React.FC<{f: number}> = ({f}) => {
  const out = Math.min(lerp(f, [UNPLUG, UNPLUG + 12], [0, 1], Easing.out(Easing.quad)), lerp(f, [REPLUG - 4, REPLUG], [1, 0], Easing.in(Easing.quad)));
  const [x, y] = arc(out, [PORT.x, PORT.y], [HANGING.x, HANGING.y], 70);
  const angle = 180 + out * 270;
  return (
    <g>
      <path d={`M ${CABLE_START.x} ${CABLE_START.y} Q ${CABLE_BEND.x} ${CABLE_BEND.y} ${x} ${y}`} fill="none" stroke={color.ink} strokeWidth={9} strokeLinecap="round" />
      <g transform={`translate(${x} ${y}) rotate(${angle})`}>
        <rect x={0} y={-10} width={32} height={20} rx={4} fill={color.screen} stroke={color.ink} strokeWidth={3} />
        <rect x={32} y={-7} width={12} height={14} fill={color.silver} stroke={color.ink} strokeWidth={3} />
      </g>
    </g>
  );
};

const Podium: React.FC = () => (
  <g>
    {STEPS.map((step) => {
      const height = FLOOR - step.top;
      const center = (step.left + step.right) / 2;
      return (
        <g key={step.rank}>
          <rect x={step.left} y={step.top} width={step.right - step.left} height={height} fill={step.fill} stroke={color.ink} strokeWidth={5} strokeLinejoin="round" />
          <text x={center} y={step.top + step.size * 0.62} textAnchor="middle" dominantBaseline="central" fontFamily={heading} fontWeight={800} fontSize={step.size} fill={color.ink}>
            {step.rank}
          </text>
          <text x={center} y={step.top + step.size * 1.2 + 14} textAnchor="middle" dominantBaseline="central" fontFamily={heading} fontWeight={700} fontSize={Math.max(30, step.size * 0.38)} fill={color.ink}>
            {step.label}
          </text>
        </g>
      );
    })}
  </g>
);

const RAIN_PUFFS = [
  [-45, 8, 30],
  [-10, -10, 40],
  [32, 4, 32],
  [0, 20, 36],
];

const RainCloud: React.FC<{x: number; y: number; scale: number; f: number}> = ({x, y, scale, f}) => {
  if (scale <= 0.01) return null;
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      {[-40, -12, 18, 44].map((dx, i) => {
        const drop = (f * 7 + i * 29) % 80;
        return <line key={dx} x1={dx} y1={30 + drop} x2={dx - 4} y2={48 + drop} stroke={color.sky} strokeWidth={5} strokeLinecap="round" opacity={1 - drop / 80} />;
      })}
      {RAIN_PUFFS.map(([cx, cy, r]) => (
        <circle key={`o${cx}`} cx={cx} cy={cy} r={r} fill="none" stroke={color.ink} strokeWidth={9} />
      ))}
      {RAIN_PUFFS.map(([cx, cy, r]) => (
        <circle key={`f${cx}`} cx={cx} cy={cy} r={r} fill={color.grey} />
      ))}
    </g>
  );
};

const BOIL = 'url(#boil-lineup)';

export const Lineup: React.FC = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const mic = micPose(f);
  const laptop = laptopPose(f);
  const pods = podsPose(f);
  const guard = guardPose(f);
  const blob = blobAt(f, mic, laptop);

  const spotX = lerp(f, [TOSS.from, TOSS.to, TO_LAPTOP.from, TO_LAPTOP.to, TO_MIC.from, TO_MIC.to], [GUARD.x, MIC.x, MIC.x, LAPTOP.x, LAPTOP.x, MIC.x]);
  const podium = pop(f, fps, 0);
  const tweet = pop(f, fps, 3) * lerp(f, [20, 26], [1, 0]);
  const popBurst = pop(f, fps, UNPLUG) * lerp(f, [UNPLUG + 14, UNPLUG + 20], [1, 0]);
  const clickBurst = pop(f, fps, REPLUG) * lerp(f, [REPLUG + 14, REPLUG + 20], [1, 0]);
  const rain = pop(f, fps, LAND.pods + 12);
  const asleep = f >= UNPLUG + 14 && f < REPLUG;

  return (
    <Paper>
      <AbsoluteFill>
        <svg width={1920} height={1080}>
          <BoilDefs id="boil-lineup" />
          <g transform={cameraTransform(f, fps, punches)}>
            <rect x={-100} y={FLOOR} width={2120} height={200} fill={color.floor} />
            <line x1={-100} x2={2020} y1={FLOOR} y2={FLOOR} stroke={color.ink} strokeWidth={5} />
            <Spotlight x={spotX} floor={FLOOR} tint={color.butter} />
            <g filter={BOIL} transform={`translate(925 ${FLOOR}) scale(1 ${podium}) translate(-925 ${-FLOOR})`}>
              <Podium />
            </g>
            <g filter={BOIL}>
              <Cable f={f} />
            </g>
            <g filter={BOIL}>
              <Laptop {...laptop} />
            </g>
            <g filter={BOIL}>
              <UsbMic {...mic} />
            </g>
            <g filter={BOIL}>
              <AirPods {...pods} />
            </g>
            <g filter={BOIL}>
              <RainCloud x={PODS.x + 6 * Math.sin(f * 0.1)} y={PODS.y - PODS_HEAD_TOP - 110} scale={rain} f={f} />
            </g>
            {asleep &&
              [0, 1, 2].map((i) => {
                const phase = ((f - UNPLUG - 14 + i * 16) % 48) / 48;
                return (
                  <text
                    key={i}
                    x={MIC.x + 70 + phase * 60}
                    y={mic.y - MIC_HEAD_TOP * MIC.scale - phase * 120}
                    fontFamily={heading}
                    fontWeight={800}
                    fontSize={34 + phase * 30}
                    fill={color.ink}
                    opacity={lerp(phase, [0, 0.2, 0.8, 1], [0, 1, 1, 0])}
                  >
                    z
                  </text>
                );
              })}
            <g filter={BOIL}>
              <Guard {...guard} />
            </g>
            <g filter={BOIL}>
              <VoiceBlob x={blob.x} y={blob.y} rotate={blob.rotate} muffle={lerp(f, [TOSS.to - 4, TOSS.to + 6], [1, 0])} phase={f * 0.25} look={[0, -0.2]} />
            </g>
            <g filter={BOIL}>
              <Burst x={150} y={520} scale={tweet} rotate={-8} text="TWEET!" radius={100} />
              <Burst x={740} y={700} scale={popBurst} rotate={10} text="POP!" radius={85} fill={color.coral} />
              <Burst x={740} y={700} scale={clickBurst} rotate={-6} text="CLICK" radius={85} fill={color.green} />
            </g>
          </g>
        </svg>
      </AbsoluteFill>
      <Captions list={captions} />
    </Paper>
  );
};
