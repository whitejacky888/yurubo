/**
 * group/[id].tsx ― グループの編集（名前の変更・メンバーの追加／削除・グループの削除）
 */
import { deleteDoc, doc, getDoc, serverTimestamp, updateDoc } from '@react-native-firebase/firestore';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet } from 'react-native';

import { GroupEditor } from '../../components/GroupEditor';
import { PillButton } from '../../components/PillButton';
import { Screen } from '../../components/Screen';
import { Txt } from '../../components/Txt';
import { db } from '../../lib/firebase';
import type { Group } from '../../lib/types';
import { colors } from '../../theme';

export default function EditGroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [group, setGroup] = useState<Group | null>(null);
  const [missing, setMissing] = useState(false);

  // 最初に 1 回だけ、グループを読み込む
  useEffect(() => {
    getDoc(doc(db, 'groups', id))
      .then((snap) => {
        const data = snap.data();
        if (!data) return setMissing(true);
        setGroup({ id: snap.id, ...(data as Omit<Group, 'id'>) });
      })
      .catch(() => setMissing(true));
  }, [id]);

  const remove = () =>
    Alert.alert(`グループ「${group?.name}」を削除しますか？`, 'このグループに貼った募集は、他の人から見えなくなります。', [
      { text: 'やめる', style: 'cancel' },
      {
        text: '削除する',
        style: 'destructive',
        onPress: async () => {
          await deleteDoc(doc(db, 'groups', id));
          router.back();
        },
      },
    ]);

  if (missing) {
    return (
      <Screen edges={['bottom']}>
        <Txt>グループが見つかりませんでした。</Txt>
      </Screen>
    );
  }
  if (!group) {
    return (
      <Screen edges={['bottom']}>
        <ActivityIndicator color={colors.ink} style={styles.loading} />
      </Screen>
    );
  }

  return (
    <Screen edges={['bottom']}>
      <GroupEditor
        initialName={group.name}
        initialMembers={group.members}
        submitLabel="保存する"
        onSubmit={async (name, members) => {
          await updateDoc(doc(db, 'groups', id), {
            ownerId: group.ownerId,
            name,
            members,
            memberPhones: members.map((m) => m.phone),
            updatedAt: serverTimestamp(),
          });
          router.back();
        }}
      />
      <PillButton title="このグループを削除" color="danger" small onPress={remove} style={styles.delete} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { marginTop: 40 },
  delete: { marginTop: 24 },
});
