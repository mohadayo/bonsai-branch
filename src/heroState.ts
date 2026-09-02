import type { BonsaiState } from './types';

/**
 * ホーム画面に飾りとして置く盆栽。
 * 遊びの状態とは無関係なので stages.ts には混ぜず、ここで単独に持つ。
 *
 * 描画は「枝 = 横方向の列 / 世代 = 縦方向の行」。根 (parents が空の commit) を
 * 持つ枝がそのまま幹になり、鉢もその真下に置かれるので、幹を branchOrder の
 * 真ん中に据える。そうしないと根元と鉢だけが端に寄り、枝は反対側へ伸びる
 * 一本足の形になる。
 *
 * 高さは 中央 (幹) を最も高く、左右はそれぞれ違う高さにして不等辺の
 * 三角形に収める。左右を同じ段数にすると左右対称になり、木というより
 * 図形に見えてしまう。
 */
export const heroState: BonsaiState = {
  branchOrder: ['feature', 'main', 'develop'],
  branches: {
    feature: { id: 'feature', name: 'feature', head: 'f2', color: '#ab8b4b' },
    main: { id: 'main', name: 'main', head: 'm4', color: '#7d5740' },
    develop: { id: 'develop', name: 'develop', head: 'd1', color: '#6d8763' },
  },
  commits: {
    m1: { id: 'm1', parents: [], branch: 'main', message: '土をならす' },
    m2: { id: 'm2', parents: ['m1'], branch: 'main', message: '幹を立てる' },
    m3: { id: 'm3', parents: ['m2'], branch: 'main', message: '芯を決める' },
    m4: { id: 'm4', parents: ['m3'], branch: 'main', message: '樹冠を作る' },
    f1: { id: 'f1', parents: ['m1'], branch: 'feature', message: '芽を出す' },
    f2: { id: 'f2', parents: ['f1'], branch: 'feature', message: '花をつける' },
    d1: { id: 'd1', parents: ['m1'], branch: 'develop', message: '枝を分ける' },
  },
};
