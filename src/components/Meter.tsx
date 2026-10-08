/** Meter.tsx ― 集まり具合のメーター（◯/◯人 を横棒で表す） */
import { StyleSheet, View } from 'react-native';

import { colors } from '../theme';

export function Meter({ value, max }: { value: number; max: number }) {
  // 0〜100% の範囲におさめる（Math.min / Math.max）
  const percent = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${percent}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 16,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 9999,
    backgroundColor: colors.paper,
    overflow: 'hidden',
    marginVertical: 8,
  },
  fill: { height: '100%', backgroundColor: colors.sage },
});
