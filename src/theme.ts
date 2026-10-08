/**
 * theme.ts ― 色・フォントなど、見た目の決まりごと（デザインガイド 案5：手書き・コルクボード）
 *
 * 色をあちこちに直接書くと、あとで変えたいときに大変なので、ここにまとめておきます。
 * 使うときは  import { colors } from '../theme';  →  colors.ink  のように書きます。
 */

/** カラーパレット（デザインガイドの表のとおり） */
export const colors = {
  cork: '#F1E4C8', //        背景（コルクボード）ベージュ
  paper: '#FBF4E4', //       カード背景 オフホワイト
  yellow: '#FFE9A8', //      付箋1 イエロー
  coral: '#F8C9B4', //       付箋2 コーラル
  sage: '#CFE3C4', //        付箋3 セージグリーン
  ink: '#4E3B27', //         文字・線 ダークブラウン
  inkSub: '#8C7454', //      補助テキスト ライトブラウン
  placeholder: '#B49B76', // プレースホルダー くすみベージュ
  pin: '#C0392B', //         画鋲（ピン）レッド
  danger: '#F3B1A6', //      削除ボタンなど
} as const;

/** 付箋の色（順番に使い回す） */
export const stickyColors = [colors.yellow, colors.coral, colors.sage];

/** 付箋の傾き（度）。-2deg〜1.5deg 程度でランダム感を出す */
export const stickyRotations = [-2, 1.5, -1, 0.8, -1.5, 1.2];

/**
 * フォント名。app/_layout.tsx で読み込んだ Klee One（日本語手書き風フォント）の名前です。
 * React Native では「太さ違い」も別のフォント名として指定します。
 */
export const fonts = {
  regular: 'KleeOne_400Regular',
  bold: 'KleeOne_600SemiBold',
} as const;

/** 柔らかい影（デザインガイド：2px 4px 8px rgba(78,59,39,0.18)） */
export const softShadow = {
  // iOS 用の影
  shadowColor: colors.ink,
  shadowOffset: { width: 2, height: 4 },
  shadowOpacity: 0.18,
  shadowRadius: 8,
  // Android 用の影（elevation = 浮き上がりの高さ）
  elevation: 3,
} as const;

/**
 * 文字列（募集の ID など）から、付箋の色と傾きを決めます。
 * 同じ ID なら毎回同じ見た目になるので、画面を開き直しても付箋の色が変わりません。
 */
export function stickyLook(key: string) {
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0; // 文字列 → 数字
  return {
    backgroundColor: stickyColors[hash % stickyColors.length],
    rotation: stickyRotations[hash % stickyRotations.length],
  };
}
