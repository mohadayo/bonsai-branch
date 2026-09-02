import { describe, expect, it } from 'vitest';
import {
  cherryPickBranch,
  matchesTarget,
  mergeBranches,
  rebaseBranch,
  resetBranch,
  revertBranch,
  squashMergeBranches,
} from '../src/lib/dag';
import { stages } from '../src/stages';
import type { BonsaiState, Stage } from '../src/types';

type Op = 'merge' | 'rebase' | 'cherry-pick' | 'squash' | 'revert' | 'reset';

interface Move {
  readonly op: Op;
  readonly source: string;
  readonly target: string;
}

const OPS: ReadonlyArray<Op> = [
  'merge',
  'rebase',
  'cherry-pick',
  'squash',
  'revert',
  'reset',
];

function applyMove(state: BonsaiState, move: Move): BonsaiState | null {
  let r;
  switch (move.op) {
    case 'merge':
      r = mergeBranches(state, move.source, move.target);
      break;
    case 'rebase':
      r = rebaseBranch(state, move.source, move.target);
      break;
    case 'cherry-pick':
      r = cherryPickBranch(state, move.source, move.target);
      break;
    case 'squash':
      r = squashMergeBranches(state, move.source, move.target);
      break;
    case 'revert':
      r = revertBranch(state, move.source, move.target);
      break;
    case 'reset':
      r = resetBranch(state, move.source, move.target);
      break;
  }
  return r.ok ? r.state : null;
}

function stateKey(state: BonsaiState): string {
  // ブランチごとに head から辿った chain（branch + parents.length）の連結
  const parts: string[] = [];
  for (const id of [...Object.keys(state.branches)].sort()) {
    const b = state.branches[id]!;
    let cur: string | undefined = b.head;
    const chain: string[] = [];
    while (cur) {
      const c: BonsaiState['commits'][string] | undefined = state.commits[cur];
      if (!c) break;
      chain.push(`${c.branch}/${c.parents.length}`);
      cur = c.parents[0];
    }
    parts.push(`${id}:${chain.join('>')}`);
  }
  return parts.join('|');
}

const MAX_DEPTH = 5;

function solve(stage: Stage): Move[] | null {
  const branches = Object.keys(stage.initial.branches);
  type Frame = { state: BonsaiState; path: Move[] };
  const queue: Frame[] = [{ state: stage.initial, path: [] }];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const frame = queue.shift()!;
    if (matchesTarget(frame.state, stage.goal)) return frame.path;
    if (frame.path.length >= MAX_DEPTH) continue;
    const key = stateKey(frame.state);
    if (visited.has(key)) continue;
    visited.add(key);

    for (const op of OPS) {
      for (const source of branches) {
        for (const target of branches) {
          if (source === target) continue;
          const next = applyMove(frame.state, { op, source, target });
          if (!next) continue;
          queue.push({
            state: next,
            path: [...frame.path, { op, source, target }],
          });
        }
      }
    }
  }
  return null;
}

describe('stages — 各ステージは正解パスで解ける', () => {
  for (const stage of stages) {
    it(`${stage.id} (${stage.title}) - solver で goal に到達`, () => {
      const moves = solve(stage);
      expect(
        moves,
        `${stage.id} は ${MAX_DEPTH} 手以内で解けない`,
      ).not.toBeNull();
      // 操作数が常識的（10 手以内）
      expect(moves!.length).toBeGreaterThan(0);
      expect(moves!.length).toBeLessThanOrEqual(10);
    });
  }
});

describe('stages — initial と goal の整合性', () => {
  for (const stage of stages) {
    it(`${stage.id} - 全 commit がブランチ head から辿れる`, () => {
      // goal: すべての branch の head が存在する
      for (const b of Object.values(stage.goal.branches)) {
        expect(stage.goal.commits[b.head], `goal: ${b.id} の head ${b.head}`).toBeTruthy();
      }
      for (const b of Object.values(stage.initial.branches)) {
        expect(
          stage.initial.commits[b.head],
          `initial: ${b.id} の head ${b.head}`,
        ).toBeTruthy();
      }
    });

    it(`${stage.id} - 全 commit の parents が存在する`, () => {
      for (const c of Object.values(stage.initial.commits)) {
        for (const p of c.parents) {
          expect(stage.initial.commits[p], `initial: ${c.id} の parent ${p}`).toBeTruthy();
        }
      }
      for (const c of Object.values(stage.goal.commits)) {
        for (const p of c.parents) {
          expect(stage.goal.commits[p], `goal: ${c.id} の parent ${p}`).toBeTruthy();
        }
      }
    });

    it(`${stage.id} - branchOrder と branches のキーが一致`, () => {
      expect([...stage.initial.branchOrder].sort()).toEqual(
        [...Object.keys(stage.initial.branches)].sort(),
      );
      expect([...stage.goal.branchOrder].sort()).toEqual(
        [...Object.keys(stage.goal.branches)].sort(),
      );
    });

    it(`${stage.id} - 初期状態は goal と異なる（操作の余地がある）`, () => {
      expect(matchesTarget(stage.initial, stage.goal)).toBe(false);
    });

    it(`${stage.id} - ヒントは二段階（idea は hint の写しではない）`, () => {
      expect(stage.idea.length).toBeGreaterThan(0);
      expect(stage.hint.length).toBeGreaterThan(0);
      expect(stage.idea).not.toBe(stage.hint);
    });
  }
});

function stageById(id: string): Stage {
  const st = stages.find((s) => s.id === id);
  if (!st) throw new Error(`stage ${id} not found`);
  return st;
}

function applyAll(initial: BonsaiState, moves: Move[]): BonsaiState | null {
  let state: BonsaiState | null = initial;
  for (const m of moves) {
    if (!state) return null;
    state = applyMove(state, m);
  }
  return state;
}

// 取り込み順を問わないステージは、どの順で操作しても必ずクリアになること（false negative を作らない）。
// solver の stateKey は形状のみで重複排除するため逆順を枝刈りしてしまい、この性質を検出できない。
// よって両順序を明示的に適用して確かめる。
describe('matchesTarget — 取り込み順は別解として許容する', () => {
  it('s-02: 2 本の PR をどちらから merge してもクリア', () => {
    const st = stageById('s-02');
    const a = applyAll(st.initial, [
      { op: 'merge', source: 'feat/cart', target: 'develop' },
      { op: 'merge', source: 'fix/header', target: 'develop' },
    ]);
    const b = applyAll(st.initial, [
      { op: 'merge', source: 'fix/header', target: 'develop' },
      { op: 'merge', source: 'feat/cart', target: 'develop' },
    ]);
    expect(matchesTarget(a!, st.goal)).toBe(true);
    expect(matchesTarget(b!, st.goal)).toBe(true);
  });

  it('s-06: hotfix の 2 つの merge は順不同でクリア', () => {
    const st = stageById('s-06');
    const a = applyAll(st.initial, [
      { op: 'merge', source: 'hotfix', target: 'main' },
      { op: 'merge', source: 'hotfix', target: 'develop' },
    ]);
    const b = applyAll(st.initial, [
      { op: 'merge', source: 'hotfix', target: 'develop' },
      { op: 'merge', source: 'hotfix', target: 'main' },
    ]);
    expect(matchesTarget(a!, st.goal)).toBe(true);
    expect(matchesTarget(b!, st.goal)).toBe(true);
  });

  it('s-09: 3 本の PR を任意の順で merge してもクリア', () => {
    const st = stageById('s-09');
    for (const order of [
      ['feat/a', 'feat/b', 'feat/c'],
      ['feat/c', 'feat/b', 'feat/a'],
      ['feat/b', 'feat/a', 'feat/c'],
    ]) {
      const state = applyAll(
        st.initial,
        order.map((source) => ({ op: 'merge' as Op, source, target: 'develop' })),
      );
      expect(matchesTarget(state!, st.goal)).toBe(true);
    }
  });
});

// 教える操作と概念的に異なる操作では、形が似ていてもクリアにならないこと（over-acceptance の解消）。
describe('matchesTarget — 意図と異なる操作では誤クリアしない', () => {
  const wrong: { stage: string; move: Move; why: string }[] = [
    { stage: 's-12', move: { op: 'squash', source: 'main', target: 'develop' }, why: 'cherry-pick 課題を squash で代用' },
    { stage: 's-13', move: { op: 'revert', source: 'develop', target: 'feature' }, why: 'cherry-pick 課題を revert で代用' },
    { stage: 's-17', move: { op: 'squash', source: 'feature', target: 'main' }, why: 'revert 課題を squash で代用' },
    { stage: 's-19', move: { op: 'cherry-pick', source: 'feature', target: 'develop' }, why: 'squash 課題を cherry-pick で代用' },
  ];
  for (const { stage, move, why } of wrong) {
    it(`${stage}: ${why} → 操作は成立するがクリアしない`, () => {
      const st = stageById(stage);
      const next = applyMove(st.initial, move);
      expect(next, '操作自体は成立する').not.toBeNull();
      expect(matchesTarget(next!, st.goal), 'ゴールには一致しない').toBe(false);
    });
  }

  it('s-14: hotfix 以外を main / develop に運んでもクリアしない', () => {
    const st = stageById('s-14');
    const wrongPick = applyMove(st.initial, { op: 'cherry-pick', source: 'develop', target: 'main' });
    expect(wrongPick).not.toBeNull();
    expect(matchesTarget(wrongPick!, st.goal)).toBe(false);
    const wrongSquash = applyMove(st.initial, { op: 'squash', source: 'hotfix', target: 'main' });
    expect(wrongSquash).not.toBeNull();
    expect(matchesTarget(wrongSquash!, st.goal)).toBe(false);
  });
});

// 各操作タイプの正解手順では確実にクリアすること（厳格化で false negative を生んでいない）。
describe('matchesTarget — 正解手順ではクリアする', () => {
  const intended: { stage: string; moves: Move[] }[] = [
    { stage: 's-01', moves: [{ op: 'merge', source: 'feature', target: 'develop' }] },
    { stage: 's-04', moves: [{ op: 'rebase', source: 'feature', target: 'develop' }] },
    { stage: 's-12', moves: [{ op: 'cherry-pick', source: 'main', target: 'develop' }] },
    { stage: 's-15', moves: [{ op: 'reset', source: 'develop', target: 'main' }] },
    { stage: 's-17', moves: [{ op: 'revert', source: 'feature', target: 'main' }] },
    { stage: 's-19', moves: [{ op: 'squash', source: 'feature', target: 'develop' }] },
  ];
  for (const { stage, moves } of intended) {
    it(`${stage}: 正解手順でクリア`, () => {
      const st = stageById(stage);
      const state = applyAll(st.initial, moves);
      expect(state).not.toBeNull();
      expect(matchesTarget(state!, st.goal)).toBe(true);
    });
  }
});

