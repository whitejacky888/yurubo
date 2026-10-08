/** Badge.tsx ― 小さなラベル（「未登録」「NEW」など） */
import { StyleSheet, View } from 'react-native';

import { colors } from '../theme';
import { Txt } from './Txt';

export function Badge({ label, color = 'paper' }: { label: string; color?: 'paper' | 'sage' | 'coral' }) {
  return (
    <View style={[styles.badge, { backgroundColor: colors[color] }]}>
      <Txt style={styles.text}>{label}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderWidth: 1.5,
    borderColor: colors.ink,
    borderRadius: 9999,
    paddingHorizontal: 8,
    alignSelf: 'flex-start',
  },
  text: { fontSize: 12, lineHeight: 18 },
});
