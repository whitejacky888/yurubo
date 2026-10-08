/**
 * GroupEditor.tsx ― グループの作成・編集で共通の入力フォーム
 * ============================================================
 * 画面 6（新しいグループを作る）と、グループの編集画面の両方で使います。
 *
 *   ・グループ名
 *   ・メンバーの選択（電話帳から／手入力）
 *   ・選んだメンバーの一覧（外す・未登録の人には SMS で招待）
 */
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { useAuth } from '../auth/AuthProvider';
import { api } from '../lib/api';
import { displayPhone } from '../lib/phone';
import { openInviteSms } from '../lib/sms';
import type { GroupMember } from '../lib/types';
import { colors } from '../theme';
import { Badge } from './Badge';
import { Card } from './Card';
import { Field } from './Field';
import { MemberPicker } from './MemberPicker';
import { PillButton } from './PillButton';
import { Txt } from './Txt';

interface Props {
  initialName?: string;
  initialMembers?: GroupMember[];
  submitLabel: string;
  /** 「保存」を押したときに呼ばれる。保存の中身は呼び出し側で決める */
  onSubmit: (name: string, members: GroupMember[]) => Promise<void>;
}

export function GroupEditor({ initialName = '', initialMembers = [], submitLabel, onSubmit }: Props) {
  const { profile } = useAuth();
  const [name, setName] = useState(initialName);
  const [members, setMembers] = useState<GroupMember[]>(initialMembers);
  const [registered, setRegistered] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  // 選んだメンバーが「ゆる募」を使っているかを、サーバーに問い合わせます。
  // ★ 送るのは「選んだ人」の電話番号だけ。電話帳まるごとは送りません。
  const phonesKey = members.map((m) => m.phone).join(',');
  useEffect(() => {
    const phones = phonesKey ? phonesKey.split(',') : [];
    if (phones.length === 0) return;
    let cancelled = false; // 画面を閉じたあとに結果が届いても無視するための目印
    api
      .checkRegistered(phones)
      .then((result) => {
        if (!cancelled) setRegistered(new Set(result.registered));
      })
      .catch(() => {}); // 調べられなくても、グループは作れるので気にしない
    return () => {
      cancelled = true;
    };
  }, [phonesKey]);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 20) return Alert.alert('グループ名は 1〜20 文字で入力してください');
    if (members.length === 0) return Alert.alert('メンバーを 1 人以上選んでください');
    if (members.length > 100) return Alert.alert('メンバーは 100 人までです');
    setBusy(true);
    try {
      await onSubmit(trimmed, members);
    } catch (error) {
      console.warn(error);
      Alert.alert('保存できませんでした');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      <Card>
        <Field label="グループ名" value={name} onChangeText={setName} placeholder="例：大学のなかま" maxLength={20} />
      </Card>

      <Txt variant="heading">メンバー（{members.length}人）</Txt>
      <Card>
        {members.length === 0 ? <Txt variant="sub">下から選んでください。</Txt> : null}
        {members.map((member) => (
          <View key={member.phone} style={styles.memberRow}>
            <View style={styles.grow}>
              <Txt>{member.name}</Txt>
              <Txt variant="small">{displayPhone(member.phone)}</Txt>
            </View>
            {registered.has(member.phone) ? null : (
              // まだアプリを使っていない人には、SMS で招待を送れる
              <View style={styles.invite}>
                <Badge label="未登録" color="coral" />
                <PillButton title="招待する" small color="plain" onPress={() => openInviteSms(member.phone)} />
              </View>
            )}
            <PillButton
              title="外す"
              small
              color="plain"
              onPress={() => setMembers(members.filter((m) => m.phone !== member.phone))}
            />
          </View>
        ))}
      </Card>

      <Txt variant="heading">メンバーを選ぶ</Txt>
      <Card>
        <MemberPicker selected={members} onChange={setMembers} myPhone={profile?.phone ?? ''} />
      </Card>

      <PillButton title={submitLabel} color="coral" block onPress={submit} loading={busy} />
    </View>
  );
}

const styles = StyleSheet.create({
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderStyle: 'dashed',
    borderBottomColor: colors.inkSub,
  },
  grow: { flex: 1 },
  invite: { alignItems: 'flex-end', gap: 4 },
});
