import {loadFont as loadBricolage} from '@remotion/google-fonts/BricolageGrotesque';
import {loadFont as loadInter} from '@remotion/google-fonts/Inter';

export const heading = loadBricolage('normal', {weights: ['700', '800'], subsets: ['latin']}).fontFamily;
export const body = loadInter('normal', {weights: ['400', '500', '600', '700'], subsets: ['latin']}).fontFamily;

// Shared with the site so the video and the page read as one brand.
export const color = {
  paper: '#FBF7F0',
  card: '#FFFDF8',
  ink: '#1D1B22',
  green: '#30D158',
  amber: '#FF9F0A',
  coral: '#FF6B5B',
  sky: '#7CC4FF',
  butter: '#FFD66B',
  // Neutrals for props the palette doesn't cover.
  muted: '#6B6573',
  grey: '#CFC8BD',
  silver: '#E6E0D6',
  screen: '#2A2731',
  floor: '#F2E9DA',
};

export const INK_WIDTH = 4;
