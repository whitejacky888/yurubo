/**
 * group/new.tsx ― 画面 6：新しいグループを作る
 *
 * グループは「作った人だけのもの」なので、アプリから直接 Firestore に保存します。
 * （firestore.rules で、作った本人しか読み書きできないようにしています）
 */
import { addDoc, collection, serverTimestamp } from '@react-native-firebase/firestore';
import { router } from 'expo-router';

import { useAuth } from '../../auth/AuthProvider';
import { GroupEditor } from '../../components/GroupEditor';
import { Screen } from '../../components/Screen';
import { db } from '../../lib/firebase';

export default function NewGroupScreen() {
  const { user } = useAuth();

  return (
    <Screen edges={['bottom']}>
      <GroupEditor
        submitLabel="グループを作る"
        onSubmit={async (name, members) => {
          if (!user) return;
          await addDoc(collection(db, 'groups'), {
            ownerId: user.uid,
            name,
            members,
            // サーバーが「この人に見せてよいか」をすばやく調べるための、電話番号だけの一覧
            memberPhones: members.map((m) => m.phone),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          router.back();
        }}
      />
    </Screen>
  );
}
