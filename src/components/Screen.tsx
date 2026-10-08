/**
 * Screen.tsx ― すべての画面の「土台」
 *
 * ・背景をコルクボードにする
 * ・iPhone のノッチ（画面上の切り欠き）などに文字が隠れないようにする（SafeArea）
 * ・中身が長いときはスクロールできるようにする
 * ・下に引っぱると再読み込み（onRefresh を渡したとき）
 */
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { colors } from '../theme';
import { CorkBackground } from './CorkBackground';

interface Props {
  children: ReactNode;
  /** false にするとスクロールしない（チャット画面など、自分でスクロールを作るとき） */
  scroll?: boolean;
  /** 下に引っぱって再読み込みしたときに呼ばれる */
  onRefresh?: () => void;
  refreshing?: boolean;
  /** 画面の上下どちらの余白を SafeArea で空けるか（タブ画面では下はタブバーが空けてくれる） */
  edges?: Edge[];
  /** 画面の上に重ねて表示するもの（右下の＋ボタンなど） */
  overlay?: ReactNode;
}

export function Screen({ children, scroll = true, onRefresh, refreshing = false, edges = ['top'], overlay }: Props) {
  return (
    <View style={styles.root}>
      <CorkBackground />
      <SafeAreaView style={styles.root} edges={edges}>
        {/* キーボードが出たときに、入力欄が隠れないように持ち上げる */}
        <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {scroll ? (
            <ScrollView
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
              refreshControl={
                onRefresh ? (
                  <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.ink} />
                ) : undefined
              }
            >
              {children}
            </ScrollView>
          ) : (
            <View style={[styles.root, styles.contentFixed]}>{children}</View>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
      {overlay}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, paddingBottom: 120 }, // 下は＋ボタンに隠れないよう広めに
  contentFixed: { paddingHorizontal: 16 },
});
