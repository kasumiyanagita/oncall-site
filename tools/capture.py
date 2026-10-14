"""本物の day-one と oncall を動かして画面を取り込み、index.html の画面の例を差し替える。

    python3 -m venv .venv-tools && .venv-tools/bin/pip install pyte
    .venv-tools/bin/python tools/capture.py

index.html の中の <!-- capture:名前 --> 〜 <!-- /capture:名前 --> の間が、取り込んだ画面に置き換わる。
アプリの見た目を変えたあとに実行し直せば、サイトの画面の例も最新になる。

day-one と oncall は、このリポジトリと同じ階層(personal-projects/)にある前提。
進捗は一時ディレクトリに作るので、ふだんのセーブデータには触れない。
"""

from __future__ import annotations

import html
import json
import re
import sys
import tempfile
import unicodedata
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from term import App  # noqa: E402

SITE = Path(__file__).resolve().parent.parent
PROJECTS = SITE.parent
DAYONE = "dayone"
ONCALL = "oncall"


def command(app: str) -> list[str]:
    """アプリを起動するコマンド。プロンプトに実際のユーザー名が出ないよう、名前だけ you に差し替える。"""
    python = PROJECTS / ("day-one" if app == "dayone" else "oncall") / ".venv" / "bin" / "python"
    code = (
        f"import sys, {app}.sandbox as s; s.username = lambda: 'you'; "
        f"from {app}.cli import main; sys.argv = ['{app}']; sys.exit(main())"
    )
    return [str(python), "-c", code]
COLS, ROWS = 100, 30


# ---- 画面 → HTML ---------------------------------------------------------------

# 罫線の文字は、フォントの字形ではなく CSS の線で描く(マス目いっぱいに引くので、上下左右とすき間なくつながる)。
# 値は、そのマスで線を引く向き(u 上 / d 下 / l 左 / r 右)と太線(b)の印。rdr などは角丸(r)と、線の伸びる 2 方向
BOX = {
    "─": "l r", "━": "l r b", "═": "l r b",
    "│": "u d", "┃": "u d b", "║": "u d b",
    "╭": "rdr", "╮": "rdl", "╰": "rur", "╯": "rul",
    "┌": "d r", "┐": "d l", "└": "u r", "┘": "u l",
    "├": "u d r", "┤": "u d l", "┬": "l r d", "┴": "l r u", "┼": "u d l r",
}


def cell_width(ch: str) -> int:
    return 2 if unicodedata.east_asian_width(ch) in ("W", "F") else 1


def style_of(c) -> tuple:
    # DimScreen は dim を blink の印で覚えている
    return (c.fg, c.bg, c.bold, c.blink, c.italics, c.underscore, c.reverse)


def css_of(style: tuple) -> tuple[list[str], str]:
    fg, bg, bold, dim, italics, underscore, reverse = style
    classes = []
    inline = ""
    if reverse:
        fg, bg = (bg if bg != "default" else "bg"), (fg if fg != "default" else "fg")
    if bold and fg in ("black", "red", "green", "brown", "blue", "magenta", "cyan", "white"):
        # Windows Terminal の既定(intenseTextStyle: bright)と同じく、太字は明るい色で出す
        fg = "bright" + fg
    for kind, color in (("f", fg), ("b", bg)):
        if color == "default":
            continue
        if re.fullmatch(r"[0-9a-fA-F]{6}", color):
            inline += f"{'color' if kind == 'f' else 'background'}:#{color};"
        else:
            classes.append(f"{kind}-{color}")
    if bold:
        classes.append("bo")
    if dim:
        classes.append("dm")
    if italics:
        classes.append("it")
    if underscore:
        classes.append("un")
    return classes, inline


def render(app: App, theme: str, label: str, show_cursor: bool = True) -> str:
    screen = app.screen
    rows_html = []
    cur = screen.cursor
    for y in range(ROWS):
        line = screen.buffer[y]
        # 行末の、何も飾りのない空白は落とす
        last = -1
        for x in range(COLS):
            c = line[x]
            if c.data not in (" ", "") or c.bg != "default" or c.reverse or (show_cursor and y == cur.y and x == cur.x):
                last = x
        runs: list[tuple[tuple, str]] = []
        x = 0
        while x <= last:
            c = line[x]
            if c.data == "":
                x += 1
                continue
            ch = c.data
            w = cell_width(ch[0])
            if ch.isascii():
                piece = html.escape(ch)
            elif ch in BOX:
                sides = " ".join(f"bd-{s}" for s in BOX[ch].split())
                piece = f'<i class="bd {sides}">{html.escape(ch)}</i>'
            else:
                piece = f'<i class="w{w}">{html.escape(ch)}</i>'
            if show_cursor and not cur.hidden and y == cur.y and x == cur.x:
                piece = f'<b class="cur">{piece}</b>'
            st = style_of(c)
            if runs and runs[-1][0] == st:
                runs[-1] = (st, runs[-1][1] + piece)
            else:
                runs.append((st, piece))
            x += w
        out = []
        for st, text in runs:
            classes, inline = css_of(st)
            if classes or inline:
                attr = f' class="{" ".join(classes)}"' if classes else ""
                attr += f' style="{inline}"' if inline else ""
                out.append(f"<span{attr}>{text}</span>")
            else:
                out.append(text)
        rows_html.append("".join(out))
    body = "\n".join(rows_html)
    return (
        f'<div class="cap cap-{theme}" role="img" aria-label="{html.escape(label)}">'
        f'<pre class="cap-screen" style="--cols:{COLS};--rows:{ROWS}">{body}</pre></div>'
    )


# ---- 場面 -----------------------------------------------------------------------

def env_for(tmp: Path, retro: bool = False) -> dict[str, str]:
    env = {
        "TERM": "xterm-256color",
        "COLORTERM": "truecolor",
        "USER": "you",
        "LOGNAME": "you",
        "DAYONE_DATA_DIR": str(tmp / "dayone"),
        "ONCALL_DATA_DIR": str(tmp / "oncall"),
    }
    if retro:
        env["DAYONE_RETRO"] = "1"
        env["ONCALL_RETRO"] = "1"
    return env


def seed_dayone(tmp: Path) -> None:
    """トップページの例のために、pwd を覚えた・ls が復習どき、の状態にしておく。"""
    today = date.today()
    cards = {
        "pwd": {"learned": (today - timedelta(days=2)).isoformat(), "level": 1, "due": (today + timedelta(days=1)).isoformat(), "reviews": 1},
        "ls": {"learned": (today - timedelta(days=1)).isoformat(), "level": 0, "due": today.isoformat(), "reviews": 0},
    }
    d = tmp / "dayone"
    d.mkdir(parents=True, exist_ok=True)
    (d / "progress.json").write_text(json.dumps({"version": 1, "tutorial_seen": True, "cards": cards}, ensure_ascii=False))


def start(name: str, tmp: Path, retro: bool = False) -> App:
    app = App(command(name), COLS, ROWS, env_for(tmp, retro), cwd=str(tmp))
    app.pump(2.5)
    return app


def skip_oncall_tutorial(app: App) -> None:
    if "チュートリアル" in app.text():
        for _ in range(4):
            app.send("\r", 0.8)


def scene_dayone_top(tmp: Path, retro: bool = False) -> App:
    seed_dayone(tmp)
    return start(DAYONE, tmp, retro)


def scene_dayone_lesson(tmp: Path) -> App:
    seed_dayone(tmp)
    app = start(DAYONE, tmp)
    app.type("grep", 0.3)
    app.send("\r", 1.5)
    app.type("grep ERROR app.log", 0.3)
    app.send("\r", 1.5)
    return app


def scene_oncall_top(tmp: Path) -> App:
    app = start(ONCALL, tmp)
    skip_oncall_tutorial(app)
    return app


def scene_oncall_mission(tmp: Path, retro: bool = False) -> App:
    app = start(ONCALL, tmp, retro)
    skip_oncall_tutorial(app)
    app.send("\r", 2.5)
    app.type("awk '$9 == 500 {print $1}' access.log | sort | uniq -c | sort -rn | head -3", 0.3)
    app.send("\r", 2.0)
    return app


def scene_oncall_senpai(tmp: Path) -> App:
    app = start(ONCALL, tmp)
    skip_oncall_tutorial(app)
    app.type("senpai", 0.3)
    app.send("\r", 1.5)
    app.send("\r", 2.5)  # 見学 1 を始める
    for _ in range(12):
        if "6/7" in app.text():
            break
        app.send("\r", 2.0)
    return app


SCENES = {
    "dayone-top": (scene_dayone_top, "normal", "day-one のトップページ(コマンド一覧)"),
    "dayone-lesson": (scene_dayone_lesson, "normal", "day-one の練習中の画面(grep)"),
    "oncall-top": (scene_oncall_top, "normal", "oncall のトップページ(インシデント一覧)"),
    "oncall-mission": (scene_oncall_mission, "normal", "oncall のミッション中の画面"),
    "oncall-senpai": (scene_oncall_senpai, "normal", "oncall の見学の画面"),
    "retro-dayone": (lambda t: scene_dayone_top(t, retro=True), "retro", "day-one をレトロなデザインで動かした画面"),
    "retro-oncall": (lambda t: scene_oncall_mission(t, retro=True), "retro", "oncall をレトロなデザインで動かした画面"),
}


def main() -> None:
    only = set(sys.argv[1:])
    index = SITE / "index.html"
    page = index.read_text()
    for name, (scene, theme, label) in SCENES.items():
        if only and name not in only:
            continue
        marker = re.compile(rf"(<!-- capture:{name} -->).*?(<!-- /capture:{name} -->)", re.S)
        if not marker.search(page):
            print(f"skip {name}: index.html に印がありません")
            continue
        with tempfile.TemporaryDirectory() as d:
            app = scene(Path(d))
            try:
                fragment = render(app, theme, label)
                print(f"--- {name}\n{app.text()}\n")
            finally:
                app.close()
        page = marker.sub(lambda m: m.group(1) + fragment + m.group(2), page)
    index.write_text(page)


if __name__ == "__main__":
    main()
