import {Config} from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
// Default JPEG quality smears the paper grain and the thin ink lines before x264 even sees them.
Config.setJpegQuality(95);
Config.setOverwriteOutput(true);
