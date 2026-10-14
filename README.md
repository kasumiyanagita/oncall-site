# oncall-site

ターミナルアプリ [day-one](https://github.com/kasumiyanagita/day-one) と [oncall](https://github.com/kasumiyanagita/oncall) の紹介サイトです。
day-one で基礎を固め、oncall で障害対応に挑む、という学びの流れを紹介します。

## ファイル

| ファイル | 中身 |
|---|---|
| `index.html` | ページの文章と構成 |
| `style.css` | 見た目(ターミナル風。色の意味は day-one と同じ) |
| `main.js` | 文字を 1 文字ずつ出すアニメーション |
| `tools/capture.py` | 本物の day-one と oncall を動かして画面を取り込み、`index.html` の画面の例を差し替える |
| `demo.js` | お試し版(day-one の pwd と、oncall のインシデント 1)。JS で書いた小さなシェルで動く |

ビルドは不要です。ローカルで見るときは、このディレクトリで次を実行して http://localhost:8000 を開きます。

```bash
python3 -m http.server 8000
```

## アニメーション

- 各 `section` の `.seq` の子要素を、上から順に処理します。`data-type` を付けた要素は 1 文字ずつ打たれ、`.fade` を付けた要素はふわっと表示されます。
- 画面に入った section から始まります。右下の `skip` か Esc で、すべてを一度に表示します。
- OS で「視差効果を減らす」が有効なときは、アニメーションせずに最初から全部表示します。

## お試し版

「./try.sh」の節で、ブラウザの中で 1 つずつ体験できます。

- **day-one**: 最初のコマンド `pwd` のカード(説明 → 打ってみよう → お題)。文章は day-one の `01_pwd.toml` と、指摘の文言は `lesson.py` と同じです。
- **oncall**: インシデント 1「深夜の 500 祭り」。ログの作り方(ひっかけを含む)、ヒントと減点、判定の指摘、点数とランク(`scoring.py`)、模範解答・解説・別解は oncall の `m01_error_ips` と同じです。

本物は bash で動きますが、お試し版は `demo.js` の中の小さなシェルで動きます。
使えるのは `ls` `cd` `pwd` `cat` `head` `tail` `echo` `grep` `sort` `uniq` `wc` `cut` `awk`(`条件 {print ...}` の形だけ)と、`|`、`>`、`>>` です。
最後まで進むと「続きは、下の GitHub リポジトリをそれぞれ clone してお試しください。」の案内が出て、clone の手順へつながります。

## 画面の例(本物から取り込む)

day-one と oncall の紹介、見学、レトロのデザインの画面の例は、手で描いたものではなく、
本物のアプリを 100 桁 × 30 行の端末で動かして取り込んだものです。アプリの見た目を変えたら、取り込み直します。

```bash
python3 -m venv .venv-tools
.venv-tools/bin/pip install pyte
.venv-tools/bin/python tools/capture.py              # すべて取り込み直す
.venv-tools/bin/python tools/capture.py oncall-top   # 1 つだけ
```

- day-one と oncall は、このリポジトリと同じ階層(`personal-projects/`)にあり、それぞれ `.venv` が作ってある前提です。
- 進捗は一時ディレクトリに作るので、ふだんのセーブデータには触れません。プロンプトのユーザー名は `you` にします。
- `index.html` の `<!-- capture:名前 -->` 〜 `<!-- /capture:名前 -->` の間が置き換わります。どの場面でどのキーを送るかは `tools/capture.py` の `SCENES` にあります。
- 色は、通常のデザインが Windows Terminal の既定の配色(Campbell)、レトロがアプリのプロファイルの配色です。
