/**
 * MemberPicker.tsx ― グループのメンバーを選ぶ部品
 * =================================================
 *
 * メンバーの選び方は 2 通り：
 *   1. スマホの電話帳（連絡先）からチェックボックスで選ぶ
 *   2. 電話番号を手で入力する（電話帳へのアクセスを許可しなかった人のための代わりの方法）
 *
 * 【電話帳の扱い（プライバシーポリシーより）】
 *   ・アクセスを求める前に、何に使うのかを説明する
 *   ・電話帳の中身はサーバーに送らない。保存するのは「選んだ人」だけ
 *   ・許可されなかったら、手入力か「設定を開く」ボタンで対応する
 */
import { Contact, ContactField, getPermissionsAsync, requestPermissionsAsync } from 'expo-contacts';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, View } from 'react-native';

import { displayPhone, normalizePhone } from '../lib/phone';
import type { GroupMember } from '../lib/types';
import { colors } from '../theme';
import { Card } from './Card';
import { Field } from './Field';
import { ContactsIcon } from './Icons';
import { PillButton } from './PillButton';
import { Txt } from './Txt';

/** 電話帳の 1 人分（電話番号が複数ある人は、番号ごとに 1 行にします） */
interface PhonebookEntry {
  key: string;
  name: string;
  phone: string; // +81 の形にそろえた番号
}

/** 電話帳の状態：まだ聞いていない / 許可された / 許可されなかった */
type Permission = 'checking' | 'undetermined' | 'granted' | 'denied';

interface Props {
  /** 今選ばれているメンバー */
  selected: GroupMember[];
  /** 選ばれたメンバーが変わったときに呼ばれる */
  onChange: (members: GroupMember[]) => void;
  /** 自分の電話番号（自分はメンバーに入れない） */
  myPhone: string;
}

export function MemberPicker({ selected, onChange, myPhone }: Props) {
  const [permission, setPermission] = useState<Permission>('checking');
  const [phonebook, setPhonebook] = useState<PhonebookEntry[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [search, setSearch] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualPhone, setManualPhone] = useState('');

  // 選ばれている電話番号の一覧（チェックが入っているかを素早く調べるため Set にする）
  const selectedPhones = useMemo(() => new Set(selected.map((m) => m.phone)), [selected]);

  /** 電話帳を読み込む */
  const loadPhonebook = useCallback(async () => {
    setLoadingContacts(true);
    try {
      // 名前と電話番号だけを読み込みます（必要なものだけ読むのがプライバシーの基本）
      const contacts = await Contact.getAllDetails([ContactField.FULL_NAME, ContactField.PHONES]);
      const entries: PhonebookEntry[] = [];
      const seen = new Set<string>();
      for (const contact of contacts) {
        for (const phone of contact.phones ?? []) {
          const normalized = normalizePhone(phone.number ?? '');
          if (!normalized || normalized === myPhone || seen.has(normalized)) continue;
          seen.add(normalized);
          entries.push({ key: `${contact.id}-${normalized}`, name: contact.fullName || normalized, phone: normalized });
        }
      }
      entries.sort((a, b) => a.name.localeCompare(b.name, 'ja')); // 名前順（日本語の並び）
      setPhonebook(entries);
    } catch (error) {
      console.warn(error);
      Alert.alert('電話帳を読み込めませんでした');
    } finally {
      setLoadingContacts(false);
    }
  }, [myPhone]);

  // 最初に 1 回だけ、電話帳へのアクセスが許可されているかを確認します
  useEffect(() => {
    getPermissionsAsync().then((result) => {
      if (result.granted) {
        setPermission('granted');
        loadPhonebook();
      } else {
        // canAskAgain が true なら、まだ聞いていない（もう一度聞ける）
        setPermission(result.canAskAgain ? 'undetermined' : 'denied');
      }
    });
  }, [loadPhonebook]);

  /** 「許可する」を押したとき：ここで初めて OS の許可ダイアログを出します */
  const askPermission = async () => {
    const result = await requestPermissionsAsync();
    if (result.granted) {
      setPermission('granted');
      loadPhonebook();
    } else {
      setPermission('denied');
    }
  };

  /** チェックボックスを押したとき：選ばれていれば外し、選ばれていなければ加える */
  const toggle = (entry: PhonebookEntry) => {
    if (selectedPhones.has(entry.phone)) {
      onChange(selected.filter((m) => m.phone !== entry.phone));
    } else {
      onChange([...selected, { name: entry.name, phone: entry.phone }]);
    }
  };

  /** 手入力で追加 */
  const addManual = () => {
    const phone = normalizePhone(manualPhone);
    if (!phone) {
      Alert.alert('電話番号が正しくないみたいです', '例：090-1234-5678');
      return;
    }
    if (phone === myPhone) {
      Alert.alert('自分の電話番号はメンバーに入れなくて大丈夫です');
      return;
    }
    if (!selectedPhones.has(phone)) {
      onChange([...selected, { name: manualName.trim() || displayPhone(phone), phone }]);
    }
    setManualName('');
    setManualPhone('');
  };

  // 検索欄に入れた文字で絞り込み（表示は最大 200 人まで）
  const filtered = phonebook
    .filter((entry) => !search || entry.name.includes(search) || entry.phone.includes(search.replace(/\D/g, '')))
    .slice(0, 200);

  return (
    <View>
      {/* ---------- 1. 電話帳から選ぶ ---------- */}
      {permission === 'checking' ? <ActivityIndicator color={colors.ink} /> : null}

      {permission === 'undetermined' ? (
        // 許可を求める前の「説明」
        <Card style={styles.explain}>
          <View style={styles.row}>
            <ContactsIcon />
            <Txt variant="bold">電話帳を使ってもいいですか？</Txt>
          </View>
          <Txt variant="sub">
            グループのメンバーを、連絡先から選べるようにするためです。保存するのは、あなたが
            <Txt variant="bold">選んだ人の名前と電話番号だけ</Txt>
            です。広告や他の目的には使いません。
          </Txt>
          <PillButton title="許可する" color="sage" block onPress={askPermission} />
          <PillButton title="許可しない（電話番号を手入力する）" color="plain" block onPress={() => setPermission('denied')} />
        </Card>
      ) : null}

      {permission === 'denied' ? (
        <Txt variant="sub" style={styles.note}>
          電話帳へのアクセスは許可されていません。下の欄に電話番号を入力して追加できます。
          あとから許可するときは
          <Txt variant="sub" style={styles.link} onPress={() => Linking.openSettings()}>
            「設定を開く」
          </Txt>
          から変更できます。
        </Txt>
      ) : null}

      {permission === 'granted' ? (
        <View>
          <Field label="電話帳から選ぶ" value={search} onChangeText={setSearch} placeholder="名前や番号でさがす" />
          {loadingContacts ? <ActivityIndicator color={colors.ink} style={styles.loading} /> : null}
          {!loadingContacts && filtered.length === 0 ? (
            <Txt variant="sub" style={styles.note}>選べる連絡先がありません。</Txt>
          ) : null}
          {filtered.map((entry) => {
            const checked = selectedPhones.has(entry.phone);
            return (
              <Pressable
                key={entry.key}
                onPress={() => toggle(entry)}
                style={styles.item}
                accessibilityRole="checkbox"
                accessibilityState={{ checked }}
              >
                {/* 手描き風のチェックボックス */}
                <View style={[styles.checkbox, checked && styles.checkboxOn]}>
                  {checked ? <Txt style={styles.check}>✓</Txt> : null}
                </View>
                <View style={styles.grow}>
                  <Txt>{entry.name}</Txt>
                  <Txt variant="small">{displayPhone(entry.phone)}</Txt>
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {/* ---------- 2. 電話番号を手で入力する ---------- */}
      <Txt variant="bold" style={styles.manualLabel}>電話番号を手で入力する</Txt>
      <View style={styles.row}>
        <Field value={manualName} onChangeText={setManualName} placeholder="なまえ" maxLength={20} />
        <Field value={manualPhone} onChangeText={setManualPhone} placeholder="090-1234-5678" keyboardType="phone-pad" />
      </View>
      <PillButton title="＋ 追加" small color="sage" onPress={addManual} style={styles.addButton} />
    </View>
  );
}

const styles = StyleSheet.create({
  explain: { marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  note: { marginTop: 8 },
  link: { textDecorationLine: 'underline', color: colors.ink },
  loading: { marginVertical: 12 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderStyle: 'dashed',
    borderBottomColor: colors.inkSub,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 4,
    backgroundColor: colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.yellow },
  check: { fontSize: 16, lineHeight: 20 },
  grow: { flex: 1 },
  manualLabel: { marginTop: 20 },
  addButton: { marginTop: 8 },
});
