import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { ICONS, IconName } from '../theme/icons';

interface Props {
  name: IconName;
  size?: number;
  color: string;
  filled?: boolean;
}

// Outline mode (default): every path drawn as a 2px stroke in `color`, no
// fill — matches every icon in the registry when used plainly.
// Filled mode: path[0] is the icon's solid shape (filled with `color`);
// any further paths are detail lines (e.g. a checkmark) drawn as a white
// stroke on top, since those are the only icons in the registry that pair
// a solid background shape with an inner accent line.
export default function Icon({ name, size = 20, color, filled = false }: Props) {
  const paths = ICONS[name];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {paths.map((d, i) => {
        // WhatsApp is a two-tone brand mark, not a badge+detail icon: the
        // bubble (path 0) fills `color`, and the receiver squiggle (path 1)
        // fills WhatsApp green — a white accent stroke (the generic filled
        // path below) is invisible on a white bubble, so it needs its own case.
        if (filled && name === 'whatsapp') {
          return <Path key={i} d={d} fill={i === 0 ? color : '#25D366'} stroke="none" />;
        }
        if (filled && i === 0) {
          return <Path key={i} d={d} fill={color} stroke="none" />;
        }
        if (filled) {
          return <Path key={i} d={d} fill="none" stroke="#ffffff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />;
        }
        return <Path key={i} d={d} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />;
      })}
    </Svg>
  );
}
