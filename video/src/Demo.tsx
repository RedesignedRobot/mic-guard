import {loopTimeline, Stage} from './Stage';

// The README GIF: the steal and the whistle. The last frame matches the first.
export const DEMO_DURATION = loopTimeline.length;

export const Demo: React.FC = () => <Stage timeline={loopTimeline} />;
