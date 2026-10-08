/**
 * DateTimeField.tsx ― 日時を選ぶ入力欄
 *
 * 日時の選び方は、Android と iOS で仕組みが違います。
 *   Android … 「日付」のダイアログ → 続けて「時刻」のダイアログ、の 2 段階で開く
 *   iOS     … 欄を押すと、その下にカレンダー兼時計（ピッカー）が開く
 * Platform.OS で、今どちらのスマホで動いているかを調べて切り替えています。
 */
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { formatDateTime } from '../lib/format';
import { colors } from '../theme';
import { Txt } from './Txt';

interface Props {
  label: string;
  value: Date | null;
  onChange: (date: Date | null) => void;
  placeholder?: string;
  minimumDate?: Date;
  /** 「クリア」ボタンを出す（締切のように、空でもよい項目のとき） */
  clearable?: boolean;
}

export function DateTimeField({ label, value, onChange, placeholder = '日時を選ぶ', minimumDate, clearable }: Props) {
  const [iosOpen, setIosOpen] = useState(false);
  // まだ選んでいないときにピッカーに表示する日時（明日の 19 時）
  const initial = value ?? defaultDate();

  const open = () => {
    if (Platform.OS === 'android') {
      // 1 段階目：日付を選ぶ
      DateTimePickerAndroid.open({
        value: initial,
        mode: 'date',
        minimumDate,
        onValueChange: (_event, date) => {
          // 2 段階目：時刻を選ぶ
          DateTimePickerAndroid.open({
            value: date,
            mode: 'time',
            is24Hour: true,
            onValueChange: (_e, time) => onChange(time),
          });
        },
      });
    } else {
      setIosOpen((now) => !now);
    }
  };

  return (
    <View style={styles.wrap}>
      <Txt variant="bold" style={styles.label}>{label}</Txt>
      <View style={styles.row}>
        <Pressable onPress={open} style={styles.input} accessibilityRole="button" accessibilityLabel={label}>
          <Txt style={value ? undefined : { color: colors.placeholder }}>
            {value ? formatDateTime(value) : placeholder}
          </Txt>
        </Pressable>
        {clearable && value ? (
          <Pressable onPress={() => onChange(null)} style={styles.clear} accessibilityRole="button">
            <Txt variant="sub">クリア</Txt>
          </Pressable>
        ) : null}
      </View>
      {Platform.OS === 'ios' && iosOpen ? (
        <DateTimePicker
          value={initial}
          mode="datetime"
          display="inline"
          minimumDate={minimumDate}
          locale="ja-JP"
          accentColor={colors.ink}
          onValueChange={(_event, date) => onChange(date)}
        />
      ) : null}
    </View>
  );
}

/** 明日の 19:00 を作る */
function defaultDate() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(19, 0, 0, 0);
  return d;
}

const styles = StyleSheet.create({
  wrap: { marginTop: 12 },
  label: { marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    flex: 1,
    backgroundColor: colors.paper,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  clear: { paddingHorizontal: 6 },
});
