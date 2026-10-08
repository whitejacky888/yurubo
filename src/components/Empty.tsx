/** Empty.tsx ― 「まだ何もありません」を点線の枠で表示する部品 */
import { StyleSheet, View } from 'react-native';

import { colors } from '../theme';
import { Txt } from './Txt';

export function Empty({ text }: { text: string }) {
  return (
    <View style={styles.box}>
      <Txt variant="sub" style={styles.text}>{text}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.inkSub,
    borderRadius: 6,
    padding: 18,
    marginVertical: 8,
  },
  text: { textAlign: 'center' },
});
