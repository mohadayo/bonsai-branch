import type { BonsaiState } from './types';

/**
 * ホーム画面の見出しに飾りとして置く盆栽。
 * 遊びの状態とは無関係なので stages.ts には混ぜず、ここで単独に持つ。
 *
 * 描画は「枝 = 横方向の列 / 世代 = 縦方向の行」なので、branchOrder の
 * 真ん中の枝をいちばん高く積むと、樹冠が中央で盛り上がった formal な
 * シルエットになる。左右の枝はそれより低くして三角形に収める。
 */
export const heroState: BonsaiState = {
  branchOrder: ['main', 'feature', 'develop'],
  branches: {
    main: { id: 'main', name: 'main', head: 'm2', color: '#7d5740' },
    feature: { id: 'feature', name: 'feature', head: 'f3', color: '#ab8b4b' },
    develop: { id: 'develop', name: 'develop', head: 'd2', color: '#6d8763' },
  },
  commits: {
    m1: { id: 'm1', parents: [], branch: 'main', message: '土をならす' },
    m2: { id: 'm2', parents: ['m1'], branch: 'main', message: '幹を立てる' },
    f1: { id: 'f1', parents: ['m1'], branch: 'feature', message: '芽を出す' },
    f2: { id: 'f2', parents: ['f1'], branch: 'feature', message: '枝を伸ばす' },
    f3: { id: 'f3', parents: ['f2'], branch: 'feature', message: '花をつける' },
    d1: { id: 'd1', parents: ['m1'], branch: 'develop', message: '枝を分ける' },
    d2: { id: 'd2', parents: ['d1'], branch: 'develop', message: '葉を茂らす' },
  },
};
