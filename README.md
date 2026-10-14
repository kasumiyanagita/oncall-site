# oncall-site

ターミナルアプリ [day-one](https://github.com/kasumiyanagita/day-one) と [oncall](https://github.com/kasumiyanagita/oncall) の紹介サイトです。
day-one で基礎を固め、oncall で障害対応に挑む、という学びの流れを紹介します。

## ファイル

| ファイル | 中身 |
|---|---|
| `index.html` | ページの文章と構成 |
| `style.css` | 見た目(ターミナル風。色の意味は day-one と同じ) |
| `main.js` | 文字を 1 文字ずつ出すアニメーション |
| `demo.js` | お試し版(day-one の grep と、oncall のインシデント 1)。JS で書いた小さなシェルで動く |

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

- **day-one**: `grep` のカード(説明 → 打ってみよう 3 つ → お題)。文章は day-one の `16_grep.toml` と同じです。
- **oncall**: インシデント 1「深夜の 500 祭り」。ログの作り方(ひっかけを含む)、ヒント、判定の指摘、模範解答は oncall の `m01_error_ips` と同じです。

本物は bash で動きますが、お試し版は `demo.js` の中の小さなシェルで動きます。
使えるのは `ls` `cd` `pwd` `cat` `head` `tail` `echo` `grep` `sort` `uniq` `wc` `cut` `awk`(`条件 {print ...}` の形だけ)と、`|`、`>`、`>>` です。
最後まで進むと「続きは、ダウンロードしてから」の案内が出て、インストール手順へつながります。
