"""
db.py ― データベース（データの保存場所）を扱うファイル
==========================================================

このアプリでは、Python に最初から入っている「SQLite（エスキューライト）」という
小さなデータベースを使います。SQLite はデータを 1 つのファイル（yurubo.db）に
保存してくれるので、別途サーバーを用意しなくても動かせて、初心者にやさしいです。

【このファイルでやっていること】
  1. データベースへの接続（つなぐ）・切断（とじる）
  2. テーブル（＝データを入れる表）を作る
  3. 電話番号の書き方をそろえる（正規化）などの小さな便利関数

【テーブルの一覧】
  users          … アプリの利用者（電話番号・表示名・アイコン）
  contacts       … 利用者ごとの「電話帳」（スマホの連絡先の代わり）
  groups_        … 募集を見せる相手グループ（※ group は SQL の予約語なので _ を付けています）
  group_members  … グループに入っている人（電話番号で管理）
  posts          … ゆる募集（タイトル・日時・場所・人数・締切など）
  reactions      … 「参加する」を押した記録（＝そっと反応）
  messages       … 開催確定後のグループトークのメッセージ
  notifications  … お知らせ（開催確定のときだけ作られる）
"""

import re  # 文字列から数字だけを取り出すのに使う「正規表現」の道具
import sqlite3  # SQLite を Python から使うための標準ライブラリ

from flask import current_app, g  # g = 1 回のリクエストの間だけ使える入れ物


# ---------------------------------------------------------------------------
# テーブルを作るための SQL 文
# ---------------------------------------------------------------------------
# 「CREATE TABLE IF NOT EXISTS」は「まだ無ければ作る」という意味です。
# 何度実行しても、すでにあるテーブルは壊れないので安心です。
SCHEMA = """
-- 利用者のテーブル
CREATE TABLE IF NOT EXISTS users (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,  -- 自動で 1,2,3... と番号が振られる
    phone               TEXT NOT NULL UNIQUE,               -- 電話番号（同じ番号は 2 人登録できない）
    name                TEXT NOT NULL,                      -- 表示名（開催確定後にだけ他の人に見える）
    icon                TEXT NOT NULL DEFAULT '🙂',         -- アイコン（今回は絵文字で代用）
    contacts_permission TEXT NOT NULL DEFAULT 'unknown',    -- 電話帳アクセス: unknown / allowed / denied
    created_at          TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- 電話帳（スマホの連絡先の代わり）
-- Web アプリでは本物の電話帳を読めないので、利用者が自分で登録した連絡先を
-- 「電話帳」として扱います。
CREATE TABLE IF NOT EXISTS contacts (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,  -- 誰の電話帳か
    name     TEXT NOT NULL,
    phone    TEXT NOT NULL,
    UNIQUE (owner_id, phone)  -- 同じ人の電話帳に同じ番号を 2 回入れない
);

-- 見せる相手グループ
CREATE TABLE IF NOT EXISTS groups_ (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,  -- グループを作った人
    name       TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- グループのメンバー（電話番号で登録。まだアプリを使っていない人も入れられる）
CREATE TABLE IF NOT EXISTS group_members (
    group_id INTEGER NOT NULL REFERENCES groups_(id) ON DELETE CASCADE,
    name     TEXT NOT NULL,  -- グループ作成者の電話帳での呼び名（作成者だけが見る）
    phone    TEXT NOT NULL,
    PRIMARY KEY (group_id, phone)
);

-- ゆる募集
CREATE TABLE IF NOT EXISTS posts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    author_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,  -- 投稿者（他人には絶対に見せない）
    group_id   INTEGER REFERENCES groups_(id) ON DELETE SET NULL,        -- 公開範囲のグループ
    title      TEXT NOT NULL,         -- 例：「今週末カラオケ行ける人〜」
    event_at   TEXT NOT NULL,         -- 開催日時（例：2026-10-10T19:00）
    place      TEXT NOT NULL DEFAULT '',
    capacity   INTEGER NOT NULL,      -- 開催人数（投稿者本人を含む人数）
    deadline   TEXT NOT NULL,         -- 募集の締切（これを過ぎたら静かに終了）
    status     TEXT NOT NULL DEFAULT 'open',  -- open=募集中 / confirmed=開催確定 / closed=静かに終了
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- そっと反応（「参加する」を押した記録）
-- ★ 押さなかった人の記録は「そもそも作らない」ので、誰が無反応だったかは誰にも分かりません。
CREATE TABLE IF NOT EXISTS reactions (
    post_id    INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    PRIMARY KEY (post_id, user_id)  -- 1 人 1 回まで
);

-- 開催確定後のグループトーク
CREATE TABLE IF NOT EXISTS messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id    INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,  -- NULL のときはアプリからのお知らせ
    body       TEXT NOT NULL,
    kind       TEXT NOT NULL DEFAULT 'normal',  -- normal=ふつう / absence=不参加連絡 / system=お知らせ
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- お知らせ（開催が確定したときだけ作る。途中経過では作らない）
CREATE TABLE IF NOT EXISTS notifications (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id    INTEGER REFERENCES posts(id) ON DELETE CASCADE,
    body       TEXT NOT NULL,
    is_read    INTEGER NOT NULL DEFAULT 0,  -- 0=未読 / 1=既読（SQLite には True/False が無いので数字で）
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
"""


def get_db():
    """
    データベースにつなぐ関数。

    1 回のリクエスト（ページを 1 回開くこと）の中で何度呼ばれても、
    接続は 1 つだけ作って使い回します（g に入れておくのがポイント）。
    """
    if "db" not in g:
        g.db = sqlite3.connect(current_app.config["DATABASE"])
        # row_factory を設定すると、結果を row["title"] のように「列の名前」で取り出せて便利です
        g.db.row_factory = sqlite3.Row
        # SQLite は初期設定だと「ON DELETE CASCADE（親を消したら子も消す）」が効かないので、オンにします
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


def close_db(error=None):
    """リクエストが終わったら、データベースとの接続を閉じる関数。"""
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    """テーブルを作る関数（アプリの起動時に呼びます）。"""
    db = get_db()
    db.executescript(SCHEMA)  # executescript は複数の SQL 文をまとめて実行できます
    db.commit()  # commit で「保存を確定」させます


def init_app(app):
    """Flask アプリに、データベース関係の設定を登録する関数。"""
    # teardown_appcontext に登録した関数は、リクエストの最後に自動で呼ばれます
    app.teardown_appcontext(close_db)
    with app.app_context():
        init_db()


# ---------------------------------------------------------------------------
# 小さな便利関数
# ---------------------------------------------------------------------------
def normalize_phone(raw):
    """
    電話番号の書き方をそろえる関数（正規化）。

    人によって「090-1234-5678」「09012345678」「+81 90 1234 5678」のように
    書き方がバラバラなので、比べる前に「数字だけ・0 始まり」にそろえます。

    例:
        normalize_phone("090-1234-5678")    → "09012345678"
        normalize_phone("+81 90 1234 5678") → "09012345678"
        normalize_phone("abc")              → ""（数字が無いときは空文字）
    """
    digits = re.sub(r"\D", "", raw or "")  # \D = 数字以外。数字以外をすべて消します
    if digits.startswith("81") and len(digits) >= 11:
        # 国番号 81（日本）で始まる場合は、先頭を 0 に置き換えます
        digits = "0" + digits[2:]
    return digits


def is_valid_phone(phone):
    """正規化した電話番号が、日本の電話番号らしい形（0 始まりで 10〜11 桁）かを調べます。"""
    return bool(re.fullmatch(r"0\d{9,10}", phone))
