import {AbsoluteFill, Easing, interpolateColors, random, useCurrentFrame, useVideoConfig} from 'remotion';
import {AirPods, FightCloud, Guard, Laptop, Spotlight, UsbMic, VoiceBlob, type Pose} from './cast';
import {arc, BoilDefs, Burst, cameraTransform, Captions, glide, lerp, Paper, pop, SpeedLines, Star, wobble, type Caption, type Punch} from './fx';
import {color, heading} from './theme';

// Act 1: the AirPods grab your voice, everyone fights over it, Mic Guard blows the whistle.
// The same scene runs on two timelines: the story cut, which hands over to the lineup while the
// guard still holds the voice, and a short seamless loop for the GIF that returns it on stage.

export type Timeline = {
  airpodsIn: number;
  steal: number;
  tug: number;
  chaos: number;
  whistle: number;
  /** The guard tosses the voice back to the USB mic on stage. */
  rescue: boolean;
  /** Loop only: everyone leaves or goes home so the last frame matches the first. */
  airpodsOut?: number;
  guardOut?: number;
  length: number;
  captions: Caption[];
};

const LOOP = 225;

export const fullTimeline: Timeline = {
  airpodsIn: 60,
  steal: 125,
  tug: 215,
  chaos: 275,
  whistle: 365,
  rescue: false,
  length: 400,
  captions: [
    {from: 0, text: "You're on a call.\nYour USB mic has your voice."},
    {from: 60, text: 'Then your AirPods connect.'},
    {from: 125, text: 'They grab your voice. macOS lets them.'},
    {from: 165, text: 'Now you sound like a phone call\nfrom inside a tunnel.'},
    {from: 215, text: 'Your USB mic wants it back.'},
    {from: 275, text: 'Then the MacBook mic joins in.'},
    {from: 318, text: 'Nobody can hear you.'},
    {from: 365, text: 'Mic Guard blows the whistle.'},
  ],
};

export const loopTimeline: Timeline = {
  airpodsIn: 0,
  steal: 64,
  tug: 92,
  chaos: 118,
  whistle: 150,
  rescue: true,
  airpodsOut: 194,
  guardOut: 200,
  length: LOOP,
  captions: [
    {from: 64, text: 'Your AirPods grab your voice.'},
    {from: 150, text: 'Mic Guard gives it back.'},
    {from: 214, text: ''},
  ],
};

// Periodic motion completes whole cycles within the GIF loop so the wrap has no jump.
const cycle = (f: number, turns: number) => (f / LOOP) * turns * 2 * Math.PI;

const FLOOR = 880;
const MIC_X = 860;
const MIC_SCALE = 1.15;
const LAPTOP_X = 330;
const AIRPODS_X = 1500;
const AIRPODS_FLUNG_X = 1570;
const OFFSTAGE_X = 2150;
const GRAB_X = 1010;
const TUG = {mic: 1090, pods: 1400, y: FLOOR - 175};
const GUARD_X = 1180;
const CLOUD = {x: 1180, y: 620};

// Measured from the drawings in cast.tsx, in local units.
const MIC_HEAD_TOP = 304;
const PODS_HEAD_TOP = 188;
const GUARD_SHOULDER = {x: -132, y: -250, arm: 70};
// The voice blob's center sits this far above whoever holds it.
const BLOB_ABOVE_MIC = 72;
const BLOB_ABOVE_PODS = 45;
const BLOB_ABOVE_HAND = 58;

type PodsPose = React.ComponentProps<typeof AirPods>;
type GuardPose = React.ComponentProps<typeof Guard>;
type LaptopPose = React.ComponentProps<typeof Laptop>;
type Point = {x: number; y: number};

const beats = (t: Timeline) => {
  const tossAt = t.whistle + 16;
  return {
    leap: t.steal - 12,
    back: t.steal + 2,
    landed: t.steal + 16,
    lunge: t.tug - 12,
    run: t.chaos - 18,
    guardDrop: t.whistle - 22,
    guardLand: t.whistle - 10,
    catchAt: t.whistle + 8,
    tossAt,
    // Past the end of the story cut, where the lineup scene does the handing back.
    homeAt: t.rescue ? tossAt + 22 : t.length + 60,
  };
};
type Beats = ReturnType<typeof beats>;

const sway = (f: number, t: Timeline) => 34 * Math.sin((f - t.tug) * 0.32);

const micSeat = (mic: Pose) => FLOOR - MIC_HEAD_TOP * MIC_SCALE * (mic.squash ?? 1);

const podsSeat = (pods: PodsPose) => {
  const {hop = 0, hopHeight = 0, squash = 1} = pods;
  const lift = ((Math.abs(Math.sin(hop)) + Math.abs(Math.sin(hop + Math.PI / 2))) / 2) * hopHeight;
  return pods.y - (PODS_HEAD_TOP + lift) * squash;
};

const guardHand = (guard: GuardPose): Point => {
  const squash = guard.squash ?? 1;
  const angle = ((guard.arms?.[0] ?? 0) * Math.PI) / 180;
  return {
    x: guard.x + (GUARD_SHOULDER.x - Math.sin(angle) * GUARD_SHOULDER.arm) / Math.sqrt(squash),
    y: guard.y + (GUARD_SHOULDER.y + Math.cos(angle) * GUARD_SHOULDER.arm) * squash,
  };
};
// Where the raised left hand is when the guard throws.
const THROW_FROM: Point = {x: GUARD_X + GUARD_SHOULDER.x - 12, y: FLOOR + GUARD_SHOULDER.y - GUARD_SHOULDER.arm};

const micPose = (f: number, fps: number, t: Timeline, b: Beats): Pose => {
  const singing: Pose = {
    x: MIC_X,
    y: FLOOR,
    scale: MIC_SCALE,
    squash: 1 + 0.035 * Math.sin(cycle(f, 10)),
    lid: 1,
    mouth: 'grin',
    open: 0.4 + 0.5 * Math.abs(Math.sin(cycle(f, 10))),
    arms: [125 + 20 * Math.sin(cycle(f, 5)), 125 - 20 * Math.sin(cycle(f, 5))],
  };
  if (f < b.leap) return singing;
  if (f < b.landed) {
    return {...singing, squash: wobble(f - t.steal + 4, -0.25), lid: 0, look: [1, -0.6], mouth: 'o', open: 1, brow: -6, arms: [150, 150]};
  }
  if (f < b.lunge) {
    const rage = lerp(f, [b.landed, b.lunge], [0, 7]);
    return {
      x: MIC_X + (random(`fume-${Math.floor(f / 2)}`) - 0.5) * 2 * rage,
      y: FLOOR,
      scale: MIC_SCALE,
      look: [1, -0.2],
      brow: 9,
      mouth: 'frown',
      arms: [35, 35],
    };
  }
  if (f < t.tug) {
    return {
      x: lerp(f, [b.lunge, b.lunge + 4, t.tug], [MIC_X, MIC_X - 30, TUG.mic]),
      y: FLOOR,
      scale: MIC_SCALE,
      squash: lerp(f, [b.lunge, b.lunge + 4, t.tug], [1, 0.82, 1.1]),
      lean: lerp(f, [b.lunge, b.lunge + 4, t.tug], [0, -10, 12]),
      look: [1, -0.3],
      brow: 10,
      mouth: 'grin',
      open: 1,
      arms: [60, 100],
    };
  }
  if (f < t.chaos) {
    return {x: TUG.mic + sway(f, t), y: FLOOR, scale: MIC_SCALE, lean: -9, look: [1, -0.4], brow: 10, mouth: 'grin', open: 1, arms: [40, 105]};
  }
  if (f < t.chaos + 5) {
    return {x: lerp(f, [t.chaos, t.chaos + 5], [TUG.mic, CLOUD.x]), y: FLOOR, scale: MIC_SCALE, squash: 1.2, lean: 14, brow: 10, mouth: 'grin', arms: [100, 100]};
  }
  if (f < t.whistle + 2) return {x: CLOUD.x, y: FLOOR, opacity: 0};
  if (f < b.homeAt) {
    return {
      x: 900 + (MIC_X - 900) * glide(f, fps, t.whistle + 2),
      y: FLOOR,
      scale: MIC_SCALE,
      squash: wobble(f - t.whistle - 2, 0.3),
      look: [0.8, -0.8],
      brow: -4,
      mouth: 'flat',
      arms: [20, 20],
    };
  }
  return {...singing, squash: (singing.squash ?? 1) * wobble(f - b.homeAt, -0.2)};
};

const podsPose = (f: number, fps: number, t: Timeline, b: Beats): PodsPose => {
  if (t.airpodsOut !== undefined && f >= t.airpodsOut) {
    return {
      x: lerp(f, [t.airpodsOut, t.airpodsOut + 24], [AIRPODS_FLUNG_X, OFFSTAGE_X], Easing.in(Easing.quad)),
      y: FLOOR,
      lean: 5,
      hop: f * 0.4,
      hopHeight: 12,
      look: [1, 0.5],
      lid: 0.4,
      brow: -6,
      mouth: 'frown',
    };
  }
  const sneaky = {look: [-1, -0.4] as [number, number], brow: 5, mouth: 'smirk' as const};
  if (f < t.airpodsIn + 50) {
    return {
      ...sneaky,
      x: lerp(f, [t.airpodsIn, t.airpodsIn + 50], [OFFSTAGE_X, AIRPODS_X], Easing.out(Easing.quad)),
      y: FLOOR,
      lean: -6,
      hop: f * 0.45,
      hopHeight: lerp(f, [t.airpodsIn + 35, t.airpodsIn + 50], [24, 0]),
      arms: [60, 60],
    };
  }
  if (f < b.leap) return {...sneaky, x: AIRPODS_X, y: FLOOR, squash: lerp(f, [b.leap - 8, b.leap], [1, 0.82]), arms: [40, 40]};
  if (f < t.steal) {
    const progress = lerp(f, [b.leap, t.steal], [0, 1]);
    const [x, y] = arc(progress, [AIRPODS_X, FLOOR], [GRAB_X, FLOOR], 230);
    return {...sneaky, x, y, squash: 1.2, lean: -10, arms: [150, 150], mouth: 'grin'};
  }
  if (f < b.back) return {...sneaky, x: GRAB_X, y: FLOOR, squash: 0.85, arms: [160, 160], mouth: 'grin'};
  if (f < b.landed) {
    const progress = lerp(f, [b.back, b.landed], [0, 1]);
    const [x, y] = arc(progress, [GRAB_X, FLOOR], [AIRPODS_X, FLOOR], 200);
    return {...sneaky, x, y, squash: 1.15, lean: 8, arms: [165, 165], mouth: 'grin'};
  }
  if (f < b.lunge) {
    return {
      x: AIRPODS_X,
      y: FLOOR,
      squash: wobble(f - b.landed, 0.3),
      hop: f * 0.3,
      hopHeight: 8,
      look: [-1, 0],
      brow: 4,
      mouth: 'smirk',
      arms: [165, 165],
    };
  }
  if (f < t.tug) {
    return {x: lerp(f, [b.lunge + 4, t.tug], [AIRPODS_X, TUG.pods]), y: FLOOR, squash: 1.05, look: [-1, -0.3], brow: -4, mouth: 'o', arms: [120, -120]};
  }
  if (f < t.chaos) return {x: TUG.pods + sway(f, t), y: FLOOR, lean: 9, look: [-1, -0.3], brow: 10, mouth: 'grin', arms: [145, -130]};
  if (f < t.chaos + 5) return {x: lerp(f, [t.chaos, t.chaos + 5], [TUG.pods, CLOUD.x]), y: FLOOR, squash: 1.2, lean: -14, brow: 10, mouth: 'grin'};
  if (f < t.whistle + 2) return {x: CLOUD.x, y: FLOOR, opacity: 0};
  if (f < b.homeAt) {
    return {
      x: 1400 + (AIRPODS_FLUNG_X - 1400) * glide(f, fps, t.whistle + 2),
      y: FLOOR,
      squash: wobble(f - t.whistle - 2, 0.3),
      look: [-1, -0.3],
      brow: -6,
      mouth: 'o',
    };
  }
  return {x: AIRPODS_FLUNG_X, y: FLOOR, look: [0, 0.8], lid: 0.45, brow: -6, mouth: 'frown'};
};

const laptopPose = (f: number, fps: number, t: Timeline, b: Beats): LaptopPose => {
  const calm: LaptopPose = {x: LAPTOP_X, y: FLOOR, lid: 0.35, look: [1, -0.3], mouth: 'smile', steam: cycle(f, 5)};
  if (f < t.steal - 4) return calm;
  if (f < t.steal + 26) return {...calm, squash: wobble(f - t.steal + 4, -0.12), lid: 0, look: [1, -0.6], mouth: 'o', brow: -5};
  if (f < b.run) return {...calm, lid: 0, look: [1, -0.1], mouth: 'wavy', brow: -7, sweat: lerp(f, [t.tug, t.tug + 6], [0, 1])};
  if (f < t.chaos + 3) {
    return {
      ...calm,
      x: lerp(f, [b.run, b.run + 4, t.chaos + 3], [LAPTOP_X, LAPTOP_X - 30, CLOUD.x - 60], Easing.in(Easing.quad)),
      squash: lerp(f, [b.run, b.run + 4, b.run + 8], [1, 0.85, 1.1]),
      lean: lerp(f, [b.run, b.run + 4, b.run + 10], [0, -8, 14]),
      lid: 0,
      look: [1, 0],
      mouth: 'o',
      brow: 8,
      arms: [150, 150],
    };
  }
  if (f < t.whistle + 2) return {...calm, opacity: 0};
  if (f < b.homeAt) {
    return {
      ...calm,
      x: 720 + (LAPTOP_X - 720) * glide(f, fps, t.whistle + 2),
      squash: wobble(f - t.whistle - 2, 0.25),
      lid: 0,
      look: [1, -0.6],
      mouth: 'flat',
      brow: -4,
    };
  }
  return calm;
};

const guardPose = (f: number, t: Timeline, b: Beats): GuardPose | null => {
  if (f < b.guardDrop) return null;
  if (f < b.guardLand) {
    return {
      x: GUARD_X,
      y: lerp(f, [b.guardDrop, b.guardLand], [-60, FLOOR], Easing.in(Easing.quad)),
      squash: 1.3,
      arms: [165, 165],
      look: [0, 1],
      brow: -4,
    };
  }
  if (t.guardOut !== undefined && f >= t.guardOut) {
    return {
      x: GUARD_X,
      y: lerp(f, [t.guardOut, t.guardOut + 14], [FLOOR, -120], Easing.in(Easing.quad)),
      squash: 1.3,
      arms: [150, 150],
      look: [0, -1],
    };
  }
  const landing = wobble(f - b.guardLand, 0.35);
  const inhale = lerp(f, [t.whistle - 7, t.whistle - 1, t.whistle + 1, t.whistle + 8], [1, 1.12, 0.9, 1]);
  const crouch = t.guardOut === undefined ? 1 : lerp(f, [t.guardOut - 7, t.guardOut], [1, 0.72]);
  const leftArm =
    f < b.tossAt || !t.rescue
      ? lerp(f, [b.guardLand, t.whistle, b.catchAt - 2], [55, 100, 170])
      : lerp(f, [b.tossAt, b.tossAt + 5, b.tossAt + 18], [170, 60, 30]);
  const rightArm = lerp(f, [b.guardLand, t.whistle, t.whistle + 20, t.whistle + 30], [55, 100, 100, 30]);
  const look: [number, number] = f < b.catchAt ? [0, 0.2] : f < b.homeAt ? [-1, -0.5] : [0, 0];
  return {
    x: GUARD_X,
    y: FLOOR,
    squash: landing * inhale * crouch,
    arms: [leftArm, rightArm],
    blow: lerp(f, [t.whistle - 6, t.whistle, t.whistle + 16, t.whistle + 20], [0, 1, 1, 0]),
    look,
    lid: f >= b.homeAt ? 0.4 : 0,
    brow: f >= b.homeAt ? 2 : 6,
  };
};

// Where the voice is, and how stretched: it rides on whoever has the input.
const blobAt = (f: number, t: Timeline, b: Beats, mic: Pose, pods: PodsPose, guard: GuardPose | null) => {
  const onMic = {x: mic.x, y: micSeat(mic) - BLOB_ABOVE_MIC + 6 * Math.sin(cycle(f, 5)), rotate: 0, stretch: 1};
  const onPods = {x: pods.x, y: podsSeat(pods) - BLOB_ABOVE_PODS, rotate: 0, stretch: 1};
  if (f < t.steal - 2) return onMic;
  if (f < b.back) {
    const progress = lerp(f, [t.steal - 2, b.back], [0, 1]);
    return {x: lerp(progress, [0, 1], [onMic.x, onPods.x]), y: lerp(progress, [0, 1], [onMic.y, onPods.y]), rotate: -20 * progress, stretch: 1.25};
  }
  if (f < b.lunge + 4) return {...onPods, rotate: 6 * Math.sin(f * 0.3)};
  const between = {x: (mic.x + pods.x) / 2, y: TUG.y, rotate: 8 + 4 * Math.sin((f - t.tug) * 0.64), stretch: 1.4 + 0.12 * Math.sin((f - t.tug) * 0.64)};
  if (f < t.tug) {
    const progress = lerp(f, [b.lunge + 4, t.tug], [0, 1]);
    return {x: lerp(progress, [0, 1], [onPods.x, between.x]), y: lerp(progress, [0, 1], [onPods.y, between.y]), rotate: 0, stretch: 1 + 0.4 * progress};
  }
  const orbit = (frame: number) => {
    const angle = (frame - t.chaos) * 0.14 - Math.PI / 2;
    return {x: CLOUD.x + Math.cos(angle) * 470, y: CLOUD.y - 40 + Math.sin(angle) * 300, rotate: (frame - t.chaos) * 14, stretch: 1};
  };
  if (f < t.chaos) return between;
  if (f < t.chaos + 8) {
    const progress = lerp(f, [t.chaos, t.chaos + 8], [0, 1]);
    const target = orbit(f);
    return {x: lerp(progress, [0, 1], [between.x, target.x]), y: lerp(progress, [0, 1], [between.y, target.y]), rotate: target.rotate, stretch: 1.4 - 0.4 * progress};
  }
  if (f < t.whistle || !guard) return orbit(f);
  const hand = guardHand(guard);
  const inHand = {x: hand.x, y: hand.y - BLOB_ABOVE_HAND, rotate: 0, stretch: 1};
  if (f < b.catchAt) {
    const start = orbit(t.whistle);
    const progress = lerp(f, [t.whistle, b.catchAt], [0, 1], Easing.in(Easing.quad));
    const [x, y] = arc(progress, [start.x, start.y], [inHand.x, inHand.y], 60);
    return {x, y, rotate: start.rotate * (1 - progress), stretch: 1};
  }
  if (f < b.tossAt || !t.rescue) return inHand;
  if (f < b.homeAt) {
    const progress = lerp(f, [b.tossAt, b.homeAt], [0, 1], Easing.inOut(Easing.quad));
    const [x, y] = arc(progress, [THROW_FROM.x, THROW_FROM.y - BLOB_ABOVE_HAND], [onMic.x, onMic.y], 200);
    return {x, y, rotate: -360 * progress, stretch: 1};
  }
  return onMic;
};

const Floor: React.FC = () => (
  <g>
    <rect x={-100} y={FLOOR} width={2120} height={300} fill={color.floor} />
    <line x1={-100} x2={2020} y1={FLOOR} y2={FLOOR} stroke={color.ink} strokeWidth={5} />
  </g>
);

const OnAir: React.FC<{lit: number}> = ({lit}) => (
  <g transform="translate(1660 150)">
    <line x1={-90} y1={-150} x2={-90} y2={-54} stroke={color.ink} strokeWidth={4} />
    <line x1={90} y1={-150} x2={90} y2={-54} stroke={color.ink} strokeWidth={4} />
    <rect x={-150} y={-54} width={300} height={108} rx={20} fill={interpolateColors(lit, [0, 1], [color.grey, color.green])} stroke={color.ink} strokeWidth={5} />
    <text x={0} y={2} textAnchor="middle" dominantBaseline="central" fontFamily={heading} fontWeight={800} fontSize={56} letterSpacing={4} fill={color.ink} opacity={0.35 + 0.65 * lit}>
      ON AIR
    </text>
  </g>
);

const BOIL = 'url(#boil-act1)';

export const Stage: React.FC<{timeline: Timeline}> = ({timeline: t}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const b = beats(t);

  const mic = micPose(f, fps, t, b);
  const pods = podsPose(f, fps, t, b);
  const laptop = laptopPose(f, fps, t, b);
  const guard = guardPose(f, t, b);
  const blob = blobAt(f, t, b, mic, pods, guard);
  const muffle = lerp(f, [t.steal + 4, t.steal + 16, b.homeAt - 6, b.homeAt + 6], [0, 1, 1, 0]);

  const spotKeys = [t.steal - 2, b.landed, t.chaos, t.chaos + 10, b.homeAt - 22, b.homeAt];
  const spotX = lerp(f, spotKeys, [MIC_X, AIRPODS_X, AIRPODS_X, CLOUD.x, CLOUD.x, MIC_X]);
  const spotTint = interpolateColors(f, spotKeys, [color.butter, color.amber, color.amber, color.coral, color.coral, color.butter]);

  const cloudScale = 1.2 * pop(f, fps, t.chaos) * lerp(f, [t.whistle, t.whistle + 5], [1, 0]);
  const tweet = pop(f, fps, t.whistle) * lerp(f, [t.whistle + 18, t.whistle + 24], [1, 0]);
  const punches: Punch[] = [
    {at: t.steal, x: 1180, y: 600, zoom: 1.2, hold: 36},
    {at: t.whistle, x: 1180, y: 560, zoom: 1.3, hold: 24},
  ];

  return (
    <Paper>
      <AbsoluteFill>
        <svg width={1920} height={1080} viewBox="0 0 1920 1080">
          <BoilDefs id="boil-act1" />
          <g transform={cameraTransform(f, fps, punches)}>
            <Floor />
            <g filter={BOIL}>
              <OnAir lit={1 - muffle} />
            </g>
            <Spotlight x={spotX} floor={FLOOR} tint={spotTint} />
            <g filter={BOIL}>
              <Laptop {...laptop} />
            </g>
            <g filter={BOIL}>
              <UsbMic {...mic} />
            </g>
            <g filter={BOIL}>
              <AirPods {...pods} />
            </g>
            <SpeedLines x={pods.x + 60} y={pods.y - 110} angle={180 + 20} strength={lerp(f, [b.leap, b.leap + 3, t.steal - 2, t.steal], [0, 1, 1, 0])} seed="leap" />
            <SpeedLines x={pods.x - 60} y={pods.y - 110} angle={-20} strength={lerp(f, [b.back, b.back + 3, b.landed - 3, b.landed], [0, 1, 1, 0])} seed="leap-back" />
            <SpeedLines x={mic.x - 70} y={FLOOR - 200} angle={0} strength={lerp(f, [b.lunge + 4, b.lunge + 6, t.tug], [0, 1, 0])} seed="lunge" />
            <SpeedLines x={laptop.x - 180} y={FLOOR - 120} angle={0} strength={lerp(f, [b.run + 4, b.run + 7, t.chaos + 3], [0, 1, 0])} seed="run" />
            {f >= t.chaos && f < t.whistle + 5 && (
              <g filter={BOIL}>
                <FightCloud x={CLOUD.x} y={CLOUD.y} scale={cloudScale} t={f - t.chaos} />
              </g>
            )}
            {f >= t.whistle && f < t.whistle + 18 &&
              Array.from({length: 7}, (_, i) => {
                const angle = (i / 7) * Math.PI * 2 + 0.3;
                const distance = lerp(f, [t.whistle, t.whistle + 16], [120, 380], Easing.out(Easing.cubic));
                return (
                  <Star
                    key={i}
                    x={CLOUD.x + Math.cos(angle) * distance * 1.3}
                    y={CLOUD.y + Math.sin(angle) * distance}
                    r={lerp(f, [t.whistle + 8, t.whistle + 18], [34, 0])}
                    rotate={f * 12 + i * 40}
                    fill={i % 2 ? color.butter : color.sky}
                  />
                );
              })}
            {guard && (
              <>
                <SpeedLines x={GUARD_X} y={guard.y - 440} angle={90} strength={lerp(f, [b.guardDrop, b.guardDrop + 4, b.guardLand - 2, b.guardLand], [0, 1, 1, 0])} seed="drop" spread={200} />
                {t.guardOut !== undefined && (
                  <SpeedLines x={GUARD_X} y={guard.y + 10} angle={-90} strength={lerp(f, [t.guardOut, t.guardOut + 3, t.guardOut + 10, t.guardOut + 14], [0, 1, 1, 0])} seed="exit" spread={200} />
                )}
                <g filter={BOIL}>
                  <Guard {...guard} />
                </g>
              </>
            )}
            <g filter={BOIL}>
              <VoiceBlob x={blob.x} y={blob.y} rotate={blob.rotate} stretch={blob.stretch} muffle={muffle} phase={cycle(f, 10)} look={[0, -0.2]} />
            </g>
            <g filter={BOIL}>
              <Burst x={1450} y={460} scale={tweet} rotate={-8} text="TWEET!" radius={150} />
            </g>
          </g>
        </svg>
      </AbsoluteFill>
      <Captions list={t.captions} />
    </Paper>
  );
};
