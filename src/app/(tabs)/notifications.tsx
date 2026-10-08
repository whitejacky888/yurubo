/**
 * (tabs)/notifications.tsx ― お知らせ一覧
 *
 * 「ゆる募」のお知らせは、開催が確定したときの 1 種類だけです。
 * （反応が増えた、などの途中経過は知らせません）
 * この画面を開いたら、未読のお知らせをまとめて既読にします。
 */
import { doc, writeBatch } from '@react-native-firebase/firestore';
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '../../auth/AuthProvider';
import { Badge } from '../../components/Badge';
import { Empty } from '../../components/Empty';
import { Screen } from '../../components/Screen';
import { StickyCard } from '../../components/StickyCard';
import { Txt } from '../../components/Txt';
import { db } from '../../lib/firebase';
import { formatShort } from '../../lib/format';
import { useNotifications } from '../../lib/hooks';

export default function NotificationsScreen() {
  const { user } = useAuth();
  const items = useNotifications(user?.uid);
  const unreadIds = items.filter((n) => !n.isRead).map((n) => n.id).join(',');

  // 画面を開いたら、未読をまとめて既読にする（writeBatch：まとめて書き込む）
  useFocusEffect(
    useCallback(() => {
      if (!user || !unreadIds) return;
      const batch = writeBatch(db);
      unreadIds.split(',').forEach((id) => batch.update(doc(db, 'users', user.uid, 'notifications', id), { isRead: true }));
      batch.commit().catch(() => {});
    }, [user, unreadIds]),
  );

  return (
    <Screen>
      <Txt variant="title">お知らせ</Txt>
      <Txt variant="sub">お知らせが届くのは、開催が決まったときだけです。</Txt>
      {items.length === 0 ? <Empty text="お知らせはありません。" /> : null}
      {items.map((item) => (
        <StickyCard
          key={item.id}
          colorKey={item.id}
          paper={item.isRead}
          onPress={item.postId ? () => router.push(`/chat/${item.postId}`) : undefined}
        >
          <Txt variant="bold">{item.body}</Txt>
          <View style={styles.row}>
            {item.createdAt ? <Txt variant="sub">{formatShort(item.createdAt)}</Txt> : null}
            {!item.isRead ? <Badge label="NEW" color="coral" /> : null}
          </View>
        </StickyCard>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
});
