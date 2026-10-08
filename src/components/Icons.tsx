/**
 * Icons.tsx ― 線画（ストローク）のシンプルなアイコン
 *
 * デザインガイド：線画のアウトラインアイコン、線は太め（1.8〜2.4px）。
 * SVG（線で描く画像）で描いているので、どんな大きさにしてもきれいに表示されます。
 */
import type { ColorValue } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { colors } from '../theme';

interface IconProps {
  size?: number;
  color?: ColorValue; // タブバーから渡される色の型に合わせる
}

/** すべてのアイコンで共通の線の設定 */
const stroke = (color: ColorValue) => ({
  stroke: color,
  strokeWidth: 2.2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  fill: 'none',
});

export function BoardIcon({ size = 26, color = colors.ink }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M3 11l9-7 9 7" {...stroke(color)} />
      <Path d="M5 10v10h14V10" {...stroke(color)} />
    </Svg>
  );
}

export function GroupIcon({ size = 26, color = colors.ink }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={9} cy={8} r={3.5} {...stroke(color)} />
      <Path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5" {...stroke(color)} />
      <Circle cx={17} cy={9} r={2.5} {...stroke(color)} />
      <Path d="M17 14c2.3 0 4 1.5 4.5 4" {...stroke(color)} />
    </Svg>
  );
}

export function BellIcon({ size = 26, color = colors.ink }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" {...stroke(color)} />
      <Path d="M10 20a2 2 0 0 0 4 0" {...stroke(color)} />
    </Svg>
  );
}

export function PersonIcon({ size = 26, color = colors.ink }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={8} r={4} {...stroke(color)} />
      <Path d="M4 21c1-4 4.2-6 8-6s7 2 8 6" {...stroke(color)} />
    </Svg>
  );
}

export function PlusIcon({ size = 30, color = colors.ink }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 5v14M5 12h14" {...stroke(color)} strokeWidth={2.4} />
    </Svg>
  );
}

export function ContactsIcon({ size = 22, color = colors.ink }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={4} y={3} width={15} height={18} rx={2} {...stroke(color)} />
      <Circle cx={11.5} cy={10} r={2.5} {...stroke(color)} />
      <Path d="M7.5 17c.6-2 2.1-3 4-3s3.4 1 4 3" {...stroke(color)} />
    </Svg>
  );
}
