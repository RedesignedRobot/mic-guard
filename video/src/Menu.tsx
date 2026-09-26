import {AbsoluteFill, Easing, useCurrentFrame, useVideoConfig} from 'remotion';
import {AirPods, Guard} from './cast';
import {BoilDefs, Captions, lerp, Paper, pop, type Caption} from './fx';
import {body, color} from './theme';

// The real menu from Sources/MicGuardApp.swift, as it looks right after the steal was undone.

type Row = {kind: 'status' | 'divider' | 'header' | 'item'; text?: string; check?: boolean; shortcut?: string; muted?: boolean};

const ROWS: Row[] = [
  {kind: 'status', text: 'Guarding · DJI Wireless Mic Rx'},
  {kind: 'divider'},
  {kind: 'header', text: 'Wired'},
  {kind: 'item', text: 'DJI Wireless Mic Rx', check: true},
  {kind: 'divider'},
  {kind: 'header', text: 'Built-in'},
  {kind: 'item', text: 'MacBook Pro Microphone'},
  {kind: 'divider'},
  {kind: 'header', text: 'Bluetooth'},
  {kind: 'item', text: 'AirPods Pro'},
  {kind: 'divider'},
  {kind: 'header', text: 'Recent switches'},
  {kind: 'item', text: '10:46 PM   AirPods Pro → DJI Wireless Mic Rx', muted: true},
  {kind: 'divider'},
  {kind: 'item', text: 'Pause Guarding', shortcut: '›'},
  {kind: 'item', text: 'Open Sound Settings…'},
  {kind: 'divider'},
  {kind: 'item', text: 'Settings…', shortcut: '⌘,'},
  {kind: 'item', text: 'About Mic Guard'},
  {kind: 'item', text: 'Quit Mic Guard', shortcut: '⌘Q'},
];

const ROW_HEIGHT: Record<Row['kind'], number> = {status: 50, divider: 18, header: 38, item: 46};
const BAR_HEIGHT = 62;
const PANEL = {left: 1150, top: 72, width: 730, padding: 12};
const GLYPH = {x: 1545, y: 31};
const RECEIPT_ROW = ROWS.findIndex((row) => row.text === 'Recent switches');
const receiptTop = PANEL.top + PANEL.padding + ROWS.slice(0, RECEIPT_ROW).reduce((sum, row) => sum + ROW_HEIGHT[row.kind], 0);
const RECEIPT = {x: PANEL.left + PANEL.width / 2, y: receiptTop + (ROW_HEIGHT.header + ROW_HEIGHT.item) / 2 + 4};

export const MENU_DURATION = 120;
const OPEN_AT = 18;
const POINT_AT = 48;

const captions: Caption[] = [
  {from: 0, text: 'Mic Guard lives in the menu bar.'},
  {from: POINT_AT, text: 'It keeps receipts.'},
];

// A loose hand-drawn loop that overshoots its start, like a marker circle. It is a squarish
// superellipse so its ends stay clear of the text in a row this wide.
const squarish = (value: number) => Math.sign(value) * Math.abs(value) ** 0.4;
const MARKER_PATH = Array.from({length: 81}, (_, i) => {
  const angle = -0.5 + (i / 80) * (Math.PI * 2 + 0.7);
  const rx = 360 + 8 * Math.sin(angle * 2);
  const ry = 52 + 5 * Math.cos(angle * 3);
  return `${i === 0 ? 'M' : 'L'} ${RECEIPT.x + squarish(Math.cos(angle)) * rx} ${RECEIPT.y + squarish(Math.sin(angle)) * ry - i * 0.15}`;
}).join(' ');

const MenuBar: React.FC<{open: boolean}> = ({open}) => (
  <g>
    <rect x={0} y={0} width={1920} height={BAR_HEIGHT} fill={color.card} />
    <line x1={0} x2={1920} y1={BAR_HEIGHT} y2={BAR_HEIGHT} stroke={color.ink} strokeWidth={5} />
    {open && <rect x={GLYPH.x - 32} y={8} width={64} height={46} rx={12} fill={color.silver} />}
    <g transform={`translate(${GLYPH.x} ${GLYPH.y})`} fill="none" stroke={color.ink} strokeWidth={3.5} strokeLinecap="round">
      <rect x={-7} y={-17} width={14} height={22} rx={7} fill={color.ink} />
      <path d="M -12 -2 Q -12 11 0 11 Q 12 11 12 -2" />
      <line x1={0} y1={11} x2={0} y2={17} />
      <line x1={-7} y1={17} x2={7} y2={17} />
    </g>
    <g transform="translate(1640 31)">
      <rect x={-26} y={-12} width={48} height={24} rx={6} fill="none" stroke={color.ink} strokeWidth={3} />
      <rect x={-22} y={-8} width={32} height={16} rx={3} fill={color.ink} />
      <rect x={24} y={-5} width={4} height={10} rx={2} fill={color.ink} />
    </g>
    <text x={1880} y={32} textAnchor="end" dominantBaseline="central" fontFamily={body} fontWeight={600} fontSize={26} fill={color.ink}>
      Sat 10:47 PM
    </text>
  </g>
);

const Panel: React.FC<{open: number}> = ({open}) => (
  <div
    style={{
      position: 'absolute',
      left: PANEL.left,
      top: PANEL.top,
      width: PANEL.width,
      padding: `${PANEL.padding}px 0`,
      boxSizing: 'border-box',
      background: color.card,
      border: `5px solid ${color.ink}`,
      borderRadius: 22,
      boxShadow: `10px 10px 0 ${color.ink}`,
      fontFamily: body,
      color: color.ink,
      transform: `scale(${0.92 + 0.08 * open}, ${open})`,
      transformOrigin: '70% 0',
      opacity: Math.min(1, open * 3),
    }}
  >
    {ROWS.map((row, i) => {
      const height = ROW_HEIGHT[row.kind];
      if (row.kind === 'divider') {
        return <div key={i} style={{height, display: 'flex', alignItems: 'center', padding: '0 20px'}}><div style={{flex: 1, height: 3, background: color.silver}} /></div>;
      }
      const isHeader = row.kind === 'header';
      const isStatus = row.kind === 'status';
      return (
        <div
          key={i}
          style={{
            height,
            display: 'flex',
            alignItems: 'center',
            padding: '0 26px 0 18px',
            fontSize: isHeader ? 22 : isStatus ? 26 : 28,
            fontWeight: isHeader ? 700 : 500,
            color: isHeader || isStatus || row.muted ? color.muted : color.ink,
            whiteSpace: 'pre',
          }}
        >
          <span style={{width: 40, flexShrink: 0, textAlign: 'center', fontWeight: 700}}>{row.check ? '✓' : ''}</span>
          <span style={{flex: 1}}>{row.text}</span>
          {row.shortcut && <span style={{color: color.muted}}>{row.shortcut}</span>}
        </div>
      );
    })}
  </div>
);

const Cursor: React.FC<{x: number; y: number; scale: number}> = ({x, y, scale}) => (
  <path
    transform={`translate(${x} ${y}) scale(${scale})`}
    d="M 0 0 L 0 44 L 12 33 L 21 52 L 29 48 L 20 30 L 36 30 Z"
    fill={color.card}
    stroke={color.ink}
    strokeWidth={3.5}
    strokeLinejoin="round"
  />
);

const BOIL = 'url(#boil-menu)';

export const Menu: React.FC = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const open = pop(f, fps, OPEN_AT);
  const travel = lerp(f, [2, 16], [0, 1], Easing.inOut(Easing.cubic));
  const click = lerp(f, [15, 18, 22], [1, 0.8, 1]);
  const guardRise = pop(f, fps, 24);
  const podsRise = pop(f, fps, 70);
  const pointing = lerp(f, [POINT_AT - 4, POINT_AT + 4], [0, 1]);
  const marker = lerp(f, [POINT_AT + 4, POINT_AT + 24], [0, 1], Easing.out(Easing.quad));

  return (
    <Paper>
      <AbsoluteFill>
        <svg width={1920} height={1080}>
          <BoilDefs id="boil-menu" />
          <MenuBar open={f >= OPEN_AT} />
          <g filter={BOIL}>
            <Guard
              x={430}
              y={1640 - 555 * guardRise}
              scale={1.3}
              look={[1, -1]}
              brow={3}
              arms={[30, 30 + 115 * pointing]}
              squash={1 + 0.06 * pointing * Math.sin((f - POINT_AT) * 0.6) * Math.exp(-(f - POINT_AT) * 0.08)}
            />
          </g>
          <g filter={BOIL}>
            <AirPods x={1640} y={1300 - 185 * podsRise} scale={1.1} look={[-0.3, -1]} brow={-6} lid={0.3} mouth="frown" />
          </g>
        </svg>
      </AbsoluteFill>
      <Panel open={f < OPEN_AT ? 0 : open} />
      <AbsoluteFill>
        <svg width={1920} height={1080}>
          <path d={MARKER_PATH} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - marker} fill="none" stroke={color.green} strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" opacity={marker > 0 ? 1 : 0} />
          <Cursor x={lerp(travel, [0, 1], [1000, GLYPH.x - 6])} y={lerp(travel, [0, 1], [560, GLYPH.y - 4])} scale={click} />
        </svg>
      </AbsoluteFill>
      <Captions list={captions} top={110} />
    </Paper>
  );
};
