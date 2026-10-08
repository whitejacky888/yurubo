/**
 * Fab.tsx ― 画面右下の丸い「＋」ボタン（FAB = Floating Action Button）
 *
 * デザインガイド：円形・直径 58px・2px の線・少し傾ける（-4 度）。
 */
import { Pressable, StyleSheet } from 'react-native';

import { colors, softShadow } from '../theme';
import { PlusIcon } from './Icons';

export function Fab({ onPress, label }: { onPress: () => void; label: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.fab, pressed && { transform: [{ rotate: '-4deg' }, { scale: 0.94 }] }]}
    >
      <PlusIcon />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.coral,
    borderWidth: 2,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-4deg' }],
    ...softShadow,
  },
});
