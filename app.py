"""
app.py ― 「ゆる募」アプリの本体
=================================

キャッチコピー：「ゆるく貼って、そっと集まる。」

誘う人も、誘われる人も、「断る／断られる」ストレスを感じない仲間集めアプリです。
このファイルには、Web アプリを動かすための「ルート（URL ごとの処理）」が書かれています。

【使っている道具】
  - Flask（フラスク） … Python で Web アプリを作るための人気ライブラリ
  - SQLite             … データを保存するデータベース（db.py を参照）
  - Jinja2（ジンジャ） … HTML のひな形（templates フォルダ）に値を埋め込む仕組み

【動かし方】
  1. pip install -r requirements.txt
  2. python seed_demo.py   ← お試し用のデータを入れる（任意）
  3. python app.py
  4. ブラウザで http://127.0.0.1:5000 を開く

【いちばん大事なルール：匿名設計】
  開催が確定するまで、「誰が投稿したか」「誰が反応したか」の名前は
  ★画面に出さないだけでなく、そもそも HTML（テンプレート）に渡しません★。
  データベースから取り出すときも「人数」だけを数えて渡すようにしています。
  こうしておけば、ページのソースを覗かれても名前が漏れることはありません。
"""

import os
import secrets  # 推測されにくいランダムな文字列（認証コードや合言葉）を作る標準ライブラリ
from datetime import datetime, timedelta
from functools import wraps  # デコレーター（関数に機能を付け足す仕組み）を作るときに使う
from urllib.parse import quote  # URL に日本語を入れるときの変換に使う

from flask import (
    Flask,
    abort,
    flash,
    g,
    redirect,
    render_template,
    request,
    send_from_directory,
    session,
    url_for,
)

import db  # 自分で作った db.py を読み込みます
from db import get_db, is_valid_phone, normalize_phone

# ---------------------------------------------------------------------------
# 定数（アプリ全体で使う決まった値）
# ---------------------------------------------------------------------------
# 日時は「2026-10-10T19:00」の形で保存します。
# この形の文字列は、そのまま大小比較すると時間の前後と一致するので便利です。
DATETIME_FORMAT = "%Y-%m-%dT%H:%M"

# アイコンとして選べる絵文字（本物のアプリでは画像をアップロードする形にします）
ICON_CHOICES = ["🙂", "😺", "🐶", "🐻", "🐼", "🦊", "🐸", "🐧", "🌻", "🍙", "☕", "🎸"]

# 開催人数として選べる範囲（投稿者本人を含む）
MIN_CAPACITY = 2
MAX_CAPACITY = 20

# 付箋の色（デザインガイドのカラーパレットより）と、少し傾ける角度
STICKY_COLORS = ["#FFE9A8", "#F8C9B4", "#CFE3C4"]  # 黄・コーラル・セージグリーン
STICKY_ROTATIONS = [-2, 1.5, -1, 0.8, -1.5, 1.2]   # 単位は度（deg）


# ---------------------------------------------------------------------------
# アプリの準備
# ---------------------------------------------------------------------------
def create_app(test_config=None):
    """
    Flask アプリを作って返す関数（「アプリケーションファクトリ」と呼ばれる書き方）。

    test_config を渡すと、テストのときだけ設定を変えられます
    （例：本番とは別のデータベースファイルを使う）。
    """
    app = Flask(__name__)

    # --- 基本設定 ---
    app.config.update(
        # SECRET_KEY はログイン状態（セッション）を守るための合言葉です。
        # 本番では必ず環境変数で、他人に推測されない長い文字列を設定してください。
        SECRET_KEY=os.environ.get("YURUBO_SECRET_KEY", "dev-secret-change-me"),
        # データベースファイルの場所（このファイルと同じフォルダに yurubo.db を作ります）
        DATABASE=os.environ.get(
            "YURUBO_DATABASE",
            os.path.join(os.path.dirname(os.path.abspath(__file__)), "yurubo.db"),
        ),
        # 開発モードでは、SMS の代わりに認証コードを画面に表示します
        # （本物の SMS を送るには Twilio や Firebase などの外部サービスが必要なため）
        SHOW_SMS_CODE=os.environ.get("YURUBO_SHOW_SMS_CODE", "1") == "1",
    )
    if test_config:
        app.config.update(test_config)

    # データベースの準備（テーブルが無ければ作る）
    db.init_app(app)

    # ルート（URL ごとの処理）やテンプレート用の便利機能を登録
    register_template_helpers(app)
    register_routes(app)
    return app


# ---------------------------------------------------------------------------
# テンプレート（HTML）で使う便利機能
# ---------------------------------------------------------------------------
def register_template_helpers(app):
    """HTML の中から呼び出せる関数や変換（フィルター）を登録します。"""

    @app.template_filter("pretty_datetime")
    def pretty_datetime(value):
        """'2026-10-10T19:00' → '10/10(土) 19:00' のように読みやすく変換するフィルター。"""
        try:
            dt = datetime.strptime(value, DATETIME_FORMAT)
        except (TypeError, ValueError):
            return value  # 変換できないときは、そのまま返す
        weekdays = "月火水木金土日"  # dt.weekday() は 月曜=0 〜 日曜=6
        return f"{dt.month}/{dt.day}({weekdays[dt.weekday()]}) {dt:%H:%M}"

    @app.template_filter("pretty_time")
    def pretty_time(value):
        """データベースの '2026-10-07 21:05:33' → '10/7 21:05' に変換するフィルター。"""
        try:
            dt = datetime.strptime(value, "%Y-%m-%d %H:%M:%S")
        except (TypeError, ValueError):
            return value
        return f"{dt.month}/{dt.day} {dt:%H:%M}"

    # csrf_token() は macros.html（マクロ）の中からも呼びたいので、
    # 「どのテンプレートからでも使える関数（グローバル）」として登録します
    app.jinja_env.globals["csrf_token"] = get_csrf_token

    @app.context_processor
    def inject_globals():
        """
        すべてのテンプレートで使える値を渡します。
        ここで返した辞書のキーが、HTML の中で変数として使えるようになります。
        """
        return {
            "current_user": g.get("user"),
            "sticky_style": sticky_style,
            "unread_count": count_unread_notifications(),
        }


def sticky_style(number, color=True):
    """
    付箋カードの色と傾きを決める関数。
    番号（募集の id など）から決めるので、ページを開き直しても同じ見た目になります。
    color=False のときは傾きだけ決めます（白い付箋 .paper に使う）。
    """
    rotation = STICKY_ROTATIONS[number % len(STICKY_ROTATIONS)]
    style = f"transform:rotate({rotation}deg);"
    if color:
        style += f" background:{STICKY_COLORS[number % len(STICKY_COLORS)]};"
    return style


def count_unread_notifications():
    """ログイン中の人の、未読のお知らせの数を返します（ナビの赤い丸に使う）。"""
    user = g.get("user")
    if user is None:
        return 0
    row = get_db().execute(
        "SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND is_read = 0",
        (user["id"],),
    ).fetchone()
    return row["n"]


# ---------------------------------------------------------------------------
# セキュリティ：CSRF（なりすまし送信）対策
# ---------------------------------------------------------------------------
# 悪いサイトが、こっそり「ゆる募」にフォームを送りつける攻撃を防ぐため、
# フォームには毎回「合言葉（トークン）」を入れて、送られてきた合言葉が正しいか確認します。
def get_csrf_token():
    """セッションに合言葉が無ければ作って、それを返します。"""
    if "csrf_token" not in session:
        session["csrf_token"] = secrets.token_hex(16)
    return session["csrf_token"]


# ---------------------------------------------------------------------------
# ログインが必要なページ用の「デコレーター」
# ---------------------------------------------------------------------------
def login_required(view):
    """
    関数の上に @login_required と書くと、ログインしていない人を
    ログイン画面へ移動させるようになります。
    """

    @wraps(view)
    def wrapped_view(*args, **kwargs):
        if g.user is None:
            return redirect(url_for("login"))
        return view(*args, **kwargs)

    return wrapped_view


# ---------------------------------------------------------------------------
# 時間・募集に関する処理（アプリの「ルール」の部分）
# ---------------------------------------------------------------------------
def now_str():
    """今の日時を '2026-10-07T21:05' の形の文字列で返します。"""
    return datetime.now().strftime(DATETIME_FORMAT)


def close_expired_posts():
    """
    【自動クローズ機能】
    締切を過ぎても人数が揃わなかった募集を「静かに終了（closed）」にします。

    ★ ポイント：誰にも通知を送りません。
      「人が集まらなかった」と知らされると気まずいので、そっと掲示板から外すだけにします。
    """
    database = get_db()
    database.execute(
        "UPDATE posts SET status = 'closed' WHERE status = 'open' AND deadline <= ?",
        (now_str(),),
    )
    database.commit()


def count_reactions(post_id):
    """「参加する」を押した人の人数を返します（名前は返しません）。"""
    row = get_db().execute(
        "SELECT COUNT(*) AS n FROM reactions WHERE post_id = ?", (post_id,)
    ).fetchone()
    return row["n"]


def get_participant_ids(post):
    """
    開催メンバー（投稿者＋「参加する」を押した人）の user_id の一覧を返します。
    グループトークに入れる人＝この一覧の人だけです。
    """
    rows = get_db().execute(
        "SELECT user_id FROM reactions WHERE post_id = ?", (post["id"],)
    ).fetchall()
    return [post["author_id"]] + [row["user_id"] for row in rows]


def can_view_post(post, user):
    """
    その人が、この募集を見てもよいかを判定します。
      - 投稿者本人なら OK
      - 公開範囲のグループに、その人の電話番号が入っていれば OK
    """
    if post["author_id"] == user["id"]:
        return True
    if post["group_id"] is None:
        return False  # グループが削除された募集は、投稿者以外には見えません
    row = get_db().execute(
        "SELECT 1 FROM group_members WHERE group_id = ? AND phone = ?",
        (post["group_id"], user["phone"]),
    ).fetchone()
    return row is not None


def confirm_if_full(post_id):
    """
    【開催確定の判定】
    「投稿者 1 人 ＋ 反応した人数」が開催人数に達したら、すぐに開催確定にします。

    確定したら：
      1. 募集の状態を confirmed にする
      2. グループトークに最初のメッセージを入れる（＝自動チャット化）
      3. 参加メンバー全員に「開催確定」のお知らせを送る
         ★ 通知はこの「開催確定」のときだけ。途中経過（反応が増えた等）では送りません。
    """
    database = get_db()
    post = database.execute("SELECT * FROM posts WHERE id = ?", (post_id,)).fetchone()
    if post is None or post["status"] != "open":
        return False

    if 1 + count_reactions(post_id) < post["capacity"]:
        return False  # まだ人数が足りない

    # 1. 状態を「開催確定」に
    database.execute("UPDATE posts SET status = 'confirmed' WHERE id = ?", (post_id,))

    # 2. グループトークの最初のメッセージ（user_id を NULL にして「アプリからのお知らせ」扱い）
    database.execute(
        "INSERT INTO messages (post_id, user_id, body, kind) VALUES (?, NULL, ?, 'system')",
        (post_id, f"「{post['title']}」の開催が決まりました！ここで気軽に相談しましょう。"),
    )

    # 3. 参加メンバー全員にお知らせ
    for user_id in get_participant_ids(post):
        database.execute(
            "INSERT INTO notifications (user_id, post_id, body) VALUES (?, ?, ?)",
            (user_id, post_id, f"「{post['title']}」の開催が確定しました🎉"),
        )
    database.commit()
    return True


def load_post_or_404(post_id):
    """募集を 1 件取り出します。見る権限が無い・存在しない場合は 404（見つかりません）にします。"""
    post = get_db().execute("SELECT * FROM posts WHERE id = ?", (post_id,)).fetchone()
    if post is None or not can_view_post(post, g.user):
        abort(404)
    # 静かに終了した募集は、投稿者以外には「最初から無かった」ように見せます
    if post["status"] == "closed" and post["author_id"] != g.user["id"]:
        abort(404)
    return post


def load_own_group_or_404(group_id):
    """自分が作ったグループを 1 件取り出します。他人のグループなら 404 にします。"""
    group = get_db().execute(
        "SELECT * FROM groups_ WHERE id = ? AND owner_id = ?", (group_id, g.user["id"])
    ).fetchone()
    if group is None:
        abort(404)
    return group


def parse_member_form(form):
    """
    グループ作成・編集フォームから、メンバー（名前と電話番号）の一覧を作ります。

    メンバーの選び方は 2 通り：
      1. 電話帳の連絡先からチェックボックスで選ぶ（contact_ids）
      2. 電話番号を手で入力する（manual_name / manual_phone）
         ← 電話帳へのアクセスを許可しなかった人のための代わりの方法

    戻り値：(メンバーの辞書 {電話番号: 名前}, エラーメッセージのリスト)
    """
    members = {}
    errors = []

    # 1. 電話帳から選んだ人
    contact_ids = form.getlist("contact_ids")  # チェックされた全部の値をリストで受け取る
    if contact_ids:
        placeholders = ",".join("?" for _ in contact_ids)  # 個数ぶん「?,?,?」を作る
        rows = get_db().execute(
            f"SELECT name, phone FROM contacts WHERE owner_id = ? AND id IN ({placeholders})",
            (g.user["id"], *contact_ids),
        ).fetchall()
        for row in rows:
            members[row["phone"]] = row["name"]

    # 2. 手入力した人
    manual_phone = normalize_phone(form.get("manual_phone", ""))
    manual_name = form.get("manual_name", "").strip()
    if manual_phone or manual_name:
        if not is_valid_phone(manual_phone):
            errors.append("手入力の電話番号が正しくありません（例：090-1234-5678）")
        elif manual_phone == g.user["phone"]:
            errors.append("自分の電話番号はメンバーに入れなくて大丈夫です")
        else:
            members[manual_phone] = manual_name or manual_phone

    return members, errors


def invite_sms_link(phone):
    """
    まだアプリを使っていない人へ、招待の SMS を送るためのリンクを作ります。
    スマホでこのリンクを押すと、SMS アプリが本文入りで開きます。
    """
    body = "「ゆる募」で気軽に予定を合わせよう！ゆるく貼って、そっと集まる。"
    return f"sms:{phone}?body={quote(body)}"


def delete_account(user_id):
    """
    【アカウント削除】（ストア審査で必須の機能）
    利用者と、その人に関係するデータをまとめて消します。

    テーブル作成時に「ON DELETE CASCADE」を付けたので、users から消すだけで
    電話帳・グループ・募集・反応・お知らせも自動で一緒に消えます。
    グループトークの発言は「退会したメンバー」として残し、名前だけ消えます（ON DELETE SET NULL）。
    """
    database = get_db()
    user = database.execute("SELECT phone FROM users WHERE id = ?", (user_id,)).fetchone()
    if user is None:
        return
    # 他の人のグループに入っている自分の電話番号も消します（個人情報を残さないため）
    database.execute("DELETE FROM group_members WHERE phone = ?", (user["phone"],))
    database.execute("DELETE FROM users WHERE id = ?", (user_id,))
    database.commit()


# ---------------------------------------------------------------------------
# ルート（URL ごとの処理）
# ---------------------------------------------------------------------------
def register_routes(app):
    """アプリのすべての画面（URL）をここで登録します。"""

    # ===== すべてのリクエストの前に実行される処理 =====
    @app.before_request
    def load_logged_in_user():
        """セッションに保存された user_id から、ログイン中の人の情報を読み込みます。"""
        user_id = session.get("user_id")
        g.user = None
        if user_id is not None:
            g.user = get_db().execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()

    @app.before_request
    def check_csrf():
        """POST（フォーム送信）のときは、合言葉（CSRF トークン）が正しいか確認します。"""
        if request.method == "POST":
            sent = request.form.get("csrf_token", "")
            # compare_digest は、時間差で中身を推測されにくい安全な比べ方です
            if not secrets.compare_digest(sent, session.get("csrf_token", "")):
                abort(400)

    # ===== ログイン（電話番号 ＋ SMS 認証） =====
    @app.route("/login", methods=["GET", "POST"])
    def login():
        """ステップ 1：電話番号を入力してもらい、認証コードを「SMS で送る」。"""
        if request.method == "POST":
            phone = normalize_phone(request.form.get("phone", ""))
            if not is_valid_phone(phone):
                flash("電話番号が正しくないみたいです（例：090-1234-5678）")
                return render_template("login.html", phone=request.form.get("phone", ""))

            # 6 桁の認証コードを作る（secrets を使うと推測されにくい）
            code = f"{secrets.randbelow(1_000_000):06d}"
            session["pending_phone"] = phone
            session["sms_code"] = code
            session["sms_code_expires"] = (datetime.now() + timedelta(minutes=10)).timestamp()

            # 本物のアプリでは、ここで SMS 送信サービスを呼び出します。
            # 今回は練習用なので、ターミナル（コンソール）に表示するだけにしています。
            print(f"[SMS 送信のかわり] {phone} への認証コード: {code}")
            if app.config["SHOW_SMS_CODE"]:
                flash(f"（開発モード）認証コードは {code} です")
            return redirect(url_for("verify"))
        return render_template("login.html", phone="")

    @app.route("/verify", methods=["GET", "POST"])
    def verify():
        """ステップ 2：届いた認証コードを入力してもらう。"""
        phone = session.get("pending_phone")
        if phone is None:
            return redirect(url_for("login"))

        if request.method == "POST":
            code = request.form.get("code", "").strip()
            expired = datetime.now().timestamp() > session.get("sms_code_expires", 0)
            if expired or not secrets.compare_digest(code, session.get("sms_code", "")):
                flash("コードが違うか、有効期限が切れています")
                return render_template("verify.html", phone=phone)

            # 認証できたので、使い終わったコードは消しておきます
            session.pop("sms_code", None)
            session.pop("sms_code_expires", None)
            session.pop("pending_phone", None)

            user = get_db().execute("SELECT * FROM users WHERE phone = ?", (phone,)).fetchone()
            if user is None:
                # はじめての人 → 「この電話番号は本人確認ずみ」と印を付けて、プロフィール登録へ
                session["verified_phone"] = phone
                return redirect(url_for("signup"))
            session["user_id"] = user["id"]
            return redirect(url_for("home"))
        return render_template("verify.html", phone=phone)

    @app.route("/signup", methods=["GET", "POST"])
    def signup():
        """ステップ 3（初回だけ）：表示名とアイコンを決めてもらう。"""
        phone = session.get("verified_phone")
        if phone is None:
            # 電話番号の認証（SMS のコード入力）が終わっていない人は、ここに来られません
            return redirect(url_for("login"))

        if request.method == "POST":
            name = request.form.get("name", "").strip()
            icon = request.form.get("icon", ICON_CHOICES[0])
            agreed = request.form.get("agree") == "on"
            if not name or len(name) > 20:
                flash("表示名は 1〜20 文字で入力してください")
            elif icon not in ICON_CHOICES:
                flash("アイコンを選んでください")
            elif not agreed:
                flash("利用規約とプライバシーポリシーへの同意が必要です")
            else:
                database = get_db()
                cursor = database.execute(
                    "INSERT INTO users (phone, name, icon) VALUES (?, ?, ?)", (phone, name, icon)
                )
                database.commit()
                session.pop("verified_phone", None)
                session["user_id"] = cursor.lastrowid  # 今作った利用者の id
                flash("ようこそ「ゆる募」へ！")
                return redirect(url_for("home"))
        return render_template("signup.html", icons=ICON_CHOICES)

    @app.route("/logout", methods=["POST"])
    def logout():
        """ログアウト：セッションの中身を全部消します。"""
        session.clear()
        return redirect(url_for("login"))

    # ===== 画面 1：ホーム =====
    @app.route("/")
    @login_required
    def home():
        """
        ホーム画面。コルクボードに付箋が貼られているイメージです。
          - あなた宛のゆる募（他の人の募集。投稿者名は出さない）
          - あなたの募集
          - 参加する予定（開催確定したもの）
        """
        close_expired_posts()
        database = get_db()
        me = g.user

        # ★ 匿名設計：SELECT する列に author_id や名前を「入れていない」ことに注目！
        #   人数は COUNT で数えた数字だけを渡します。
        incoming = database.execute(
            """
            SELECT p.id, p.title, p.event_at, p.place, p.capacity, p.deadline,
                   (SELECT COUNT(*) FROM reactions r WHERE r.post_id = p.id) AS interested,
                   EXISTS (SELECT 1 FROM reactions r
                           WHERE r.post_id = p.id AND r.user_id = :me) AS reacted
            FROM posts p
            JOIN group_members gm ON gm.group_id = p.group_id
            WHERE gm.phone = :phone
              AND p.author_id != :me
              AND p.status = 'open'
            ORDER BY p.event_at
            """,
            {"me": me["id"], "phone": me["phone"]},
        ).fetchall()

        my_posts = database.execute(
            """
            SELECT p.id, p.title, p.event_at, p.place, p.capacity,
                   (SELECT COUNT(*) FROM reactions r WHERE r.post_id = p.id) AS interested
            FROM posts p
            WHERE p.author_id = ? AND p.status = 'open'
            ORDER BY p.event_at
            """,
            (me["id"],),
        ).fetchall()

        # 開催確定した予定（自分が投稿者 or 参加を押した人）
        confirmed = database.execute(
            """
            SELECT p.id, p.title, p.event_at, p.place
            FROM posts p
            WHERE p.status = 'confirmed'
              AND (p.author_id = :me
                   OR EXISTS (SELECT 1 FROM reactions r
                              WHERE r.post_id = p.id AND r.user_id = :me))
            ORDER BY p.event_at
            """,
            {"me": me["id"]},
        ).fetchall()

        return render_template(
            "home.html", incoming=incoming, my_posts=my_posts, confirmed=confirmed
        )

    # ===== 画面 2：誘いをつくる（募集作成） =====
    @app.route("/posts/new", methods=["GET", "POST"])
    @login_required
    def new_post():
        database = get_db()
        groups = database.execute(
            "SELECT id, name FROM groups_ WHERE owner_id = ? ORDER BY id", (g.user["id"],)
        ).fetchall()

        if request.method == "POST":
            form = request.form
            title = form.get("title", "").strip()
            event_at = form.get("event_at", "")
            place = form.get("place", "").strip()
            group_id = form.get("group_id", type=int)  # type=int で数字に変換して受け取る
            capacity = form.get("capacity", type=int)
            deadline = form.get("deadline", "") or event_at  # 締切が空なら開催日時を締切にする

            # --- 入力チェック（バリデーション） ---
            errors = []
            if not title or len(title) > 40:
                errors.append("タイトルは 1〜40 文字で入力してください")
            if not is_datetime(event_at) or event_at <= now_str():
                errors.append("開催日時は、これから先の日時を選んでください")
            if not is_datetime(deadline) or deadline <= now_str():
                errors.append("締切は、これから先の日時を選んでください")
            elif is_datetime(event_at) and deadline > event_at:
                errors.append("締切は開催日時より前にしてください")
            if len(place) > 40:
                errors.append("場所は 40 文字以内で入力してください")
            if group_id not in [group["id"] for group in groups]:
                errors.append("見せる相手のグループを選んでください")
            if capacity is None or not (MIN_CAPACITY <= capacity <= MAX_CAPACITY):
                errors.append(f"開催人数は {MIN_CAPACITY}〜{MAX_CAPACITY} 人で選んでください")

            if errors:
                for message in errors:
                    flash(message)
            else:
                cursor = database.execute(
                    """
                    INSERT INTO posts (author_id, group_id, title, event_at, place, capacity, deadline)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (g.user["id"], group_id, title, event_at, place, capacity, deadline),
                )
                database.commit()
                flash("コルクボードにそっと貼りました📌")
                return redirect(url_for("post_detail", post_id=cursor.lastrowid))

        return render_template(
            "post_new.html",
            groups=groups,
            capacities=range(MIN_CAPACITY, MAX_CAPACITY + 1),
            form=request.form,
            min_datetime=now_str(),
        )

    # ===== 画面 3：募集の詳細 =====
    @app.route("/posts/<int:post_id>")
    @login_required
    def post_detail(post_id):
        """
        募集の詳細画面。
          - 投稿者本人：集まり具合（◯/◯人）だけが見える。反応した人の名前は見えない。
          - それ以外の人：「気になってる人：◯人」と「参加する」ボタン。投稿者の名前は見えない。
        """
        close_expired_posts()
        post = load_post_or_404(post_id)
        is_author = post["author_id"] == g.user["id"]

        # 開催確定済みで、自分がメンバーなら、そのままグループトークへ
        if post["status"] == "confirmed":
            if g.user["id"] in get_participant_ids(post):
                return redirect(url_for("chat", post_id=post_id))
            abort(404)  # 反応していない人には、確定後の募集は見せません

        reacted = (
            get_db()
            .execute(
                "SELECT 1 FROM reactions WHERE post_id = ? AND user_id = ?",
                (post_id, g.user["id"]),
            )
            .fetchone()
            is not None
        )

        # ★ テンプレートに渡すのは「人数」と「自分が反応したか」だけ。author_id も名前も渡しません。
        view = {
            "id": post["id"],
            "title": post["title"],
            "event_at": post["event_at"],
            "place": post["place"],
            "capacity": post["capacity"],
            "deadline": post["deadline"],
            "status": post["status"],
            "interested": count_reactions(post_id),
        }
        return render_template("post_detail.html", post=view, is_author=is_author, reacted=reacted)

    @app.route("/posts/<int:post_id>/react", methods=["POST"])
    @login_required
    def react(post_id):
        """【そっと反応】「参加する」ボタンが押されたときの処理。"""
        post = load_post_or_404(post_id)
        if post["author_id"] == g.user["id"] or post["status"] != "open":
            abort(400)  # 自分の募集・締め切った募集には反応できません

        database = get_db()
        # INSERT OR IGNORE：すでに押していたら何もしない（2 回押しても 1 回分）
        database.execute(
            "INSERT OR IGNORE INTO reactions (post_id, user_id) VALUES (?, ?)",
            (post_id, g.user["id"]),
        )
        database.commit()

        if confirm_if_full(post_id):
            flash("人数が揃って、開催が決まりました🎉")
            return redirect(url_for("chat", post_id=post_id))
        flash("そっと手を挙げました。人数が揃ったらお知らせします")
        return redirect(url_for("post_detail", post_id=post_id))

    @app.route("/posts/<int:post_id>/unreact", methods=["POST"])
    @login_required
    def unreact(post_id):
        """「やっぱりやめる」：開催確定の前なら、反応をそっと取り消せます（誰にも通知しません）。"""
        post = load_post_or_404(post_id)
        if post["status"] != "open":
            abort(400)
        database = get_db()
        database.execute(
            "DELETE FROM reactions WHERE post_id = ? AND user_id = ?", (post_id, g.user["id"])
        )
        database.commit()
        flash("反応を取り消しました")
        return redirect(url_for("post_detail", post_id=post_id))

    @app.route("/posts/<int:post_id>/withdraw", methods=["POST"])
    @login_required
    def withdraw(post_id):
        """投稿者が募集を取り下げる。締切切れと同じく、誰にも通知せず静かに終了します。"""
        post = load_post_or_404(post_id)
        if post["author_id"] != g.user["id"] or post["status"] != "open":
            abort(400)
        database = get_db()
        database.execute("UPDATE posts SET status = 'closed' WHERE id = ?", (post_id,))
        database.commit()
        flash("募集をそっと取り下げました")
        return redirect(url_for("home"))

    # ===== 画面 4：開催決定後のグループトーク =====
    @app.route("/posts/<int:post_id>/chat", methods=["GET", "POST"])
    @login_required
    def chat(post_id):
        """
        グループトーク。開催が確定して初めて、メンバーの名前とアイコンが見えます。
        入れるのは「投稿者＋参加を押した人」だけです。
        """
        post = load_post_or_404(post_id)
        participant_ids = get_participant_ids(post)
        if post["status"] != "confirmed" or g.user["id"] not in participant_ids:
            abort(404)

        database = get_db()
        if request.method == "POST":
            body = request.form.get("body", "").strip()
            # kind は「normal（ふつう）」か「absence（不参加連絡）」のどちらかだけ受け付けます
            kind = "absence" if request.form.get("kind") == "absence" else "normal"
            if not body:
                flash("メッセージを入力してください")
            elif len(body) > 500:
                flash("メッセージは 500 文字以内でお願いします")
            else:
                # 【開催決定後の不参加連絡】kind='absence' で保存。
                # このトークはメンバーにしか見えないので、反応していない人には一切伝わりません。
                database.execute(
                    "INSERT INTO messages (post_id, user_id, body, kind) VALUES (?, ?, ?, ?)",
                    (post_id, g.user["id"], body, kind),
                )
                database.commit()
            return redirect(url_for("chat", post_id=post_id))

        # ここで初めて、メンバーの名前・アイコンを取り出します
        placeholders = ",".join("?" for _ in participant_ids)
        members = database.execute(
            f"SELECT id, name, icon FROM users WHERE id IN ({placeholders})", participant_ids
        ).fetchall()
        messages = database.execute(
            """
            SELECT m.body, m.kind, m.created_at, m.user_id, u.name, u.icon
            FROM messages m
            LEFT JOIN users u ON u.id = m.user_id
            WHERE m.post_id = ?
            ORDER BY m.id
            """,
            (post_id,),
        ).fetchall()
        return render_template("chat.html", post=post, members=members, messages=messages)

    # ===== 画面 5：見せる相手グループの一覧 =====
    @app.route("/groups")
    @login_required
    def groups():
        rows = get_db().execute(
            """
            SELECT g.id, g.name, COUNT(gm.phone) AS member_count
            FROM groups_ g
            LEFT JOIN group_members gm ON gm.group_id = g.id
            WHERE g.owner_id = ?
            GROUP BY g.id
            ORDER BY g.id
            """,
            (g.user["id"],),
        ).fetchall()
        return render_template("groups.html", groups=rows)

    # ===== 画面 6：新しいグループを作る =====
    @app.route("/groups/new", methods=["GET", "POST"])
    @login_required
    def new_group():
        # 電話帳へのアクセスについて、まだ聞いていなければ説明画面へ
        if g.user["contacts_permission"] == "unknown":
            return redirect(url_for("contacts_permission", next=url_for("new_group")))

        contacts = load_contacts()
        if request.method == "POST":
            name = request.form.get("name", "").strip()
            members, errors = parse_member_form(request.form)
            if not name or len(name) > 20:
                errors.append("グループ名は 1〜20 文字で入力してください")
            if not members:
                errors.append("メンバーを 1 人以上選んでください")
            if errors:
                for message in errors:
                    flash(message)
            else:
                database = get_db()
                cursor = database.execute(
                    "INSERT INTO groups_ (owner_id, name) VALUES (?, ?)", (g.user["id"], name)
                )
                add_members(cursor.lastrowid, members)
                database.commit()
                flash(f"グループ「{name}」を作りました")
                return redirect(url_for("edit_group", group_id=cursor.lastrowid))
        return render_template("group_form.html", group=None, contacts=contacts, members=[])

    @app.route("/groups/<int:group_id>", methods=["GET", "POST"])
    @login_required
    def edit_group(group_id):
        """グループの名前変更・メンバー追加／削除（電話帳アプリのような操作感）。"""
        group = load_own_group_or_404(group_id)
        database = get_db()

        if request.method == "POST":
            action = request.form.get("action")
            if action == "rename":
                name = request.form.get("name", "").strip()
                if not name or len(name) > 20:
                    flash("グループ名は 1〜20 文字で入力してください")
                else:
                    database.execute("UPDATE groups_ SET name = ? WHERE id = ?", (name, group_id))
                    database.commit()
                    flash("グループ名を変更しました")
            elif action == "add":
                members, errors = parse_member_form(request.form)
                for message in errors:
                    flash(message)
                if members:
                    add_members(group_id, members)
                    database.commit()
                    flash(f"{len(members)} 人を追加しました")
            elif action == "remove":
                database.execute(
                    "DELETE FROM group_members WHERE group_id = ? AND phone = ?",
                    (group_id, request.form.get("phone", "")),
                )
                database.commit()
                flash("メンバーを外しました")
            return redirect(url_for("edit_group", group_id=group_id))

        # メンバー一覧。アプリに登録済みかどうか（users にいるか）も一緒に調べます。
        members = database.execute(
            """
            SELECT gm.name, gm.phone, (u.id IS NOT NULL) AS registered
            FROM group_members gm
            LEFT JOIN users u ON u.phone = gm.phone
            WHERE gm.group_id = ?
            ORDER BY gm.name
            """,
            (group_id,),
        ).fetchall()
        return render_template(
            "group_form.html",
            group=group,
            contacts=load_contacts(),
            members=members,
            invite_sms_link=invite_sms_link,
        )

    @app.route("/groups/<int:group_id>/delete", methods=["POST"])
    @login_required
    def delete_group(group_id):
        group = load_own_group_or_404(group_id)
        database = get_db()
        database.execute("DELETE FROM groups_ WHERE id = ?", (group_id,))
        database.commit()
        flash(f"グループ「{group['name']}」を削除しました")
        return redirect(url_for("groups"))

    def load_contacts():
        """ログイン中の人の電話帳を取り出します（アクセスを許可していなければ空）。"""
        if g.user["contacts_permission"] != "allowed":
            return []
        return get_db().execute(
            """
            SELECT c.id, c.name, c.phone, (u.id IS NOT NULL) AS registered
            FROM contacts c
            LEFT JOIN users u ON u.phone = c.phone
            WHERE c.owner_id = ?
            ORDER BY c.name
            """,
            (g.user["id"],),
        ).fetchall()

    def add_members(group_id, members):
        """グループにメンバーを追加します（すでにいる人は名前だけ更新）。"""
        database = get_db()
        for phone, name in members.items():
            database.execute(
                """
                INSERT INTO group_members (group_id, name, phone) VALUES (?, ?, ?)
                ON CONFLICT (group_id, phone) DO UPDATE SET name = excluded.name
                """,
                (group_id, name, phone),
            )

    # ===== 電話帳（連絡先） =====
    @app.route("/contacts/permission", methods=["GET", "POST"])
    @login_required
    def contacts_permission():
        """
        電話帳へのアクセスを許可してもらう前の「説明画面」。
        いきなり許可を求めず、何のために使うのかを先に説明します（要件定義書より）。
        """
        next_url = request.values.get("next") or url_for("contacts")
        if not next_url.startswith("/"):
            next_url = url_for("contacts")  # 外部サイトへ飛ばされないように、アプリ内の URL だけ許可

        if request.method == "POST":
            choice = "allowed" if request.form.get("choice") == "allow" else "denied"
            database = get_db()
            database.execute(
                "UPDATE users SET contacts_permission = ? WHERE id = ?", (choice, g.user["id"])
            )
            database.commit()
            if choice == "denied":
                flash("電話帳は使わずに、電話番号の手入力でメンバーを追加できます")
            return redirect(next_url)
        return render_template("contacts_permission.html", next_url=next_url)

    @app.route("/contacts", methods=["GET", "POST"])
    @login_required
    def contacts():
        """
        電話帳の画面。
        Web アプリではスマホ本体の連絡先を読めないので、ここに登録した人を「電話帳」として使います。
        """
        if g.user["contacts_permission"] == "unknown":
            return redirect(url_for("contacts_permission"))

        database = get_db()
        if request.method == "POST" and g.user["contacts_permission"] == "allowed":
            action = request.form.get("action")
            if action == "add":
                name = request.form.get("name", "").strip()
                phone = normalize_phone(request.form.get("phone", ""))
                if not name or len(name) > 20:
                    flash("名前は 1〜20 文字で入力してください")
                elif not is_valid_phone(phone):
                    flash("電話番号が正しくないみたいです（例：090-1234-5678）")
                else:
                    database.execute(
                        """
                        INSERT INTO contacts (owner_id, name, phone) VALUES (?, ?, ?)
                        ON CONFLICT (owner_id, phone) DO UPDATE SET name = excluded.name
                        """,
                        (g.user["id"], name, phone),
                    )
                    database.commit()
                    flash(f"{name} さんを電話帳に追加しました")
            elif action == "delete":
                database.execute(
                    "DELETE FROM contacts WHERE id = ? AND owner_id = ?",
                    (request.form.get("contact_id", type=int), g.user["id"]),
                )
                database.commit()
                flash("電話帳から削除しました")
            return redirect(url_for("contacts"))

        return render_template(
            "contacts.html", contacts=load_contacts(), invite_sms_link=invite_sms_link
        )

    # ===== お知らせ =====
    @app.route("/notifications")
    @login_required
    def notifications():
        """お知らせ一覧（開催確定のお知らせだけが届きます）。開いたら既読にします。"""
        database = get_db()
        rows = database.execute(
            """
            SELECT n.body, n.created_at, n.is_read, n.post_id
            FROM notifications n
            WHERE n.user_id = ?
            ORDER BY n.id DESC
            """,
            (g.user["id"],),
        ).fetchall()
        database.execute("UPDATE notifications SET is_read = 1 WHERE user_id = ?", (g.user["id"],))
        database.commit()
        return render_template("notifications.html", notifications=rows)

    # ===== 設定（プロフィール・アカウント削除） =====
    @app.route("/settings", methods=["GET", "POST"])
    @login_required
    def settings():
        if request.method == "POST":
            name = request.form.get("name", "").strip()
            icon = request.form.get("icon", "")
            if not name or len(name) > 20:
                flash("表示名は 1〜20 文字で入力してください")
            elif icon not in ICON_CHOICES:
                flash("アイコンを選んでください")
            else:
                database = get_db()
                database.execute(
                    "UPDATE users SET name = ?, icon = ? WHERE id = ?", (name, icon, g.user["id"])
                )
                database.commit()
                flash("プロフィールを更新しました")
            return redirect(url_for("settings"))
        return render_template("settings.html", icons=ICON_CHOICES)

    @app.route("/account/delete", methods=["POST"])
    @login_required
    def account_delete():
        """アカウント削除。確認のため「さくじょ」と入力してもらいます。"""
        if request.form.get("confirm") != "さくじょ":
            flash("削除するには「さくじょ」と入力してください")
            return redirect(url_for("settings"))
        delete_account(g.user["id"])
        session.clear()
        flash("アカウントとデータを削除しました。ご利用ありがとうございました")
        return redirect(url_for("login"))

    # ===== 利用規約・プライバシーポリシー =====
    @app.route("/terms")
    def terms():
        """docs フォルダにある利用規約・プライバシーポリシーをそのまま表示します。"""
        docs_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "docs")
        return send_from_directory(docs_dir, "terms-and-privacy.html")

    # ===== エラー画面 =====
    @app.errorhandler(404)
    def not_found(error):
        return render_template("error.html", message="ページが見つかりませんでした"), 404

    @app.errorhandler(400)
    def bad_request(error):
        return render_template("error.html", message="うまく処理できませんでした"), 400


def is_datetime(value):
    """文字列が '2026-10-10T19:00' の形の日時になっているかを調べます。"""
    try:
        datetime.strptime(value, DATETIME_FORMAT)
        return True
    except (TypeError, ValueError):
        return False


# ---------------------------------------------------------------------------
# このファイルを直接実行したとき（python app.py）だけ、ここが動きます
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    application = create_app()
    # debug=True にすると、コードを保存したときに自動で再起動してくれます（開発中だけ使う）
    # host="0.0.0.0" にすると、同じ Wi-Fi のスマホからも http://<PCのIP>:5000 で開けます
    application.run(debug=True, host="0.0.0.0", port=5000)
