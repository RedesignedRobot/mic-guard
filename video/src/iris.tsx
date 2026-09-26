import type {TransitionPresentation, TransitionPresentationComponentProps} from '@remotion/transitions';
import {AbsoluteFill} from 'remotion';
import {color} from './theme';

// Past the frame corners (hypot(960, 540) is about 1101) so the ring leaves the screen at the end.
const FULL_RADIUS = 1160;

type IrisProps = Record<string, never>;

// A cartoon iris: the next scene opens as a growing circle with a thick ink rim.
const Iris: React.FC<TransitionPresentationComponentProps<IrisProps>> = ({children, presentationDirection, presentationProgress}) => {
  if (presentationDirection === 'exiting') return <AbsoluteFill>{children}</AbsoluteFill>;
  const radius = presentationProgress * FULL_RADIUS;
  return (
    <>
      <AbsoluteFill style={{clipPath: `circle(${radius}px at 50% 50%)`}}>{children}</AbsoluteFill>
      <AbsoluteFill>
        <svg width={1920} height={1080}>
          <circle cx={960} cy={540} r={radius} fill="none" stroke={color.ink} strokeWidth={16} />
        </svg>
      </AbsoluteFill>
    </>
  );
};

export const iris = (): TransitionPresentation<IrisProps> => ({component: Iris, props: {}});
