import React from 'react';
import Svg, { Path, Circle, Line, Polyline, Rect } from 'react-native-svg';

interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

const base = (size = 20, color = '#F4F5F7', strokeWidth = 2) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none' as const,
  stroke: color,
  strokeWidth,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

export function HomeIcon({ size, color, strokeWidth }: IconProps) {
  const p = base(size, color, strokeWidth);
  return (
    <Svg {...p}>
      <Path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <Polyline points="9 22 9 12 15 12 15 22" />
    </Svg>
  );
}

export function WrenchIcon({ size, color, strokeWidth }: IconProps) {
  const p = base(size, color, strokeWidth);
  return (
    <Svg {...p}>
      <Path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94z" />
    </Svg>
  );
}

export function WalletIcon({ size, color, strokeWidth }: IconProps) {
  const p = base(size, color, strokeWidth);
  return (
    <Svg {...p}>
      <Path d="M21 7H5a2 2 0 0 1 0-4h14v4z" />
      <Path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
      <Path d="M18 12a2 2 0 0 0 0 4h4v-4z" />
    </Svg>
  );
}

export function UserIcon({ size, color, strokeWidth }: IconProps) {
  const p = base(size, color, strokeWidth);
  return (
    <Svg {...p}>
      <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <Circle cx="12" cy="7" r="4" />
    </Svg>
  );
}

export function CarIcon({ size, color, strokeWidth }: IconProps) {
  const p = base(size, color, strokeWidth);
  return (
    <Svg {...p}>
      <Path d="M3 13l2-6a2 2 0 0 1 2-1h10a2 2 0 0 1 2 1l2 6" />
      <Rect x="1" y="13" width="22" height="7" rx="1.5" />
      <Circle cx="6.5" cy="20" r="1.5" />
      <Circle cx="17.5" cy="20" r="1.5" />
    </Svg>
  );
}

export function DropletIcon({ size, color, strokeWidth }: IconProps) {
  const p = base(size, color, strokeWidth);
  return (
    <Svg {...p}>
      <Path d="M12 2s6 7.5 6 12a6 6 0 0 1-12 0c0-4.5 6-12 6-12z" />
    </Svg>
  );
}

export function ClockIcon({ size, color, strokeWidth }: IconProps) {
  const p = base(size, color, strokeWidth);
  return (
    <Svg {...p}>
      <Circle cx="12" cy="12" r="10" />
      <Polyline points="12 6 12 12 16 14" />
    </Svg>
  );
}

export function AlertCircleIcon({ size, color, strokeWidth }: IconProps) {
  const p = base(size, color, strokeWidth);
  return (
    <Svg {...p}>
      <Circle cx="12" cy="12" r="10" />
      <Line x1="12" y1="8" x2="12" y2="12" />
      <Line x1="12" y1="16" x2="12.01" y2="16" />
    </Svg>
  );
}

export function ChevronRightIcon({ size, color, strokeWidth }: IconProps) {
  const p = base(size, color, strokeWidth);
  return (
    <Svg {...p}>
      <Polyline points="9 18 15 12 9 6" />
    </Svg>
  );
}

export function ChevronDownIcon({ size, color, strokeWidth }: IconProps) {
  const p = base(size, color, strokeWidth);
  return (
    <Svg {...p}>
      <Polyline points="6 9 12 15 18 9" />
    </Svg>
  );
}

export function BluetoothIcon({ size, color, strokeWidth }: IconProps) {
  const p = base(size, color, strokeWidth);
  return (
    <Svg {...p}>
      <Polyline points="6.5 6.5 17.5 17.5 12 23 12 1 17.5 6.5 6.5 17.5" />
    </Svg>
  );
}

export function ShieldIcon({ size, color, strokeWidth }: IconProps) {
  const p = base(size, color, strokeWidth);
  return (
    <Svg {...p}>
      <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </Svg>
  );
}

export function ClipboardCheckIcon({ size, color, strokeWidth }: IconProps) {
  const p = base(size, color, strokeWidth);
  return (
    <Svg {...p}>
      <Rect x="4" y="4" width="16" height="18" rx="2" />
      <Path d="M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1z" />
      <Polyline points="9 13 11 15 15 11" />
    </Svg>
  );
}

export function ShareIcon({ size, color, strokeWidth }: IconProps) {
  const p = base(size, color, strokeWidth);
  return (
    <Svg {...p}>
      <Path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
      <Polyline points="16 6 12 2 8 6" />
      <Line x1="12" y1="2" x2="12" y2="15" />
    </Svg>
  );
}

export function SearchIcon({ size, color, strokeWidth }: IconProps) {
  const p = base(size, color, strokeWidth);
  return (
    <Svg {...p}>
      <Circle cx="11" cy="11" r="7" />
      <Line x1="21" y1="21" x2="16.65" y2="16.65" />
    </Svg>
  );
}

export function XIcon({ size, color, strokeWidth }: IconProps) {
  const p = base(size, color, strokeWidth);
  return (
    <Svg {...p}>
      <Line x1="18" y1="6" x2="6" y2="18" />
      <Line x1="6" y1="6" x2="18" y2="18" />
    </Svg>
  );
}

export function BellIcon({ size, color, strokeWidth }: IconProps) {
  const p = base(size, color, strokeWidth);
  return (
    <Svg {...p}>
      <Path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <Path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </Svg>
  );
}

export function PlusIcon({ size, color, strokeWidth }: IconProps) {
  const p = base(size, color, strokeWidth);
  return (
    <Svg {...p}>
      <Line x1="12" y1="5" x2="12" y2="19" />
      <Line x1="5" y1="12" x2="19" y2="12" />
    </Svg>
  );
}

export function TelegramIcon({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="12" fill="#26A5E4" />
      <Path
        fill="#FFFFFF"
        d="M17.72 7.18 15.6 17.24c-.16.72-.58.9-1.17.56l-3.24-2.39-1.56 1.5c-.17.17-.32.32-.65.32l.23-3.3 6-5.42c.26-.23-.06-.36-.4-.13l-7.42 4.67-3.2-1c-.7-.22-.71-.7.14-1.03l12.5-4.82c.58-.21 1.09.14.9 1z"
      />
    </Svg>
  );
}

export function GoogleIcon({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
      />
      <Path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.85A11 11 0 0 0 12 23z"
      />
      <Path
        fill="#FBBC05"
        d="M5.84 14.09A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.43.34-2.09V7.06H2.18A11 11 0 0 0 1 12c0 1.78.43 3.46 1.18 4.94l3.66-2.85z"
      />
      <Path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1a11 11 0 0 0-9.82 6.06l3.66 2.85c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </Svg>
  );
}
