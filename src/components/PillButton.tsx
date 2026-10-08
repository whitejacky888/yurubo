/**
 * PillButton.tsx ― 丸いピル型のボタン
 *
 * デザインガイド：角丸を大きく（9999px）、2px の線、塗りは付箋の色。
 * 使い方： <PillButton title="送る" onPress={...} color="coral" block />
 */
import { ActivityIndicator, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { colors } from '../theme';
import { Txt } from './Txt';

const fills = {
  yellow: colors.yellow,
  coral: colors.coral,
  sage: colors.sage,
  plain: colors.paper,
  danger: colors.danger,
};

interface Props {
  title: string;
  onPress: () => void;
  color?: keyof typeof fills;
  /** 横幅いっぱいにする */
  block?: boolean;
  small?: boolean;
  disabled?: boolean;
  /** 通信中など。true の間はくるくるを出して押せなくする */
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function PillButton({ title, onPress, color = 'yellow', block, small, disabled, loading, style }: Props) {
  const inactive = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive }}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: fills[color] },
        block && styles.block,
        small && styles.small,
        // 押したときは、影の分だけ右下にずらして「押し込んだ」感じにする
        pressed && styles.pressed,
        inactive && styles.inactive,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.ink} />
      ) : (
        <Txt variant="bold" style={small ? styles.smallText : undefined}>
          {title}
        </Txt>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 9999,
    paddingVertical: 10,
    paddingHorizontal: 22,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    // 下に 2px ずらした濃い影で、手描きのボタンっぽく
    shadowColor: colors.ink,
    shadowOffset: { width: 1, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 2,
  },
  block: { alignSelf: 'stretch', marginTop: 12 },
  small: { paddingVertical: 4, paddingHorizontal: 14 },
  smallText: { fontSize: 14 },
  pressed: { transform: [{ translateX: 1 }, { translateY: 2 }], shadowOpacity: 0, elevation: 0 },
  inactive: { opacity: 0.5 },
});
