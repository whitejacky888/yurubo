/**
 * Field.tsx ― 見出し（ラベル）付きの入力欄
 *
 * デザインガイド：角丸 6px、2px の線、背景はオフホワイト。
 * 使い方： <Field label="タイトル" value={title} onChangeText={setTitle} placeholder="例：..." />
 */
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { colors, fonts } from '../theme';
import { Txt } from './Txt';

export function Field({ label, style, ...inputProps }: TextInputProps & { label?: string }) {
  return (
    <View style={styles.wrap}>
      {label ? <Txt variant="bold" style={styles.label}>{label}</Txt> : null}
      <TextInput placeholderTextColor={colors.placeholder} {...inputProps} style={[styles.input, style]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 12, flexGrow: 1, flexShrink: 1 },
  label: { marginBottom: 4 },
  input: {
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.paper,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
});
