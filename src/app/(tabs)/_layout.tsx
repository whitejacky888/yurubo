/**
 * (tabs)/_layout.tsx ― 画面の下に固定されたナビゲーション（タブバー）
 *
 * フォルダ名の (tabs) のように ( ) で囲むと、URL には出てこない「グループ」になります。
 * この中の画面（index / groups / notifications / settings）が、下のタブで切り替わります。
 *
 * デザインガイド：画面下部に固定、上に 2px の線、アイコン＋短いラベル。
 */
import { Tabs } from 'expo-router/js-tabs';

import { useAuth } from '../../auth/AuthProvider';
import { BellIcon, BoardIcon, GroupIcon, PersonIcon } from '../../components/Icons';
import { useNotifications } from '../../lib/hooks';
import { colors, fonts } from '../../theme';

export default function TabsLayout() {
  const { user } = useAuth();
  // 未読のお知らせの数（タブの赤い丸に出す）
  const unread = useNotifications(user?.uid).filter((n) => !n.isRead).length;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.inkSub,
        tabBarStyle: { backgroundColor: colors.paper, borderTopWidth: 2, borderTopColor: colors.ink },
        tabBarLabelStyle: { fontFamily: fonts.regular, fontSize: 11 },
        tabBarBadgeStyle: { backgroundColor: colors.pin, color: '#fff', fontSize: 10 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'ボード', tabBarIcon: ({ color }) => <BoardIcon color={color} /> }}
      />
      <Tabs.Screen
        name="groups"
        options={{ title: 'グループ', tabBarIcon: ({ color }) => <GroupIcon color={color} /> }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'お知らせ',
          tabBarIcon: ({ color }) => <BellIcon color={color} />,
          tabBarBadge: unread > 0 ? unread : undefined, // 0 のときは丸を出さない
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: 'じぶん', tabBarIcon: ({ color }) => <PersonIcon color={color} /> }}
      />
    </Tabs>
  );
}
