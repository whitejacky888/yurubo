/**
 * (tabs)/groups.tsx ― 画面 5：見せる相手グループの一覧
 *
 * 自分が作ったグループを付箋カードで並べます。
 * 募集は、ここで作ったグループの人にだけ見えます。
 */
import { router } from 'expo-router';
import { ActivityIndicator, StyleSheet } from 'react-native';

import { useAuth } from '../../auth/AuthProvider';
import { Empty } from '../../components/Empty';
import { PillButton } from '../../components/PillButton';
import { Screen } from '../../components/Screen';
import { StickyCard } from '../../components/StickyCard';
import { Txt } from '../../components/Txt';
import { useMyGroups } from '../../lib/hooks';
import { colors } from '../../theme';

export default function GroupsScreen() {
  const { user } = useAuth();
  const groups = useMyGroups(user?.uid);

  return (
    <Screen>
      <Txt variant="title">見せる相手グループ</Txt>
      <Txt variant="sub">募集は、ここで選んだグループの人にだけ見えます。</Txt>

      {groups === null ? <ActivityIndicator color={colors.ink} style={styles.loading} /> : null}
      {groups?.length === 0 ? <Empty text="まだグループがありません。" /> : null}
      {groups?.map((group) => (
        <StickyCard key={group.id} colorKey={group.id} onPress={() => router.push(`/group/${group.id}`)}>
          <Txt variant="bold" style={styles.name}>{group.name}</Txt>
          <Txt variant="sub">👥 {group.members.length}人</Txt>
        </StickyCard>
      ))}

      <PillButton title="＋新しいグループを作る" color="coral" block onPress={() => router.push('/group/new')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { marginTop: 24 },
  name: { fontSize: 18, lineHeight: 26 },
});
