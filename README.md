# oncall-site

ターミナルアプリ [day-one](https://github.com/kasumiyanagita/day-one) と [oncall](https://github.com/kasumiyanagita/oncall) の紹介サイトです。
day-one で基礎を固め、oncall で障害対応に挑む、という学びの流れを紹介します。

## ファイル

| ファイル | 中身 |
|---|---|
| `index.html` | ページの文章と構成 |
| `style.css` | 見た目(ターミナル風。色の意味は day-one と同じ) |
| `main.js` | 文字を 1 文字ずつ出すアニメーション |

ビルドは不要です。ローカルで見るときは、このディレクトリで次を実行して http://localhost:8000 を開きます。

```bash
python3 -m http.server 8000
```

## アニメーション

- 各 `section` の `.seq` の子要素を、上から順に処理します。`data-type` を付けた要素は 1 文字ずつ打たれ、`.fade` を付けた要素はふわっと表示されます。
- 画面に入った section から始まります。右下の `skip` か Esc で、すべてを一度に表示します。
- OS で「視差効果を減らす」が有効なときは、アニメーションせずに最初から全部表示します。
