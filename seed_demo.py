"""
seed_demo.py ― お試し用のデータを入れるスクリプト
====================================================

実行すると、データベース（yurubo.db）を作り直して、お試し用の利用者・グループ・募集を入れます。
  python seed_demo.py

【お試し用の利用者】（ログイン画面でこの電話番号を入れてください）
  090-0000-0001  たろう
  090-0000-0002  はなこ
  090-0000-0003  じろう
  090-0000-0004  さくら

※ 開発モードでは、認証コードが画面に表示されます。
"""

import os
from datetime import datetime, timedelta

from app import DATETIME_FORMAT, confirm_if_full, create_app
from db import get_db

# お試し用の利用者（電話番号, 名前, アイコン）
USERS = [
    ("09000000001", "たろう", "🐶"),
    ("09000000002", "はなこ", "🌻"),
    ("09000000003", "じろう", "🐸"),
    ("09000000004", "さくら", "🦊"),
]


def days_later(days, hour):
    """今日から days 日後の hour 時ちょうどを、保存用の文字列にして返します。"""
    dt = (datetime.now() + timedelta(days=days)).replace(hour=hour, minute=0)
    return dt.strftime(DATETIME_FORMAT)


def main():
    app = create_app()

    # 古いデータベースファイルがあれば消して、まっさらな状態から始めます
    if os.path.exists(app.config["DATABASE"]):
        os.remove(app.config["DATABASE"])

    with app.app_context():
        from db import init_db

        init_db()
        database = get_db()

        # --- 1. 利用者を作る（全員、電話帳の利用を許可済みにしておく） ---
        ids = {}
        for phone, name, icon in USERS:
            cursor = database.execute(
                "INSERT INTO users (phone, name, icon, contacts_permission) VALUES (?, ?, ?, 'allowed')",
                (phone, name, icon),
            )
            ids[name] = cursor.lastrowid

        # --- 2. 全員の電話帳に、自分以外の 3 人＋未登録の 1 人を入れる ---
        for owner_phone, owner_name, _ in USERS:
            for phone, name, _ in USERS:
                if phone != owner_phone:
                    database.execute(
                        "INSERT INTO contacts (owner_id, name, phone) VALUES (?, ?, ?)",
                        (ids[owner_name], name, phone),
                    )
            database.execute(
                "INSERT INTO contacts (owner_id, name, phone) VALUES (?, ?, ?)",
                (ids[owner_name], "まだ未登録のともだち", "09099999999"),
            )

        # --- 3. 各自に「大学のなかま」グループ（自分以外の全員）を作る ---
        group_ids = {}
        for owner_phone, owner_name, _ in USERS:
            cursor = database.execute(
                "INSERT INTO groups_ (owner_id, name) VALUES (?, '大学のなかま')", (ids[owner_name],)
            )
            group_ids[owner_name] = cursor.lastrowid
            for phone, name, _ in USERS:
                if phone != owner_phone:
                    database.execute(
                        "INSERT INTO group_members (group_id, name, phone) VALUES (?, ?, ?)",
                        (cursor.lastrowid, name, phone),
                    )

        # --- 4. 募集を作る ---
        def add_post(author, title, place, capacity, days):
            cursor = database.execute(
                """
                INSERT INTO posts (author_id, group_id, title, event_at, place, capacity, deadline)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (ids[author], group_ids[author], title, days_later(days, 19), place,
                 capacity, days_later(days, 12)),
            )
            return cursor.lastrowid

        add_post("たろう", "今週末カラオケ行ける人〜", "駅前のカラオケ", 3, 3)
        dinner = add_post("はなこ", "金曜の夜ごはん、軽く行かない？", "", 4, 2)
        cafe = add_post("さくら", "日曜の朝カフェ☕", "公園のそばのカフェ", 2, 4)

        # じろうが「金曜の夜ごはん」にそっと反応（まだ人数は揃っていない）
        database.execute("INSERT INTO reactions (post_id, user_id) VALUES (?, ?)", (dinner, ids["じろう"]))
        # たろうが「朝カフェ」に反応 → 2 人揃って開催確定！
        database.execute("INSERT INTO reactions (post_id, user_id) VALUES (?, ?)", (cafe, ids["たろう"]))
        database.commit()
        confirm_if_full(cafe)

    print("お試しデータを入れました！ python app.py で起動して、090-0000-0001 でログインしてみてください。")


if __name__ == "__main__":
    main()
