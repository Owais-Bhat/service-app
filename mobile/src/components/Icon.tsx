import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { ICONS, IconName } from '../theme/icons';

interface Props {
  name: IconName;
  size?: number;
  color: string;
  filled?: boolean;
}

// Thin wrapper over Ionicons (bundled with Expo, no config plugin needed)
// so every call site across the app keeps using our own semantic names —
// swapping the icon set only ever means editing theme/icons.ts.
export default function Icon({ name, size = 20, color, filled = false }: Props) {
  const glyph = ICONS[name][filled ? 'filled' : 'outline'];
  return <Ionicons name={glyph as any} size={size} color={color} />;
}
