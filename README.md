# ゆる募

> ゆるく貼って、そっと集まる。

「断られたらどうしよう」という不安を減らすための仲間集めアプリです。
誘う人も、誘われる人も、「断る／断られる」ストレスを感じない仕組みにしています。

- 誘いは特定の 1 人あてではなく、グループに「ゆるく貼る」だけ
- 興味がある人だけが「参加する」を押す（押さなくても誰にも伝わらない）
- **開催が決まるまで、投稿者の名前も反応した人の名前も、誰にも見えない**
- 人数が揃ったら開催確定。そこで初めてメンバーが分かり、グループトークができる
- 締切までに人数が揃わなかったら、誰にも知らせずに静かに終わる

**使っている技術**：Expo（React Native）＋ TypeScript ／ Firebase（Authentication・Firestore・Cloud Functions）

仕様の元になったドキュメントは `docs/` フォルダにあります。

| ファイル | 内容 |
|---|---|
| `docs/requirements.html` | 要件定義書 |
| `docs/design-guide.html` | デザインガイド（案5：手書き・コルクボード） |
| `docs/terms-and-privacy.html` | 利用規約・プライバシーポリシー（ドラフト。アプリ内の文章は `src/constants/terms.ts`） |

---

## しくみ（匿名設計）

いちばん大事なのは「開催が決まるまで名前を見せない」ことです。
画面で隠すだけだと、アプリを改造されたらデータを覗かれてしまうので、**データの受け渡しの段階で守っています**。

```
 スマホ（アプリ）                        Firebase
 ┌──────────────┐   呼び出し    ┌────────────────────────┐
 │ ホーム・詳細 │ ───────────→ │ Cloud Functions          │
 │              │ ←─────────── │  投稿者・反応者を取り除き │──→ posts（募集）
 │              │  人数だけ     │  「人数」だけ返す         │     ※アプリからは読めない
 │              │               └────────────────────────┘
 │ グループ     │ ──直接読み書き──→ groups（作った本人だけ）
 │ トーク       │ ──直接読み書き──→ chats（開催確定後・メンバーだけ）
 └──────────────┘
```

- `posts`（募集）は `firestore.rules` で**アプリから一切読めない**ようにしています。
- 募集の一覧や詳細は、サーバーの関数（`functions/src/index.ts`）が投稿者の情報を取り除いてから返します（`toPublicPost`）。
- 「参加する」を押さなかった人の記録は、そもそも作りません。
- 人数が揃った瞬間に、サーバーがグループトーク（`chats`）を作ります。そこで初めてメンバーの名前とアイコンが入ります。

---

## はじめる前に用意するもの

| 用意するもの | 用途 |
|---|---|
| [Node.js](https://nodejs.org/) 22 | アプリとサーバー関数を動かす |
| Firebase CLI（`npm install -g firebase-tools`） | Firebase へのデプロイ、エミュレーター |
| Google アカウント | Firebase プロジェクトを作る |
| Android Studio（Android）または Xcode（iOS・Mac のみ） | スマホで動かす。持っていなければ EAS Build（クラウドでビルド）でも OK |
| Java 21 以上 | Firebase エミュレーター（練習用の Firebase）を動かすときだけ |

> ⚠️ **Expo Go アプリでは動きません。**
> 電話番号ログインなどに React Native Firebase（ネイティブのライブラリ）を使っているため、
> 「開発用ビルド（development build）」を作って動かします（手順 4）。

---

## 動かし方

### 1. ライブラリをインストール

```bash
npm install
npm --prefix functions install
```

### 2. Firebase プロジェクトを作る

[Firebase コンソール](https://console.firebase.google.com/) で次の設定をします。

1. **プロジェクトを作成**する
2. **料金プランを Blaze（従量課金）にする**（Cloud Functions を使うのに必要。個人で試す程度なら無料枠に収まることが多いです）
3. **Authentication** → ログイン方法 → **電話番号** を有効にする
4. **Firestore Database** を作成する（ロケーションは `asia-northeast1`（東京）がおすすめ）
5. **アプリを追加**する
   - Android：パッケージ名 `com.example.yurubo` → `google-services.json` をダウンロードして、このフォルダの直下に置く
     - 電話番号ログインには、**SHA-1 と SHA-256 のフィンガープリント**の登録が必要です（EAS Build なら `npx eas-cli credentials` で確認できます）
   - iOS：バンドル ID `com.example.yurubo` → `GoogleService-Info.plist` をダウンロードして、このフォルダの直下に置く
     - 電話番号ログインには、APNs 認証キーの登録が推奨されています

> 💡 パッケージ名・バンドル ID は、`app.json` の `android.package` と `ios.bundleIdentifier` で変えられます。
> ストアに出すときは、自分だけの名前（例：`jp.your-name.yurubo`）に変えてください。

### 3. セキュリティルールとサーバー関数をデプロイ

```bash
firebase login
firebase use --add          # 作ったプロジェクトを選ぶ（.firebaserc ができます）
firebase deploy --only firestore,functions
```

### 4. スマホで動かす（開発用ビルド）

USB でつないだ Android 端末やエミュレーターで動かす場合：

```bash
npm run android     # 中で npx expo run:android を実行（初回はビルドに時間がかかります）
```

iPhone（Mac が必要）の場合は `npm run ios`。
Android Studio や Xcode が無い場合は、EAS Build でクラウドビルドできます：

```bash
npx eas-cli@latest login
npx eas-cli@latest init                              # app.json に EAS のプロジェクト ID が入る
npx eas-cli@latest build --profile development --platform android
```

一度ビルドしたら、あとは `npm start` で開発サーバーを起動するだけで、コードの変更がすぐ反映されます。

### 5.（任意）プッシュ通知

開催確定のお知らせは、アプリ内の「お知らせ」画面に必ず届きます。
スマホの通知としても受け取るには：

1. `npx eas-cli@latest init` で EAS のプロジェクト ID を `app.json` に入れる
2. Android は FCM、iOS は APNs の認証情報を EAS に登録する（`npx eas-cli@latest credentials`）

---

## 練習用の Firebase（エミュレーター）で動かす

本物の SMS を送らずに、パソコンの中だけで試せます。

```bash
cp .env.example .env        # .env の EXPO_PUBLIC_USE_EMULATOR=1 にする
npm run emulators           # エミュレーターを起動（http://localhost:4000 で中身が見られる）
npm start                   # 別のターミナルで
```

ログイン画面で電話番号を入れると、認証コードは**エミュレーターの画面（http://localhost:4000 → Authentication）やターミナルに表示**されます。

> 実機で試すときは、`.env` の `EXPO_PUBLIC_EMULATOR_HOST` にパソコンの IP アドレスを書いてください。

---

## テスト

```bash
npm test                # サーバーのルール（logic.ts）の単体テスト
npm run test:emulator   # エミュレーターを起動して、アプリと同じ方法で一通り動かすテスト（Java が必要）
npm run typecheck       # 型チェック
npm run lint            # コードの書き方チェック
```

`test:emulator` では、次のことを確かめています。

- 募集はアプリから直接読めない／ボードやサーバーの返事に投稿者の情報が入っていない
- 反応しても、投稿者には人数しか分からず、途中経過の通知も届かない
- 人数が揃ったら開催確定 → トークができ、メンバー全員に通知が届く
- トークはメンバー以外は読めない・書けない／他人になりすまして送れない
- 締切を過ぎた募集は静かに消える
- アカウント削除で、本人のデータが消える

---

## ファイルの構成

```
yurubo/
├── app.json                 … アプリの設定（名前・アイコン・権限・ネイティブの設定）
├── firebase.json            … Firebase の設定（エミュレーターのポートなど）
├── firestore.rules          … ★ データベースの鍵（誰が何を読み書きできるか）
├── firestore.indexes.json   … データベースの検索用インデックス
├── src/
│   ├── app/                 … 画面（ファイル＝画面。Expo Router）
│   │   ├── _layout.tsx           … 全体の土台（フォント・ログイン状態で画面を切り替え）
│   │   ├── login.tsx / signup.tsx … 電話番号ログイン・初回プロフィール登録
│   │   ├── (tabs)/               … 下のタブで切り替える画面
│   │   │   ├── index.tsx         … 画面1 ホーム（コルクボード）
│   │   │   ├── groups.tsx        … 画面5 見せる相手グループの一覧
│   │   │   ├── notifications.tsx … お知らせ
│   │   │   └── settings.tsx      … じぶん（プロフィール・アカウント削除）
│   │   ├── post/new.tsx          … 画面2 誘いをつくる
│   │   ├── post/[id].tsx         … 画面3 募集の詳細
│   │   ├── chat/[id].tsx         … 画面4 開催決定後のグループトーク
│   │   ├── group/new.tsx         … 画面6 新しいグループを作る
│   │   ├── group/[id].tsx        … グループの編集
│   │   └── terms.tsx             … 利用規約・プライバシーポリシー
│   ├── components/          … 部品（付箋カード・ボタン・電話帳から選ぶ部品など）
│   ├── lib/                 … Firebase への接続、サーバー関数の呼び出し、便利関数
│   ├── auth/                … ログイン状態の管理
│   ├── constants/terms.ts   … 利用規約の文章
│   └── theme.ts             … 色・フォント（デザインガイドのカラーパレット）
├── functions/               … ★ サーバー側の処理（Cloud Functions）
│   ├── src/index.ts         … 募集・反応・開催確定・自動クローズ・アカウント削除
│   ├── src/logic.ts         … ルール（入力チェック・開催確定の判定・匿名化）
│   ├── src/logic.test.ts    … ルールの単体テスト
│   └── test/integration.test.ts … エミュレーターでの結合テスト
└── docs/                    … 仕様のドキュメント
```

## 要件定義書の機能との対応

| # | 機能 | どこで実装しているか |
|---|---|---|
| 1 | ゆる募集投稿 | `src/app/post/new.tsx` → サーバーの `createPost` |
| 2 | グループ単位の公開範囲（作成・名前変更・メンバー追加／削除・削除） | `src/app/group/*`、`src/components/GroupEditor.tsx` |
| 3 | そっと反応（挙手制） | `src/app/post/[id].tsx` → `react` / `unreact` |
| 4 | 匿名段階マッチング | `getBoard` / `getPost`（`toPublicPost` で人数だけにする）＋ `firestore.rules` |
| 5 | 既読・拒否の非表示 | 既読や「押さなかった」記録をそもそも保存しない |
| 6 | 自動クローズ（揃ったら即確定／揃わなければ静かに終了） | `react` の中の開催確定、`closeExpiredPosts`（10 分ごと） |
| 7 | 予定の自動チャット化 | 開催確定時に `chats/{募集ID}` を作成、`src/app/chat/[id].tsx` |
| 8 | 開催確定時のみの通知 | 開催確定時だけ `notifications` を作り、プッシュ通知を送る |
| 9 | 開催決定後の不参加連絡 | トークの「行けなくなった…と伝える」（`kind: 'absence'`、メンバーにだけ見える） |
| - | 電話帳アクセスの説明画面・拒否時の手入力／設定を開く・未登録者への SMS 招待 | `src/components/MemberPicker.tsx`、`checkRegistered`、`src/lib/sms.ts` |
| - | アカウント・データの削除 | じぶん画面 → `deleteAccount` |

## 本番公開の前にやること

- `app.json` のパッケージ名・バンドル ID を自分のものに変える
- 利用規約（`src/constants/terms.ts` と `docs/terms-and-privacy.html`）の【　】を埋めて、専門家に確認してもらう
- 利用規約・プライバシーポリシーを Web ページとして公開し、その URL をストア申請で入力する
- Apple Developer Program / Google Play Console のアカウントを用意する
- Firebase の [App Check](https://firebase.google.com/docs/app-check) を有効にして、不正なアクセスを防ぐ（おすすめ）
