# 盆栽ブランチ / bonsai branch

盆栽を育てる気分で、git に慣れる 20 問のパズル。

**▶ 遊ぶ: https://bonsai-branch.pages.dev/**

PR を取り込む、こじれたブランチを整える、間違いを巻き戻す——現場でよくある git のシーンを、コマンドを打たずに手で覚えます。コミットは盆栽の節、ブランチは枝。お題どおりの樹形に整えられたらクリアです。

## あそびかた

1. お題を読んで、合いそうな操作を選ぶ（merge / rebase / cherry-pick / squash / revert / reset）
2. 枝の先（HEAD）をつかんで、別の枝の先にドラッグ。つかまずに、選ぶ → 相手を選ぶ でも同じ（クリックでもキーボードでも）
3. 見本と同じ形になればクリア。実際に打つはずだった git コマンドが答えとして表示される

成立しない操作は理由つきで弾かれるので、なぜダメだったかがその場で分かります。20 問はステージ制で、進んだ分だけホームの盆栽に花が咲きます。

## 扱う操作

| 章 | 操作 |
|---|---|
| 取り込む | `merge` / `rebase` / `cherry-pick` / `squash` |
| 巻き戻す | `revert` / `reset` |

基本 6 問 → 応用 6 問 → 複合 8 問の順で、hotfix の二重取り込みや連鎖 rebase、merge と rebase の使い分けまで進みます。

## 開発

```sh
npm ci
npm run dev        # http://localhost:5173
npm test           # vitest (DAG ロジックとステージの可解性検証)
npm run typecheck
npm run build
```

React 19 + TypeScript + Vite。盤面は SVG、ドラッグは dnd-kit、アニメーションは framer-motion。git の DAG 操作は `src/lib/dag.ts` に依存なしで実装してあり、全ステージが BFS ソルバで解けることをテストが保証しています。

## デプロイ

`main` に push すると GitHub Actions が typecheck / test / build を通し、Cloudflare Pages に反映します。手作業のデプロイはありません。

## ライセンス

ライセンスは未設定です（All rights reserved）。利用したい場合は issue でどうぞ。
