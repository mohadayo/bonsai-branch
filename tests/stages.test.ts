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
  }
});

