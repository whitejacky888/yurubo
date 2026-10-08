/**
 * CorkBackground.tsx ― コルクボードのような、点々模様の背景
 *
 * react-native-svg の「Pattern（模様）」を使って、小さな点を敷き詰めています。
 * StyleSheet.absoluteFill で画面いっぱいに広げ、他の部品の「後ろ」に置きます。
 */
import { StyleSheet } from 'react-native';
import Svg, { Circle, Pattern, Rect } from 'react-native-svg';

import { colors } from '../theme';

export function CorkBackground() {
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* 22×22 の四角の中に点を 3 つ打ち、それを繰り返し並べる */}
      <Pattern id="cork" width={22} height={22} patternUnits="userSpaceOnUse">
        <Circle cx={3} cy={4} r={1.1} fill={colors.inkSub} opacity={0.22} />
        <Circle cx={14} cy={9} r={1} fill={colors.inkSub} opacity={0.15} />
        <Circle cx={8} cy={17} r={1.2} fill={colors.inkSub} opacity={0.18} />
      </Pattern>
      <Rect width="100%" height="100%" fill={colors.cork} />
      <Rect width="100%" height="100%" fill="url(#cork)" />
    </Svg>
  );
}
