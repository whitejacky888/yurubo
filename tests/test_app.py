"""
tests/test_app.py ― アプリが仕様どおりに動くかを確かめる「自動テスト」
=======================================================================

実行方法：  python -m pytest
（pytest が、test_ で始まる関数を自動で見つけて実行してくれます）

特に大事な「匿名設計」が守られているか（名前が HTML に出ていないか）を確認しています。
"""

import os
import sys

import pytest

# 1 つ上のフォルダ（app.py がある場所）を import できるようにします
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app  # noqa: E402
from db import get_db  # noqa: E402


@pytest.fixture
def app(tmp_path):
    """テストごとに、まっさらなデータベースを使うアプリを用意します。"""
    app = create_app({"TESTING": True, "DATABASE": str(tmp_path / "test.db")})
    return app


def login(client, phone, name=None):
    """ログイン（電話番号 → 認証コード → 初回ならプロフィール登録）をまとめて行います。"""
    with client.session_transaction() as sess:
        sess["csrf_token"] = "test-token"
    client.post("/login", data={"phone": phone, "csrf_token": "test-token"})
    with client.session_transaction() as sess:
        code = sess["sms_code"]
    client.post("/verify", data={"code": code, "csrf_token": "test-token"})
    if name:
        client.post(
            "/signup",
            data={"name": name, "icon": "🙂", "agree": "on", "csrf_token": "test-token"},
        )


def post(client, url, **data):
    """CSRF トークン付きで POST するための近道。"""
    data["csrf_token"] = "test-token"
    return client.post(url, data=data, follow_redirects=True)


@pytest.fixture
def setup(app):
    """
    3 人（あいこ・ぶんた・ちえ）を登録し、あいこが 2 人を入れたグループを作って、
    「開催人数 3 人」の募集を 1 つ貼った状態を用意します。
    """
    clients = {}
    for phone, name in [("09011110001", "あいこ"), ("09011110002", "ぶんた"), ("09011110003", "ちえ")]:
        c = app.test_client()
        login(c, phone, name)
        clients[name] = c

    aiko = clients["あいこ"]
    post(aiko, "/contacts/permission", choice="allow", next="/contacts")
    post(aiko, "/groups/new", name="ともだち", manual_name="ぶんた", manual_phone="090-1111-0002")
    with app.app_context():
        group_id = get_db().execute("SELECT id FROM groups_").fetchone()["id"]
    post(aiko, f"/groups/{group_id}", action="add", manual_name="ちえ", manual_phone="09011110003")
    post(
        aiko, "/posts/new",
        title="カラオケ行ける人〜", event_at="2099-01-01T19:00", place="駅前",
        group_id=str(group_id), capacity="3", deadline="",
    )
    with app.app_context():
        post_id = get_db().execute("SELECT id FROM posts").fetchone()["id"]
    return clients, post_id


def test_login_requires_sms_code(app):
    """認証コードを入れないと、プロフィール登録には進めないこと。"""
    c = app.test_client()
    with c.session_transaction() as sess:
        sess["csrf_token"] = "test-token"
    c.post("/login", data={"phone": "09012345678", "csrf_token": "test-token"})
    response = c.get("/signup")
    assert response.status_code == 302  # ログイン画面へ戻される


def test_post_is_anonymous_before_confirmation(setup):
    """開催確定前は、投稿者の名前が他の人のページ（HTML）に一切出ないこと。"""
    clients, post_id = setup
    bunta = clients["ぶんた"]
    home = bunta.get("/").get_data(as_text=True)
    assert "カラオケ行ける人〜" in home
    assert "あいこ" not in home
    detail = bunta.get(f"/posts/{post_id}").get_data(as_text=True)
    assert "あいこ" not in detail
    assert "気になってる人：0人" in detail


def test_author_sees_only_count(setup):
    """投稿者には、反応した人の名前ではなく人数だけが見えること。"""
    clients, post_id = setup
    post(clients["ぶんた"], f"/posts/{post_id}/react")
    page = clients["あいこ"].get(f"/posts/{post_id}").get_data(as_text=True)
    assert "2 / 3人" in page
    assert "ぶんた" not in page


def test_confirm_creates_chat_and_notifications(app, setup):
    """人数が揃ったら開催確定 → トークができて、名前が見え、お知らせが届くこと。"""
    clients, post_id = setup
    post(clients["ぶんた"], f"/posts/{post_id}/react")
    page = post(clients["ちえ"], f"/posts/{post_id}/react").get_data(as_text=True)
    assert "開催が決まりました" in page
    assert "あいこ" in page and "ぶんた" in page  # 確定後は名前が見える

    with app.app_context():
        count = get_db().execute("SELECT COUNT(*) AS n FROM notifications").fetchone()["n"]
    assert count == 3  # 3 人全員に「開催確定」のお知らせ


def test_no_notification_before_confirmation(app, setup):
    """途中経過（反応が増えた）では、お知らせを送らないこと。"""
    clients, post_id = setup
    post(clients["ぶんた"], f"/posts/{post_id}/react")
    with app.app_context():
        count = get_db().execute("SELECT COUNT(*) AS n FROM notifications").fetchone()["n"]
    assert count == 0


def test_expired_post_closes_quietly(app, setup):
    """締切を過ぎた募集は、通知なしで静かに消えること。"""
    clients, post_id = setup
    with app.app_context():
        database = get_db()
        database.execute("UPDATE posts SET deadline = '2000-01-01T00:00' WHERE id = ?", (post_id,))
        database.commit()
    home = clients["ぶんた"].get("/").get_data(as_text=True)
    assert "カラオケ行ける人〜" not in home
    assert clients["ぶんた"].get(f"/posts/{post_id}").status_code == 404
    with app.app_context():
        database = get_db()
        assert database.execute("SELECT status FROM posts").fetchone()["status"] == "closed"
        assert database.execute("SELECT COUNT(*) AS n FROM notifications").fetchone()["n"] == 0


def test_absence_message_only_for_members(app, setup):
    """不参加連絡はトークのメンバーにだけ見え、反応していない人はトークに入れないこと。"""
    clients, post_id = setup
    # 開催人数を 2 人に下げて、ぶんただけで確定させる
    with app.app_context():
        database = get_db()
        database.execute("UPDATE posts SET capacity = 2 WHERE id = ?", (post_id,))
        database.commit()
    post(clients["ぶんた"], f"/posts/{post_id}/react")
    page = post(clients["ぶんた"], f"/posts/{post_id}/chat", body="ごめん行けなくなった", kind="absence")
    assert "不参加連絡" in page.get_data(as_text=True)
    assert clients["ちえ"].get(f"/posts/{post_id}/chat").status_code == 404


def test_outsider_cannot_see_post(app, setup):
    """グループに入っていない人には、募集が見えないこと。"""
    _, post_id = setup
    outsider = app.test_client()
    login(outsider, "09088887777", "そとの人")
    assert outsider.get(f"/posts/{post_id}").status_code == 404


def test_account_delete_removes_data(app, setup):
    """アカウント削除で、本人のデータが消えること。"""
    clients, _ = setup
    post(clients["あいこ"], "/account/delete", confirm="さくじょ")
    with app.app_context():
        database = get_db()
        assert database.execute("SELECT COUNT(*) AS n FROM users WHERE name = 'あいこ'").fetchone()["n"] == 0
        assert database.execute("SELECT COUNT(*) AS n FROM posts").fetchone()["n"] == 0
        assert database.execute("SELECT COUNT(*) AS n FROM groups_").fetchone()["n"] == 0


def test_post_without_csrf_is_rejected(setup):
    """合言葉（CSRF トークン）が無い POST は拒否されること。"""
    clients, post_id = setup
    response = clients["ぶんた"].post(f"/posts/{post_id}/react", data={})
    assert response.status_code == 400
