/**
 * Txt.tsx ― 手書き風フォント（Klee One）で文字を表示する部品
 *
 * React Native の <Text> は、フォントを毎回指定しないといけないので、
 * 最初からフォントと色を設定した <Txt> を作って、どの画面でもこれを使います。
 *
 * 使い方： <Txt>ふつうの文字</Txt>  <Txt variant="title">見出し</Txt>  <Txt variant="sub">補足</Txt>
 */
import { StyleSheet, Text, type TextProps } from 'react-native';

import { colors, fonts } from '../theme';

type Variant = 'body' | 'bold' | 'title' | 'heading' | 'sub' | 'small';

export function Txt({ variant = 'body', style, ...rest }: TextProps & { variant?: Variant }) {
  // style を後ろに書くと、使う側で色や大きさを上書きできます
  return <Text {...rest} style={[styles.base, styles[variant], style]} />;
}

const styles = StyleSheet.create({
  base: { fontFamily: fonts.regular, color: colors.ink, fontSize: 16, lineHeight: 24 },
  body: {},
  bold: { fontFamily: fonts.bold },
  title: { fontFamily: fonts.bold, fontSize: 24, lineHeight: 34 },
  heading: { fontFamily: fonts.bold, fontSize: 18, lineHeight: 28, marginTop: 20, marginBottom: 4 },
  sub: { color: colors.inkSub, fontSize: 14, lineHeight: 21 },
  small: { color: colors.inkSub, fontSize: 12, lineHeight: 18 },
});
