/**
 * AuthProvider.tsx ― 「今ログインしているのは誰か」をアプリ全体で共有する仕組み
 * ================================================================================
 *
 * React の「Context（コンテキスト）」という機能を使っています。
 * Context に入れた値は、どの画面からでも useAuth() で取り出せます。
 * （画面から画面へ、いちいち値をバケツリレーしなくて済む）
 *
 * 状態は 3 つ：
 *   1. ログインしていない           → user が null
 *   2. ログインしたが、初回登録まだ → user はあるが profile が null
 *   3. 登録まで終わっている         → user も profile もある
 */
import { onAuthStateChanged, type User } from '@react-native-firebase/auth';
import { doc, onSnapshot } from '@react-native-firebase/firestore';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { auth, db } from '../lib/firebase';
import { registerForPushNotifications } from '../lib/push';
import type { Profile } from '../lib/types';

interface AuthState {
  /** 読み込み中（起動直後、ログイン状態を確認している間）は true */
  initializing: boolean;
  /** Firebase のログイン情報（電話番号など） */
  user: User | null;
  /** Firestore に保存しているプロフィール（名前・アイコン） */
  profile: Profile | null;
}

const AuthContext = createContext<AuthState>({ initializing: true, user: null, profile: null });

/** どの画面からでも、ログイン中の人の情報を取り出せる関数（フック） */
export const useAuth = () => useContext(AuthContext);

/** アプリ全体をこれで包むと、中のどこでも useAuth() が使えるようになります */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ initializing: true, user: null, profile: null });

  useEffect(() => {
    // プロフィールの監視をやめるための関数を入れておく箱
    let stopProfile: (() => void) | undefined;

    // ログイン状態が変わるたびに呼ばれます（ログイン・ログアウト・起動時）
    const stopAuth = onAuthStateChanged(auth, (user) => {
      stopProfile?.(); // 前の人のプロフィール監視は止める
      stopProfile = undefined;

      if (!user) {
        setState({ initializing: false, user: null, profile: null });
        return;
      }

      // 自分のプロフィールを「監視」します（onSnapshot：データが変わるとすぐ届く）
      let pushRegistered = false;
      stopProfile = onSnapshot(
        doc(db, 'users', user.uid),
        (snap) => {
          const profile = snap.exists() ? (snap.data() as Profile) : null;
          setState({ initializing: false, user, profile });
          if (profile && !pushRegistered) {
            pushRegistered = true;
            registerForPushNotifications(user.uid); // 通知の準備（失敗しても気にしない）
          }
        },
        () => setState({ initializing: false, user, profile: null }),
      );
    });

    // 画面が閉じられたら、監視をやめます（やめないとムダに通信し続けてしまう）
    return () => {
      stopAuth();
      stopProfile?.();
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}
