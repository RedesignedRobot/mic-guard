import {AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {AirPods, Guard, Laptop, UsbMic, VoiceBlob} from './cast';
import {BoilDefs, Paper, pop} from './fx';
import {body, color, heading} from './theme';

export const END_DURATION = 120;
const SITE = 'redesignedrobot.github.io/mic-guard';
const BOIL = 'url(#boil-end)';

export const EndCard: React.FC = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const enter = (at: number) => pop(f, fps, at);
  const rise = (at: number) => ({transform: `scale(${enter(at)})`});
  const peek = (at: number, distance: number) => (1 - enter(at)) * distance;
  const micY = 1150 + peek(30, 420);

  return (
    <Paper>
      <AbsoluteFill>
        <svg width={1920} height={1080}>
          <BoilDefs id="boil-end" />
          <g filter={BOIL}>
            <Laptop x={480} y={1110 + peek(36, 360)} scale={0.8} lid={0.35} look={[1, -0.6]} mouth="smile" steam={f * 0.12} />
          </g>
          <g filter={BOIL}>
            <UsbMic x={210} y={micY} scale={0.9} lid={1} mouth="grin" open={0.6} arms={[140, 140]} />
          </g>
          <g filter={BOIL}>
            <VoiceBlob x={210} y={micY - 304 * 0.9 - 60 + 5 * Math.sin(f * 0.25)} scale={0.9} muffle={0} phase={f * 0.25} look={[0.6, -0.3]} />
          </g>
          <g filter={BOIL}>
            <AirPods x={1430} y={1100 + peek(48, 320)} scale={0.8} look={[0, 0.8]} lid={0.45} brow={-6} mouth="frown" />
          </g>
          <g filter={BOIL}>
            <Guard x={1710} y={1130 + peek(42, 460)} scale={0.95} look={[-0.6, -0.4]} lid={0.35} brow={2} arms={[30, 30]} />
          </g>
        </svg>
      </AbsoluteFill>
      <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', flexDirection: 'column', paddingBottom: 150, color: color.ink}}>
        <Img src={staticFile('AppIcon-1024.png')} style={{width: 180, height: 180, filter: `drop-shadow(7px 7px 0 ${color.ink})`, ...rise(0)}} />
        <div style={{marginTop: 34, fontFamily: heading, fontWeight: 800, fontSize: 112, lineHeight: 1.05, letterSpacing: '-0.02em', ...rise(8)}}>
          Mic Guard
        </div>
        <div style={{marginTop: 18, fontFamily: body, fontWeight: 500, fontSize: 40, ...rise(16)}}>Free and open source for macOS 15+</div>
        <div
          style={{
            marginTop: 40,
            padding: '16px 38px 18px',
            borderRadius: 999,
            background: color.butter,
            border: `5px solid ${color.ink}`,
            boxShadow: `8px 8px 0 ${color.ink}`,
            fontFamily: body,
            fontWeight: 700,
            fontSize: 34,
            ...rise(28),
          }}
        >
          {SITE}
        </div>
        <div style={{marginTop: 30, fontFamily: body, fontWeight: 500, fontSize: 30, color: color.muted, ...rise(32)}}>Built by Amir Ayub</div>
      </AbsoluteFill>
    </Paper>
  );
};
