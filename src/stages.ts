import type { BonsaiState, Stage } from './types';

const COL_MAIN = '#9a6a3a';
const COL_DEV = '#5e8c4a';
const COL_FEAT = '#c89a3e';
const COL_FIX = '#c44a3a';
const COL_FEAT2 = '#7c5fa3';

function commit(
  id: string,
  parents: string[],
  branch: string,
  message: string,
): [string, BonsaiState['commits'][string]] {
  return [id, { id, parents, branch, message }];
}

function buildState(
  branchOrder: string[],
  branches: Record<
    string,
    { name: string; head: string; color: string }
  >,
  commits: Array<[string, BonsaiState['commits'][string]]>,
): BonsaiState {
  const cs: Record<string, BonsaiState['commits'][string]> = {};
  for (const [k, v] of commits) cs[k] = v;
  const bs: Record<string, BonsaiState['branches'][string]> = {};
  for (const id of branchOrder) {
    const b = branches[id]!;
    bs[id] = { id, name: b.name, head: b.head, color: b.color };
  }
  return { branchOrder, branches: bs, commits: cs };
}

const s01: Stage = {
  id: 's-01',
  chapter: 'PR を取り込む',
  title: 'feature をレビュー OK したので develop に取り込んで',
  description:
    'チームリード：「feature の PR、approve したから develop にマージしといて」',
  lesson:
    'develop に明示的なマージコミットが残ることで「ここで feature を取り込んだ」という履歴が後から追えます。一番基本の取り込みパターンです。',
  hint: 'feature 先端を develop 先端に重ねる（merge）',
  initial: buildState(
    ['develop', 'feature'],
    {
      develop: { name: 'develop', head: 'd2', color: COL_DEV },
      feature: { name: 'feature', head: 'f2', color: COL_FEAT },
    },
    [
      commit('d1', [], 'develop', '初期化'),
      commit('d2', ['d1'], 'develop', 'CI 整備'),
      commit('f1', ['d1'], 'feature', 'ログインフォーム追加'),
      commit('f2', ['f1'], 'feature', 'テスト追加'),
    ],
  ),
  goal: buildState(
    ['develop', 'feature'],
    {
      develop: { name: 'develop', head: 'M', color: COL_DEV },
      feature: { name: 'feature', head: 'f2', color: COL_FEAT },
    },
    [
      commit('d1', [], 'develop', '初期化'),
      commit('d2', ['d1'], 'develop', 'CI 整備'),
      commit('f1', ['d1'], 'feature', 'ログインフォーム追加'),
      commit('f2', ['f1'], 'feature', 'テスト追加'),
      commit('M', ['d2', 'f2'], 'develop', 'feature をマージ'),
    ],
  ),
};

const s02: Stage = {
  id: 's-02',
  chapter: 'PR を取り込む',
  title: '2 本の PR を順番に取り込む',
  description:
    '上司：「feat/cart と fix/header、どっちも approve 済みだから 2 本まとめて develop に取り込んで」',
  lesson:
    '独立した PR の取り込み順は結果に影響しません。マージコミットが 2 つできて develop の歴史が枝分かれを保ったまま統合されます。',
  hint: '緑の節を develop に → もう一本も develop に。順序は問いません。',
  initial: buildState(
    ['develop', 'feat/cart', 'fix/header'],
    {
      develop: { name: 'develop', head: 'd1', color: COL_DEV },
      'feat/cart': { name: 'feat/cart', head: 'fc2', color: COL_FEAT },
      'fix/header': { name: 'fix/header', head: 'fh1', color: COL_FIX },
    },
    [
      commit('d1', [], 'develop', '基盤'),
      commit('fc1', ['d1'], 'feat/cart', 'カート画面'),
      commit('fc2', ['fc1'], 'feat/cart', 'カートテスト'),
      commit('fh1', ['d1'], 'fix/header', 'ヘッダー高さ修正'),
    ],
  ),
  goal: buildState(
    ['develop', 'feat/cart', 'fix/header'],
    {
      develop: { name: 'develop', head: 'M2', color: COL_DEV },
      'feat/cart': { name: 'feat/cart', head: 'fc2', color: COL_FEAT },
      'fix/header': { name: 'fix/header', head: 'fh1', color: COL_FIX },
    },
    [
      commit('d1', [], 'develop', '基盤'),
      commit('fc1', ['d1'], 'feat/cart', 'カート画面'),
      commit('fc2', ['fc1'], 'feat/cart', 'カートテスト'),
      commit('fh1', ['d1'], 'fix/header', 'ヘッダー高さ修正'),
      commit('M1', ['d1', 'fc2'], 'develop', 'feat/cart をマージ'),
      commit('M2', ['M1', 'fh1'], 'develop', 'fix/header をマージ'),
    ],
  ),
};

const s03: Stage = {
  id: 's-03',
  chapter: 'PR を取り込む',
  title: '進んだ develop に PR をマージ',
  description:
    'リード：「feature 作ってる間に develop だいぶ進んだけど、そのまま feature を取り込んじゃって大丈夫」',
  lesson:
    '分岐元から develop が進んでいても merge は問題なくできます。マージコミットが develop 最新と feature 先端の両方を親に持ち、ここで合流したことが履歴で分かります。',
  hint: 'feature 先端を、進んだ develop 先端に merge',
  initial: buildState(
    ['develop', 'feature'],
    {
      develop: { name: 'develop', head: 'd4', color: COL_DEV },
      feature: { name: 'feature', head: 'f2', color: COL_FEAT },
    },
    [
      commit('d1', [], 'develop', '初期化'),
      commit('d2', ['d1'], 'develop', '機能フラグ'),
      commit('d3', ['d2'], 'develop', '設定更新'),
      commit('d4', ['d3'], 'develop', 'lint 修正'),
      commit('f1', ['d2'], 'feature', 'ページ追加'),
      commit('f2', ['f1'], 'feature', 'スタイル整備'),
    ],
  ),
  goal: buildState(
    ['develop', 'feature'],
    {
      develop: { name: 'develop', head: 'M', color: COL_DEV },
      feature: { name: 'feature', head: 'f2', color: COL_FEAT },
    },
    [
      commit('d1', [], 'develop', '初期化'),
      commit('d2', ['d1'], 'develop', '機能フラグ'),
      commit('d3', ['d2'], 'develop', '設定更新'),
      commit('d4', ['d3'], 'develop', 'lint 修正'),
      commit('f1', ['d2'], 'feature', 'ページ追加'),
      commit('f2', ['f1'], 'feature', 'スタイル整備'),
      commit('M', ['d4', 'f2'], 'develop', 'feature をマージ'),
    ],
  ),
};

const s04: Stage = {
  id: 's-04',
  chapter: 'コンフリクトを解消',
  title: 'コンフリクトを解消するため rebase',
  description:
    'レビュアー：「develop 進んだせいでコンフリクトしてるよ。先に最新 develop で rebase しといて」',
  lesson:
    'rebase は自分のコミットを別の親の上に「移植」する操作。履歴が一直線になり、merge より前にコンフリクトをまとめて解消できます。',
  hint: 'feature の先端を develop の先端に rebase（モードを rebase に切替）',
  initial: buildState(
    ['develop', 'feature'],
    {
      develop: { name: 'develop', head: 'd3', color: COL_DEV },
      feature: { name: 'feature', head: 'f2', color: COL_FEAT },
    },
    [
      commit('d1', [], 'develop', '初期化'),
      commit('d2', ['d1'], 'develop', '設定追加'),
      commit('d3', ['d2'], 'develop', 'バグ修正'),
      commit('f1', ['d1'], 'feature', '作業中'),
      commit('f2', ['f1'], 'feature', '機能完成'),
    ],
  ),
  goal: buildState(
    ['develop', 'feature'],
    {
      develop: { name: 'develop', head: 'd3', color: COL_DEV },
      feature: { name: 'feature', head: 'r2', color: COL_FEAT },
    },
    [
      commit('d1', [], 'develop', '初期化'),
      commit('d2', ['d1'], 'develop', '設定追加'),
      commit('d3', ['d2'], 'develop', 'バグ修正'),
      commit('r1', ['d3'], 'feature', '作業中'),
      commit('r2', ['r1'], 'feature', '機能完成'),
    ],
  ),
};

const s05: Stage = {
  id: 's-05',
  chapter: 'コンフリクトを解消',
  title: 'rebase してから merge で履歴を整える',
  description:
    '上司：「履歴は一直線にしたいから、まず develop に rebase してから merge してくれ」',
  lesson:
    'rebase で履歴を整えてから merge する「整形 merge」のフロー。マージコミットは残しつつ枝分かれを最小化し、レビューと履歴の両立を狙います。',
  hint: '①feature を develop に rebase → ②feature を develop に merge',
  initial: buildState(
    ['develop', 'feature'],
    {
      develop: { name: 'develop', head: 'd3', color: COL_DEV },
      feature: { name: 'feature', head: 'f2', color: COL_FEAT },
    },
    [
      commit('d1', [], 'develop', '初期化'),
      commit('d2', ['d1'], 'develop', '一手目'),
      commit('d3', ['d2'], 'develop', '二手目'),
      commit('f1', ['d1'], 'feature', '別案を試す'),
      commit('f2', ['f1'], 'feature', '別案を仕上げる'),
    ],
  ),
  goal: buildState(
    ['develop', 'feature'],
    {
      develop: { name: 'develop', head: 'M', color: COL_DEV },
      feature: { name: 'feature', head: 'r2', color: COL_FEAT },
    },
    [
      commit('d1', [], 'develop', '初期化'),
      commit('d2', ['d1'], 'develop', '一手目'),
      commit('d3', ['d2'], 'develop', '二手目'),
      commit('r1', ['d3'], 'feature', '別案を試す'),
      commit('r2', ['r1'], 'feature', '別案を仕上げる'),
      commit('M', ['d3', 'r2'], 'develop', 'feature をマージ'),
    ],
  ),
};

const s06: Stage = {
  id: 's-06',
  chapter: 'リリースと hotfix',
  title: 'hotfix を main → develop に取り込む',
  description:
    'マネージャー：「本番落ちた、hotfix できたら main にマージしてリリース。同じ修正を develop にも取り込んでね」',
  lesson:
    '緊急修正は main にマージしてリリース、同じコミットを develop にも取り込んで両系統を揃えます。1 つの hotfix コミットを 2 箇所の親として共有させるのが定石。',
  hint: 'hotfix 先端を main に merge → さらに hotfix 先端を develop にも merge',
  initial: buildState(
    ['main', 'develop', 'hotfix'],
    {
      main: { name: 'main', head: 'm1', color: COL_MAIN },
      develop: { name: 'develop', head: 'd2', color: COL_DEV },
      hotfix: { name: 'hotfix', head: 'h1', color: COL_FIX },
    },
    [
      commit('m1', [], 'main', 'v1 リリース'),
      commit('d1', ['m1'], 'develop', '次の作業'),
      commit('d2', ['d1'], 'develop', '次の作業 II'),
      commit('h1', ['m1'], 'hotfix', 'クラッシュ修正'),
    ],
  ),
  goal: buildState(
    ['main', 'develop', 'hotfix'],
    {
      main: { name: 'main', head: 'M1', color: COL_MAIN },
      develop: { name: 'develop', head: 'M2', color: COL_DEV },
      hotfix: { name: 'hotfix', head: 'h1', color: COL_FIX },
    },
    [
      commit('m1', [], 'main', 'v1 リリース'),
      commit('d1', ['m1'], 'develop', '次の作業'),
      commit('d2', ['d1'], 'develop', '次の作業 II'),
      commit('h1', ['m1'], 'hotfix', 'クラッシュ修正'),
      commit('M1', ['m1', 'h1'], 'main', 'hotfix をマージ'),
      commit('M2', ['d2', 'h1'], 'develop', 'hotfix をマージ'),
    ],
  ),
};

const s07: Stage = {
  id: 's-07',
  chapter: 'コンフリクトを解消',
  title: '長期 PR を develop の最新に追従',
  description:
    'シニア：「長く開発続けてる feature、develop だいぶ進んでるから最新に rebase して追従させて」',
  lesson:
    '長く独立して進んだブランチを最新 develop に追従させる定石。rebase でコミットを develop 先端に積み直すことで、PR をレビュー可能な状態に保てます。',
  hint: 'feature を develop に rebase（履歴を一直線に）',
  initial: buildState(
    ['develop', 'feature'],
    {
      develop: { name: 'develop', head: 'd4', color: COL_DEV },
      feature: { name: 'feature', head: 'f3', color: COL_FEAT },
    },
    [
      commit('d1', [], 'develop', '一手目'),
      commit('d2', ['d1'], 'develop', '二手目'),
      commit('d3', ['d2'], 'develop', '三手目'),
      commit('d4', ['d3'], 'develop', '四手目'),
      commit('f1', ['d1'], 'feature', '長期作業 1'),
      commit('f2', ['f1'], 'feature', '長期作業 2'),
      commit('f3', ['f2'], 'feature', '長期作業 3'),
    ],
  ),
  goal: buildState(
    ['develop', 'feature'],
    {
      develop: { name: 'develop', head: 'd4', color: COL_DEV },
      feature: { name: 'feature', head: 'r3', color: COL_FEAT },
    },
    [
      commit('d1', [], 'develop', '一手目'),
      commit('d2', ['d1'], 'develop', '二手目'),
      commit('d3', ['d2'], 'develop', '三手目'),
      commit('d4', ['d3'], 'develop', '四手目'),
      commit('r1', ['d4'], 'feature', '長期作業 1'),
      commit('r2', ['r1'], 'feature', '長期作業 2'),
      commit('r3', ['r2'], 'feature', '長期作業 3'),
    ],
  ),
};

const s08: Stage = {
  id: 's-08',
  chapter: 'コンフリクトを解消',
  title: '依存先 PR の最新先端に rebase',
  description:
    'フロントリード：「feat/api 先に進めてるから、依存してる feat/ui を feat/api 先端に rebase しといて」',
  lesson:
    '依存先のブランチが進んだら、自分のブランチの根元を依存先の先端に付け替える。rebase の引数を feat/api にすると土台ごと差し替えられます。',
  hint: 'feat/ui の先端を feat/api の先端に rebase',
  initial: buildState(
    ['develop', 'feat/api', 'feat/ui'],
    {
      develop: { name: 'develop', head: 'd1', color: COL_DEV },
      'feat/api': { name: 'feat/api', head: 'a2', color: COL_FEAT },
      'feat/ui': { name: 'feat/ui', head: 'u2', color: COL_FEAT2 },
    },
    [
      commit('d1', [], 'develop', '基盤'),
      commit('a1', ['d1'], 'feat/api', 'API 設計'),
      commit('a2', ['a1'], 'feat/api', 'API 実装'),
      commit('u1', ['d1'], 'feat/ui', 'UI 下書き'),
      commit('u2', ['u1'], 'feat/ui', 'UI 骨組み'),
    ],
  ),
  goal: buildState(
    ['develop', 'feat/api', 'feat/ui'],
    {
      develop: { name: 'develop', head: 'd1', color: COL_DEV },
      'feat/api': { name: 'feat/api', head: 'a2', color: COL_FEAT },
      'feat/ui': { name: 'feat/ui', head: 'r2', color: COL_FEAT2 },
    },
    [
      commit('d1', [], 'develop', '基盤'),
      commit('a1', ['d1'], 'feat/api', 'API 設計'),
      commit('a2', ['a1'], 'feat/api', 'API 実装'),
      commit('r1', ['a2'], 'feat/ui', 'UI 下書き'),
      commit('r2', ['r1'], 'feat/ui', 'UI 骨組み'),
    ],
  ),
};

const s09: Stage = {
  id: 's-09',
  chapter: 'PR を取り込む',
  title: '3 つの PR を一気に取り込む',
  description:
    'PM：「スプリント終わるから、approve 済みの 3 つの PR ぜんぶ develop に取り込んで」',
  lesson:
    '複数 PR を 1 本ずつマージしていく基本動作。マージコミットが連鎖して、どの PR がどの順で取り込まれたかが履歴で追えます。',
  hint: '3 本の feature 枝を順に develop へ merge',
  initial: buildState(
    ['develop', 'feat/a', 'feat/b', 'feat/c'],
    {
      develop: { name: 'develop', head: 'd1', color: COL_DEV },
      'feat/a': { name: 'feat/a', head: 'a1', color: COL_FEAT },
      'feat/b': { name: 'feat/b', head: 'b1', color: COL_FIX },
      'feat/c': { name: 'feat/c', head: 'c1', color: COL_FEAT2 },
    },
    [
      commit('d1', [], 'develop', '基盤'),
      commit('a1', ['d1'], 'feat/a', '機能 A'),
      commit('b1', ['d1'], 'feat/b', '機能 B'),
      commit('c1', ['d1'], 'feat/c', '機能 C'),
    ],
  ),
  goal: buildState(
    ['develop', 'feat/a', 'feat/b', 'feat/c'],
    {
      develop: { name: 'develop', head: 'M3', color: COL_DEV },
      'feat/a': { name: 'feat/a', head: 'a1', color: COL_FEAT },
      'feat/b': { name: 'feat/b', head: 'b1', color: COL_FIX },
      'feat/c': { name: 'feat/c', head: 'c1', color: COL_FEAT2 },
    },
    [
      commit('d1', [], 'develop', '基盤'),
      commit('a1', ['d1'], 'feat/a', '機能 A'),
      commit('b1', ['d1'], 'feat/b', '機能 B'),
      commit('c1', ['d1'], 'feat/c', '機能 C'),
      commit('M1', ['d1', 'a1'], 'develop', 'feat/a をマージ'),
      commit('M2', ['M1', 'b1'], 'develop', 'feat/b をマージ'),
      commit('M3', ['M2', 'c1'], 'develop', 'feat/c をマージ'),
    ],
  ),
};

const s10: Stage = {
  id: 's-10',
  chapter: 'コンフリクトを解消',
  title: '依存ブランチを連鎖的に最新化',
  description:
    'リード：「develop 進んだから、まず feat/api を develop に rebase。その後 feat/ui も新しい feat/api に rebase して」',
  lesson:
    '下位ブランチを更新してから、その上のブランチを移植する 2 段 rebase。順序を逆にすると依存先が古いままになるので、土台から順に最新化するのが鉄則です。',
  hint:
    '①feat/api を develop に rebase → ②feat/ui を新しい feat/api 先端に rebase',
  initial: buildState(
    ['develop', 'feat/api', 'feat/ui'],
    {
      develop: { name: 'develop', head: 'd3', color: COL_DEV },
      'feat/api': { name: 'feat/api', head: 'a2', color: COL_FEAT },
      'feat/ui': { name: 'feat/ui', head: 'u1', color: COL_FEAT2 },
    },
    [
      commit('d1', [], 'develop', '一手目'),
      commit('d2', ['d1'], 'develop', '二手目'),
      commit('d3', ['d2'], 'develop', '三手目'),
      commit('a1', ['d1'], 'feat/api', 'API v1'),
      commit('a2', ['a1'], 'feat/api', 'API v2'),
      commit('u1', ['d2'], 'feat/ui', 'UI v1'),
    ],
  ),
  goal: buildState(
    ['develop', 'feat/api', 'feat/ui'],
    {
      develop: { name: 'develop', head: 'd3', color: COL_DEV },
      'feat/api': { name: 'feat/api', head: 'ra2', color: COL_FEAT },
      'feat/ui': { name: 'feat/ui', head: 'ru1', color: COL_FEAT2 },
    },
    [
      commit('d1', [], 'develop', '一手目'),
      commit('d2', ['d1'], 'develop', '二手目'),
      commit('d3', ['d2'], 'develop', '三手目'),
      commit('ra1', ['d3'], 'feat/api', 'API v1'),
      commit('ra2', ['ra1'], 'feat/api', 'API v2'),
      commit('ru1', ['ra2'], 'feat/ui', 'UI v1'),
    ],
  ),
};

const s11: Stage = {
  id: 's-11',
  chapter: '使い分けの実践',
  title: 'feature は merge、fix は rebase で使い分け',
  description:
    '上司：「長く進んだ feature は履歴残して merge、軽い fix は rebase で一直線にして」',
  lesson:
    '大きな機能は merge で文脈を残し、小さな修正は rebase で一直線に。状況に応じた使い分けが実務での本質で、プロジェクト規約に合わせて選ぶのが大事です。',
  hint:
    '①feature を develop に merge（履歴を残す） → ②fix を merge した develop の先端に rebase',
  initial: buildState(
    ['develop', 'feature', 'fix/typo'],
    {
      develop: { name: 'develop', head: 'd2', color: COL_DEV },
      feature: { name: 'feature', head: 'f2', color: COL_FEAT },
      'fix/typo': { name: 'fix/typo', head: 'x1', color: COL_FIX },
    },
    [
      commit('d1', [], 'develop', '初期化'),
      commit('d2', ['d1'], 'develop', '設定'),
      commit('f1', ['d2'], 'feature', '大きな作業 1'),
      commit('f2', ['f1'], 'feature', '大きな作業 2'),
      commit('x1', ['d2'], 'fix/typo', 'タイポ修正'),
    ],
  ),
  goal: buildState(
    ['develop', 'feature', 'fix/typo'],
    {
      develop: { name: 'develop', head: 'M', color: COL_DEV },
      feature: { name: 'feature', head: 'f2', color: COL_FEAT },
      'fix/typo': { name: 'fix/typo', head: 'rx1', color: COL_FIX },
    },
    [
      commit('d1', [], 'develop', '初期化'),
      commit('d2', ['d1'], 'develop', '設定'),
      commit('f1', ['d2'], 'feature', '大きな作業 1'),
      commit('f2', ['f1'], 'feature', '大きな作業 2'),
      commit('M', ['d2', 'f2'], 'develop', 'feature をマージ'),
      commit('rx1', ['M'], 'fix/typo', 'タイポ修正'),
    ],
  ),
};

const s12: Stage = {
  id: 's-12',
  chapter: 'cherry-pick で移植',
  title: 'main の hotfix を develop にも cherry-pick',
  description:
    'マネージャー：「main に当てた hotfix、develop にもピンポイントで持ってきて」',
  lesson:
    'cherry-pick は特定の 1 コミットだけを別ブランチにコピーする操作。merge と違って他の変更は持ち込まれず、緊急修正の横展開で重宝します。',
  hint: 'main の HEAD を develop に cherry-pick',
  initial: buildState(
    ['main', 'develop'],
    {
      main: { name: 'main', head: 'h1', color: COL_MAIN },
      develop: { name: 'develop', head: 'd2', color: COL_DEV },
    },
    [
      commit('m1', [], 'main', 'v1 リリース'),
      commit('h1', ['m1'], 'main', 'クラッシュ修正'),
      commit('d1', ['m1'], 'develop', '次の機能'),
      commit('d2', ['d1'], 'develop', '次の機能 II'),
    ],
  ),
  goal: buildState(
    ['main', 'develop'],
    {
      main: { name: 'main', head: 'h1', color: COL_MAIN },
      develop: { name: 'develop', head: 'cp1', color: COL_DEV },
    },
    [
      commit('m1', [], 'main', 'v1 リリース'),
      commit('h1', ['m1'], 'main', 'クラッシュ修正'),
      commit('d1', ['m1'], 'develop', '次の機能'),
      commit('d2', ['d1'], 'develop', '次の機能 II'),
      commit('cp1', ['d2'], 'develop', 'クラッシュ修正'),
    ],
  ),
};

const s13: Stage = {
  id: 's-13',
  chapter: 'cherry-pick で移植',
  title: '別チームのコミットだけ取り込む',
  description:
    'リード：「あの修正だけ自分のブランチに欲しい。隣の experiment ブランチからピンポイントで取ってきて」',
  lesson:
    '「ブランチ全体は要らないけど、この 1 コミットだけ欲しい」場面で cherry-pick が活きます。差分を一直線に積むのでレビューもしやすい。',
  hint: 'experiment の HEAD を feature に cherry-pick',
  initial: buildState(
    ['develop', 'feature', 'experiment'],
    {
      develop: { name: 'develop', head: 'd1', color: COL_DEV },
      feature: { name: 'feature', head: 'f2', color: COL_FEAT },
      experiment: { name: 'experiment', head: 'e1', color: COL_FEAT2 },
    },
    [
      commit('d1', [], 'develop', '基盤'),
      commit('f1', ['d1'], 'feature', '本流作業'),
      commit('f2', ['f1'], 'feature', '本流作業 II'),
      commit('e1', ['d1'], 'experiment', '便利ヘルパー'),
    ],
  ),
  goal: buildState(
    ['develop', 'feature', 'experiment'],
    {
      develop: { name: 'develop', head: 'd1', color: COL_DEV },
      feature: { name: 'feature', head: 'cp1', color: COL_FEAT },
      experiment: { name: 'experiment', head: 'e1', color: COL_FEAT2 },
    },
    [
      commit('d1', [], 'develop', '基盤'),
      commit('f1', ['d1'], 'feature', '本流作業'),
      commit('f2', ['f1'], 'feature', '本流作業 II'),
      commit('e1', ['d1'], 'experiment', '便利ヘルパー'),
      commit('cp1', ['f2'], 'feature', '便利ヘルパー'),
    ],
  ),
};

const s14: Stage = {
  id: 's-14',
  chapter: 'cherry-pick で移植',
  title: 'hotfix を main・develop の両方に cherry-pick',
  description:
    'CTO：「本番落ちた、hotfix を main にも develop にも、それぞれの先端に cherry-pick で当てて」',
  lesson:
    'merge コミットを増やしたくない時、hotfix を 2 系統に cherry-pick で配ることで、各ブランチの履歴を一直線に保ちつつ修正を行き渡らせられます。',
  hint: 'hotfix を main へ cherry-pick → さらに develop へも cherry-pick',
  initial: buildState(
    ['main', 'develop', 'hotfix'],
    {
      main: { name: 'main', head: 'm1', color: COL_MAIN },
      develop: { name: 'develop', head: 'd1', color: COL_DEV },
      hotfix: { name: 'hotfix', head: 'h1', color: COL_FIX },
    },
    [
      commit('m1', [], 'main', 'v1 リリース'),
      commit('d1', ['m1'], 'develop', '次の作業'),
      commit('h1', ['m1'], 'hotfix', '緊急修正'),
    ],
  ),
  goal: buildState(
    ['main', 'develop', 'hotfix'],
    {
      main: { name: 'main', head: 'cm1', color: COL_MAIN },
      develop: { name: 'develop', head: 'cd1', color: COL_DEV },
      hotfix: { name: 'hotfix', head: 'h1', color: COL_FIX },
    },
    [
      commit('m1', [], 'main', 'v1 リリース'),
      commit('d1', ['m1'], 'develop', '次の作業'),
      commit('h1', ['m1'], 'hotfix', '緊急修正'),
      commit('cm1', ['m1'], 'main', '緊急修正'),
      commit('cd1', ['d1'], 'develop', '緊急修正'),
    ],
  ),
};

const s15: Stage = {
  id: 's-15',
  chapter: '巻き戻し',
  title: '間違ってマージしてしまった、戻して',
  description:
    'リード：「ローカルの develop に間違って WIP を merge しちゃった。push する前に取り消して main の状態に戻して」',
  lesson:
    'reset --hard はブランチの先端を別の場所に付け替えて、進んでいたコミットを切り捨てる強力な巻き戻し。push 前のローカルでのみ安全に使えます。',
  hint: 'develop の HEAD を main の HEAD に reset',
  initial: buildState(
    ['main', 'develop'],
    {
      main: { name: 'main', head: 'm1', color: COL_MAIN },
      develop: { name: 'develop', head: 'M1', color: COL_DEV },
    },
    [
      commit('m1', [], 'main', 'v1 リリース'),
      commit('w1', ['m1'], 'develop', 'WIP'),
      commit('M1', ['m1', 'w1'], 'develop', 'WIP をマージ（誤）'),
    ],
  ),
  goal: buildState(
    ['main', 'develop'],
    {
      main: { name: 'main', head: 'm1', color: COL_MAIN },
      develop: { name: 'develop', head: 'm1', color: COL_DEV },
    },
    [
      commit('m1', [], 'main', 'v1 リリース'),
    ],
  ),
};

const s16: Stage = {
  id: 's-16',
  chapter: '巻き戻し',
  title: 'feature を作業前の状態に戻す',
  description:
    'シニア：「feature の今の作業ぜんぶ要らないから、develop の最新先端まで戻していいよ」',
  lesson:
    'feature の作業をすべて捨てて develop と同じ状態から再スタートしたい時の reset。コミットは到達不能になるので、必要なら事前にバックアップしておくこと。',
  hint: 'feature の HEAD を develop の HEAD に reset',
  initial: buildState(
    ['develop', 'feature'],
    {
      develop: { name: 'develop', head: 'd2', color: COL_DEV },
      feature: { name: 'feature', head: 'f2', color: COL_FEAT },
    },
    [
      commit('d1', [], 'develop', '初期化'),
      commit('d2', ['d1'], 'develop', '基盤整備'),
      commit('f1', ['d2'], 'feature', '試行 1'),
      commit('f2', ['f1'], 'feature', '試行 2'),
    ],
  ),
  goal: buildState(
    ['develop', 'feature'],
    {
      develop: { name: 'develop', head: 'd2', color: COL_DEV },
      feature: { name: 'feature', head: 'd2', color: COL_FEAT },
    },
    [
      commit('d1', [], 'develop', '初期化'),
      commit('d2', ['d1'], 'develop', '基盤整備'),
    ],
  ),
};

const s17: Stage = {
  id: 's-17',
  chapter: '取り消す',
  title: '本番に入った PR を revert で取り消す',
  description:
    'マネージャー：「main にマージした feature、ユーザー影響でた。push 済みだから revert で履歴残して取り消して」',
  lesson:
    'push 済みのコミットを reset で消すと共有履歴が壊れます。revert は「打ち消すコミット」を新規追加するので、履歴を残したまま安全に取り消せる正攻法。',
  hint: 'feature の HEAD を main の HEAD に revert',
  initial: buildState(
    ['main', 'feature'],
    {
      main: { name: 'main', head: 'M1', color: COL_MAIN },
      feature: { name: 'feature', head: 'f1', color: COL_FEAT },
    },
    [
      commit('m1', [], 'main', 'v1 リリース'),
      commit('f1', ['m1'], 'feature', '問題のある機能'),
      commit('M1', ['m1', 'f1'], 'main', 'feature をマージ'),
    ],
  ),
  goal: buildState(
    ['main', 'feature'],
    {
      main: { name: 'main', head: 'rv1', color: COL_MAIN },
      feature: { name: 'feature', head: 'f1', color: COL_FEAT },
    },
    [
      commit('m1', [], 'main', 'v1 リリース'),
      commit('f1', ['m1'], 'feature', '問題のある機能'),
      commit('M1', ['m1', 'f1'], 'main', 'feature をマージ'),
      commit('rv1', ['M1'], 'main', 'Revert: 問題のある機能'),
    ],
  ),
};

const s18: Stage = {
  id: 's-18',
  chapter: '取り消す',
  title: '取り込んだ機能を一時的に止めたい',
  description:
    'PM：「リリース直前で feature ちょっと不安。main に履歴残しつつ一旦無効化したい」',
  lesson:
    'revert で打ち消しコミットを作るとリリース対象から外せます。後で問題が解消したら、その revert をさらに revert すれば再復活できる柔軟さが利点。',
  hint: 'feature の HEAD を main の HEAD に revert',
  initial: buildState(
    ['main', 'feature'],
    {
      main: { name: 'main', head: 'M1', color: COL_MAIN },
      feature: { name: 'feature', head: 'f2', color: COL_FEAT },
    },
    [
      commit('m1', [], 'main', '初期化'),
      commit('f1', ['m1'], 'feature', '機能 v1'),
      commit('f2', ['f1'], 'feature', '機能 v1 微調整'),
      commit('M1', ['m1', 'f2'], 'main', 'feature をマージ'),
    ],
  ),
  goal: buildState(
    ['main', 'feature'],
    {
      main: { name: 'main', head: 'rv1', color: COL_MAIN },
      feature: { name: 'feature', head: 'f2', color: COL_FEAT },
    },
    [
      commit('m1', [], 'main', '初期化'),
      commit('f1', ['m1'], 'feature', '機能 v1'),
      commit('f2', ['f1'], 'feature', '機能 v1 微調整'),
      commit('M1', ['m1', 'f2'], 'main', 'feature をマージ'),
      commit('rv1', ['M1'], 'main', 'Revert: 機能 v1 微調整'),
    ],
  ),
};

const s19: Stage = {
  id: 's-19',
  chapter: '履歴を整える',
  title: '細かいコミットを潰して取り込む',
  description:
    '上司：「feature のコミット細かすぎ。1 コミットにまとめて develop に取り込んで」',
  lesson:
    'squash merge は PR の複数コミットを 1 個に潰して取り込む方法。「fix typo」「rename」みたいな細かい履歴を本流に残したくない時の定番。',
  hint: 'feature の HEAD を develop の HEAD に squash',
  initial: buildState(
    ['develop', 'feature'],
    {
      develop: { name: 'develop', head: 'd1', color: COL_DEV },
      feature: { name: 'feature', head: 'f3', color: COL_FEAT },
    },
    [
      commit('d1', [], 'develop', '基盤'),
      commit('f1', ['d1'], 'feature', 'WIP'),
      commit('f2', ['f1'], 'feature', 'タイポ修正'),
      commit('f3', ['f2'], 'feature', 'リネーム'),
    ],
  ),
  goal: buildState(
    ['develop', 'feature'],
    {
      develop: { name: 'develop', head: 'sq1', color: COL_DEV },
      feature: { name: 'feature', head: 'f3', color: COL_FEAT },
    },
    [
      commit('d1', [], 'develop', '基盤'),
      commit('f1', ['d1'], 'feature', 'WIP'),
      commit('f2', ['f1'], 'feature', 'タイポ修正'),
      commit('f3', ['f2'], 'feature', 'リネーム'),
      commit('sq1', ['d1'], 'develop', 'Squash: feature'),
    ],
  ),
};

const s20: Stage = {
  id: 's-20',
  chapter: '履歴を整える',
  title: '長期 PR を 1 コミットにまとめてリリース',
  description:
    'リリース担当：「機能完成したからリリースしたい。途中の試行錯誤コミットは要らないから 1 個にまとめて main に入れて」',
  lesson:
    'main 向けは履歴を綺麗に保ちたい場面が多いです。squash で開発の試行錯誤を 1 コミットに集約してから取り込むと、リリースノートが書きやすくなります。',
  hint: 'feature の HEAD を main の HEAD に squash',
  initial: buildState(
    ['main', 'feature'],
    {
      main: { name: 'main', head: 'm1', color: COL_MAIN },
      feature: { name: 'feature', head: 'f4', color: COL_FEAT },
    },
    [
      commit('m1', [], 'main', 'v1 リリース'),
      commit('f1', ['m1'], 'feature', '試作'),
      commit('f2', ['f1'], 'feature', 'やり直し'),
      commit('f3', ['f2'], 'feature', '完成'),
      commit('f4', ['f3'], 'feature', 'コメント追加'),
    ],
  ),
  goal: buildState(
    ['main', 'feature'],
    {
      main: { name: 'main', head: 'sq1', color: COL_MAIN },
      feature: { name: 'feature', head: 'f4', color: COL_FEAT },
    },
    [
      commit('m1', [], 'main', 'v1 リリース'),
      commit('f1', ['m1'], 'feature', '試作'),
      commit('f2', ['f1'], 'feature', 'やり直し'),
      commit('f3', ['f2'], 'feature', '完成'),
      commit('f4', ['f3'], 'feature', 'コメント追加'),
      commit('sq1', ['m1'], 'main', 'Squash: feature'),
    ],
  ),
};

// 操作タイプを散らして並べる:
// 1〜6: 6 操作それぞれの基本シナリオを 1 個ずつ
// 7〜12: 6 操作の応用 (1 ステップ)
// 13〜20: 複合・難易度高め
export const stages: ReadonlyArray<Stage> = [
  s01, // 1. merge 基本
  s04, // 2. rebase 基本
  s12, // 3. cherry-pick 基本
  s15, // 4. reset 基本
  s17, // 5. revert 基本
  s19, // 6. squash 基本
  s02, // 7. merge 2 本
  s07, // 8. rebase 長期 PR
  s13, // 9. cherry-pick 別ブランチから
  s16, // 10. reset 作業前に戻す
  s18, // 11. revert 取り込み済み機能の停止
  s20, // 12. squash 長期 PR
  s03, // 13. 進んだ develop に merge
  s08, // 14. 依存先に rebase
  s14, // 15. cherry-pick を 2 箇所に
  s06, // 16. hotfix を main・develop の両方に merge
  s05, // 17. rebase してから merge
  s09, // 18. 3 つの PR を一気に取り込む
  s10, // 19. 連鎖 rebase
  s11, // 20. merge と rebase の使い分け
];

export const stage1: Stage = s01;
