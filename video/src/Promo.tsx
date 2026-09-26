import {springTiming, TransitionSeries} from '@remotion/transitions';
import {END_DURATION, EndCard} from './EndCard';
import {iris} from './iris';
import {Lineup, LINEUP_DURATION} from './Lineup';
import {Menu, MENU_DURATION} from './Menu';
import {fullTimeline, Stage} from './Stage';

const TRANSITION = 20;

export const PROMO_DURATION = fullTimeline.length + LINEUP_DURATION + MENU_DURATION + END_DURATION - TRANSITION * 3;

const timing = springTiming({config: {damping: 200}, durationInFrames: TRANSITION, durationRestThreshold: 0.001});

export const Promo: React.FC = () => (
  <TransitionSeries>
    <TransitionSeries.Sequence durationInFrames={fullTimeline.length}>
      <Stage timeline={fullTimeline} />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition presentation={iris()} timing={timing} />
    <TransitionSeries.Sequence durationInFrames={LINEUP_DURATION}>
      <Lineup />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition presentation={iris()} timing={timing} />
    <TransitionSeries.Sequence durationInFrames={MENU_DURATION}>
      <Menu />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition presentation={iris()} timing={timing} />
    <TransitionSeries.Sequence durationInFrames={END_DURATION}>
      <EndCard />
    </TransitionSeries.Sequence>
  </TransitionSeries>
);
