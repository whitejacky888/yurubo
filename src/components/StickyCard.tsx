/**
 * StickyCard.tsx ― 画鋲で留めた「付箋」のカード
 *
 * デザインガイドの決まり：
 *   角丸 4px ／ 2px の線 ／ 少し傾ける（-2〜1.5 度）／ 上の真ん中に画鋲 ／ 柔らかい影
 *
 * 使い方：
 *   <StickyCard colorKey={post.id} onPress={...}>中身</StickyCard>
 *   colorKey が同じなら、いつも同じ色・同じ傾きになります。
 *   paper を付けると、白い付箋になります。
 */
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, softShadow, stickyLook } from '../theme';

interface Props {
  children: ReactNode;
  colorKey: string;
  paper?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function StickyCard({ children, colorKey, paper = false, onPress, style }: Props) {
  const look = stickyLook(colorKey);
  const cardStyle = [
    styles.card,
    {
      backgroundColor: paper ? colors.paper : look.backgroundColor,
      transform: [{ rotate: `${look.rotation}deg` }],
    },
    style,
  ];

  const content = (
    <>
      <Pin />
      {children}
    </>
  );

  // onPress があれば押せるカード、なければただの表示
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        // 押している間だけ少し小さくする
        style={({ pressed }) => [cardStyle, pressed && { opacity: 0.85 }]}
      >
        {content}
      </Pressable>
    );
  }
  return <View style={cardStyle}>{content}</View>;
}

/** 画鋲（赤い丸）。付箋の上の真ん中に、はみ出すように置きます */
export function Pin() {
  return (
    <View style={styles.pinWrap} pointerEvents="none">
      <View style={styles.pin}>
        <View style={styles.pinShine} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 4,
    paddingTop: 22,
    paddingHorizontal: 16,
    paddingBottom: 14,
    marginVertical: 14,
    marginHorizontal: 4,
    ...softShadow,
  },
  pinWrap: { position: 'absolute', top: -10, left: 0, right: 0, alignItems: 'center' },
  pin: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.pin,
    borderWidth: 2,
    borderColor: colors.ink,
  },
  pinShine: {
    // 画鋲のツヤ（左上の白っぽい点）
    position: 'absolute',
    top: 2,
    left: 3,
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
});
