/**
 * IconPicker.tsx ― アイコン（絵文字）を選ぶ部品
 * 本格的にするなら画像のアップロードにしますが、まずはシンプルに絵文字から選ぶ形にしています。
 */
import { Pressable, StyleSheet, View } from 'react-native';

import { colors } from '../theme';
import { Txt } from './Txt';

export const ICON_CHOICES = ['🙂', '😺', '🐶', '🐻', '🐼', '🦊', '🐸', '🐧', '🌻', '🍙', '☕', '🎸'];

export function IconPicker({ value, onChange }: { value: string; onChange: (icon: string) => void }) {
  return (
    <View style={styles.row}>
      {ICON_CHOICES.map((icon) => {
        const selected = icon === value;
        return (
          <Pressable
            key={icon}
            onPress={() => onChange(icon)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            style={[styles.choice, selected && styles.selected]}
          >
            <Txt style={styles.emoji}>{icon}</Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  choice: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selected: { borderColor: colors.ink, backgroundColor: colors.yellow },
  emoji: { fontSize: 24, lineHeight: 32 },
});
