import { describe, expect, it } from 'vitest';
import {
  ancestorsOf,
  cherryPickBranch,
  computeGenerations,
  findMergeBase,
  hashOf,
  matchesTarget,
  mergeBranches,
  rebaseBranch,
  resetBranch,
  revertBranch,
  squashMergeBranches,
  stepsRemaining,
} from '../src/lib/dag';
import type { BonsaiState } from '../src/types';

function s(branches: { id: string; head: string }[], commits: { id: string; parents: string[]; branch: string }[]): BonsaiState {
  const cs: Record<string, BonsaiState['commits'][string]> = {};
  for (const c of commits) cs[c.id] = { id: c.id, parents: c.parents, branch: c.branch };
  const bs: Record<string, BonsaiState['branches'][string]> = {};
  for (const b of branches) bs[b.id] = { id: b.id, name: b.id, head: b.head, color: '#000' };
  return { commits: cs, branches: bs, branchOrder: branches.map((b) => b.id) };
}

describe('hashOf', () => {
  it('decisive 6-hex', () => {
    expect(hashOf('a1')).toMatch(/^[0-9a-f]{6}$/);
    expect(hashOf('a1')).toBe(hashOf('a1'));
    expect(hashOf('a1')).not.toBe(hashOf('a2'));
  });
});

describe('ancestorsOf', () => {
  it('linear', () => {
    const st = s(
      [{ id: 'main', head: 'c3' }],
      [
        { id: 'c1', parents: [], branch: 'main' },
        { id: 'c2', parents: ['c1'], branch: 'main' },
        { id: 'c3', parents: ['c2'], branch: 'main' },
      ],
    );
    const anc = ancestorsOf(st, 'c3');
    expect(anc.has('c1')).toBe(true);
    expect(anc.has('c2')).toBe(true);
    expect(anc.has('c3')).toBe(true);
  });
});

describe('findMergeBase', () => {
  it('forking branches share base', () => {
    const st = s(
      [
        { id: 'main', head: 'c3' },
        { id: 'feat', head: 'b2' },
      ],
      [
        { id: 'c1', parents: [], branch: 'main' },
        { id: 'c2', parents: ['c1'], branch: 'main' },
        { id: 'c3', parents: ['c2'], branch: 'main' },
        { id: 'b1', parents: ['c2'], branch: 'feat' },
        { id: 'b2', parents: ['b1'], branch: 'feat' },
      ],
    );
    expect(findMergeBase(st, 'b2', 'c3')).toBe('c2');
  });
});

describe('mergeBranches', () => {
  it('creates merge commit with two parents', () => {
    const st = s(
      [
        { id: 'main', head: 'c3' },
        { id: 'feat', head: 'b2' },
      ],
      [
        { id: 'c1', parents: [], branch: 'main' },
        { id: 'c2', parents: ['c1'], branch: 'main' },
        { id: 'c3', parents: ['c2'], branch: 'main' },
        { id: 'b1', parents: ['c2'], branch: 'feat' },
        { id: 'b2', parents: ['b1'], branch: 'feat' },
      ],
    );
    const r = mergeBranches(st, 'feat', 'main');
    expect(r.ok).toBe(true);
    const newId = r.newCommitId!;
    const mergeCommit = r.state.commits[newId]!;
    expect(mergeCommit.parents.length).toBe(2);
    expect(mergeCommit.parents[0]).toBe('c3');
    expect(mergeCommit.parents[1]).toBe('b2');
    expect(r.state.branches.main!.head).toBe(newId);
  });

  it('rejects same branch', () => {
    const st = s(
      [{ id: 'main', head: 'c1' }],
      [{ id: 'c1', parents: [], branch: 'main' }],
    );
    expect(mergeBranches(st, 'main', 'main').ok).toBe(false);
  });
});

describe('rebaseBranch', () => {
  it('replays feature commits onto main head', () => {
    const st = s(
      [
        { id: 'main', head: 'c3' },
        { id: 'feat', head: 'b2' },
      ],
      [
        { id: 'c1', parents: [], branch: 'main' },
        { id: 'c2', parents: ['c1'], branch: 'main' },
        { id: 'c3', parents: ['c2'], branch: 'main' },
        { id: 'b1', parents: ['c2'], branch: 'feat' },
        { id: 'b2', parents: ['b1'], branch: 'feat' },
      ],
    );
    const r = rebaseBranch(st, 'feat', 'main');
    expect(r.ok).toBe(true);
    // 新しい feat の head から辿ると c3 (main head) を経由する
    const newHead = r.state.branches.feat!.head;
    const anc = ancestorsOf(r.state, newHead);
    expect(anc.has('c3')).toBe(true);
    // 古い b1, b2 は削除されている
    expect(r.state.commits.b1).toBeUndefined();
    expect(r.state.commits.b2).toBeUndefined();
  });

  it('rejects when already on top', () => {
    const st = s(
      [
        { id: 'main', head: 'c2' },
        { id: 'feat', head: 'b1' },
      ],
      [
        { id: 'c1', parents: [], branch: 'main' },
        { id: 'c2', parents: ['c1'], branch: 'main' },
        { id: 'b1', parents: ['c2'], branch: 'feat' },
      ],
    );
    // feat は既に main 上 → no-op
    expect(rebaseBranch(st, 'feat', 'main').ok).toBe(false);
  });
});

describe('stepsRemaining', () => {
  it('returns commit count diff', () => {
    const a = s([{ id: 'm', head: 'c1' }], [{ id: 'c1', parents: [], branch: 'm' }]);
    const b = s(
      [{ id: 'm', head: 'c2' }],
      [
        { id: 'c1', parents: [], branch: 'm' },
        { id: 'c2', parents: ['c1'], branch: 'm' },
      ],
    );
    expect(stepsRemaining(a, b)).toBe(1);
    expect(stepsRemaining(b, a)).toBe(0);
  });
});

describe('computeGenerations', () => {
  it('chain', () => {
    const st = s(
      [{ id: 'm', head: 'c3' }],
      [
        { id: 'c1', parents: [], branch: 'm' },
        { id: 'c2', parents: ['c1'], branch: 'm' },
        { id: 'c3', parents: ['c2'], branch: 'm' },
      ],
    );
    const g = computeGenerations(st);
    expect(g.c1).toBe(0);
    expect(g.c2).toBe(1);
    expect(g.c3).toBe(2);
  });

  it('merge has max parent gen + 1', () => {
    const st = s(
      [{ id: 'm', head: 'M' }],
      [
        { id: 'c1', parents: [], branch: 'm' },
        { id: 'c2', parents: ['c1'], branch: 'm' },
        { id: 'b1', parents: ['c1'], branch: 'm' },
        { id: 'M', parents: ['c2', 'b1'], branch: 'm' },
      ],
    );
    const g = computeGenerations(st);
    expect(g.M).toBe(2);
  });
});

describe('matchesTarget', () => {
  it('identical state matches', () => {
    const st = s(
      [{ id: 'm', head: 'c1' }],
      [{ id: 'c1', parents: [], branch: 'm' }],
    );
    expect(matchesTarget(st, st)).toBe(true);
  });

  it('different commit count does not match', () => {
    const a = s([{ id: 'm', head: 'c1' }], [{ id: 'c1', parents: [], branch: 'm' }]);
    const b = s(
      [{ id: 'm', head: 'c2' }],
      [
        { id: 'c1', parents: [], branch: 'm' },
        { id: 'c2', parents: ['c1'], branch: 'm' },
      ],
    );
    expect(matchesTarget(a, b)).toBe(false);
  });
});

describe('cherryPickBranch', () => {
  it('copies source HEAD onto target HEAD', () => {
    const st = s(
      [
        { id: 'm', head: 'm1' },
        { id: 'f', head: 'f1' },
      ],
      [
        { id: 'm1', parents: [], branch: 'm' },
        { id: 'f1', parents: ['m1'], branch: 'f' },
      ],
    );
    const r = cherryPickBranch(st, 'f', 'm');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const newHead = r.state.branches.m!.head;
    const c = r.state.commits[newHead]!;
    expect(c.parents).toEqual(['m1']);
    expect(c.branch).toBe('m');
  });

  it('rejects when source already in target ancestry', () => {
    const st = s(
      [
        { id: 'm', head: 'm2' },
        { id: 'f', head: 'm1' },
      ],
      [
        { id: 'm1', parents: [], branch: 'm' },
        { id: 'm2', parents: ['m1'], branch: 'm' },
      ],
    );
    const r = cherryPickBranch(st, 'f', 'm');
    expect(r.ok).toBe(false);
  });

  it('rejects same branch', () => {
    const st = s(
      [{ id: 'm', head: 'm1' }],
      [{ id: 'm1', parents: [], branch: 'm' }],
    );
    const r = cherryPickBranch(st, 'm', 'm');
    expect(r.ok).toBe(false);
  });
});

describe('revertBranch', () => {
  it('creates inverse commit on target', () => {
    const st = s(
      [
        { id: 'm', head: 'm2' },
        { id: 'f', head: 'm1' },
      ],
      [
        { id: 'm1', parents: [], branch: 'm' },
        { id: 'm2', parents: ['m1'], branch: 'm' },
      ],
    );
    const r = revertBranch(st, 'f', 'm');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const newHead = r.state.branches.m!.head;
    const c = r.state.commits[newHead]!;
    expect(c.parents).toEqual(['m2']);
    expect(c.message).toContain('Revert');
  });

  it('rejects if source not in target ancestry', () => {
    const st = s(
      [
        { id: 'm', head: 'm1' },
        { id: 'f', head: 'f1' },
      ],
      [
        { id: 'm1', parents: [], branch: 'm' },
        { id: 'f1', parents: ['m1'], branch: 'f' },
      ],
    );
    const r = revertBranch(st, 'f', 'm');
    expect(r.ok).toBe(false);
  });
});

describe('resetBranch', () => {
  it('moves source HEAD to target HEAD (backward)', () => {
    const st = s(
      [
        { id: 'm', head: 'm3' },
        { id: 'b', head: 'm1' },
      ],
      [
        { id: 'm1', parents: [], branch: 'm' },
        { id: 'm2', parents: ['m1'], branch: 'm' },
        { id: 'm3', parents: ['m2'], branch: 'm' },
      ],
    );
    const r = resetBranch(st, 'm', 'b');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.branches.m!.head).toBe('m1');
    // m2, m3 は到達不能になり gc される
    expect(r.state.commits.m2).toBeUndefined();
    expect(r.state.commits.m3).toBeUndefined();
  });

  it('rejects if target not in source ancestry (forward move)', () => {
    const st = s(
      [
        { id: 'm', head: 'm1' },
        { id: 'f', head: 'f1' },
      ],
      [
        { id: 'm1', parents: [], branch: 'm' },
        { id: 'f1', parents: ['m1'], branch: 'f' },
      ],
    );
    const r = resetBranch(st, 'm', 'f');
    expect(r.ok).toBe(false);
  });

  it('preserves commits referenced by other branches', () => {
    const st = s(
      [
        { id: 'm', head: 'm3' },
        { id: 'b', head: 'm1' },
        { id: 'k', head: 'm2' }, // m2 を head にしている
      ],
      [
        { id: 'm1', parents: [], branch: 'm' },
        { id: 'm2', parents: ['m1'], branch: 'm' },
        { id: 'm3', parents: ['m2'], branch: 'm' },
      ],
    );
    const r = resetBranch(st, 'm', 'b');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.commits.m2).toBeDefined(); // k から参照されているので残る
    expect(r.state.commits.m3).toBeUndefined(); // 誰からも参照されない
  });
});

describe('squashMergeBranches', () => {
  it('squashes source-only commits into one commit on target', () => {
    const st = s(
      [
        { id: 'm', head: 'm1' },
        { id: 'f', head: 'f3' },
      ],
      [
        { id: 'm1', parents: [], branch: 'm' },
        { id: 'f1', parents: ['m1'], branch: 'f' },
        { id: 'f2', parents: ['f1'], branch: 'f' },
        { id: 'f3', parents: ['f2'], branch: 'f' },
      ],
    );
    const r = squashMergeBranches(st, 'f', 'm');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const newHead = r.state.branches.m!.head;
    const c = r.state.commits[newHead]!;
    expect(c.parents).toEqual(['m1']); // 単一親（merge commit ではない）
    expect(c.branch).toBe('m');
    expect(c.message).toContain('Squash');
    // f は変わらず
    expect(r.state.branches.f!.head).toBe('f3');
  });

  it('rejects when source already merged', () => {
    const st = s(
      [
        { id: 'm', head: 'm2' },
        { id: 'f', head: 'm1' },
      ],
      [
        { id: 'm1', parents: [], branch: 'm' },
        { id: 'm2', parents: ['m1'], branch: 'm' },
      ],
    );
    const r = squashMergeBranches(st, 'f', 'm');
    expect(r.ok).toBe(false);
  });
});
