import {Composition} from 'remotion';
import {Demo, DEMO_DURATION} from './Demo';
import {Promo, PROMO_DURATION} from './Promo';

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="Promo" component={Promo} durationInFrames={PROMO_DURATION} fps={30} width={1920} height={1080} />
    <Composition id="Demo" component={Demo} durationInFrames={DEMO_DURATION} fps={30} width={1920} height={1080} />
  </>
);
