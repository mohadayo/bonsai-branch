import type { BonsaiState, Commit, MergeResult } from '../types';

let counter = 1000;
export function newCommitId(): string {
  return `c${++counter}`;
}

export function hashOf(id: string): string {
  let h = 5381;
  for (let i = 0; i < id.length; i++) {
    h = ((h << 5) + h + id.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(6, '0').slice(0, 6);
}

export function stepsRemaining(
  current: BonsaiState,
  target: BonsaiState,
): number {
  const diff =
    Object.keys(target.commits).length - Object.keys(current.commits).length;
  return Math.max(0, diff);
}

export function mergeBranches(
  state: BonsaiState,
  sourceBranchId: string,
  targetBranchId: string,
): MergeResult {
  if (sourceBranchId === targetBranchId) {
    return { state, command: '', newCommitId: null, ok: false };
  }
  const source = state.branches[sourceBranchId];
  const target = state.branches[targetBranchId];
  if (!source || !target) {
    return { state, command: '', newCommitId: null, ok: false };
  }
  if (source.head === target.head) {
    return { state, command: '', newCommitId: null, ok: false };
  }
  // 注: ここでは fast-forward 検出をしない。
  // 学習目的なので、すべての merge は明示的に merge commit を作る (git merge --no-ff 相当)。

  const id = newCommitId();
  const newCommit: Commit = {
    id,
    parents: [target.head, source.head],
    branch: targetBranchId,
    message: `Merge ${source.name}`,
  };

  const newState: BonsaiState = {
    ...state,
    commits: { ...state.commits, [id]: newCommit },
    branches: {
      ...state.branches,
      [targetBranchId]: { ...target, head: id },
    },
  };

  return {
    state: newState,
    command: `git checkout ${target.name} && git merge ${source.name}`,
    newCommitId: id,
    ok: true,
  };
}

export function rebaseBranch(
  state: BonsaiState,
  sourceBranchId: string,
  targetBranchId: string,
): MergeResult {
  if (sourceBranchId === targetBranchId) {
    return { state, command: '', newCommitId: null, ok: false };
  }
  const source = state.branches[sourceBranchId];
  const target = state.branches[targetBranchId];
  if (!source || !target) {
    return { state, command: '', newCommitId: null, ok: false };
  }
  const base = findMergeBase(state, source.head, target.head);
  if (!base) {
    return { state, command: '', newCommitId: null, ok: false };
  }
  // 既に target.head の上にある（base === target.head）なら no-op
  if (base === target.head) {
    return { state, command: '', newCommitId: null, ok: false };
  }
  const toReplay = chainBefore(state, source.head, base).reverse();
  if (toReplay.length === 0) {
    return { state, command: '', newCommitId: null, ok: false };
  }

  const newCommits: Record<string, Commit> = { ...state.commits };
  let prev = target.head;
  let newSourceHead = target.head;
  for (const cid of toReplay) {
    const orig = state.commits[cid];
    if (!orig) continue;
    const newId = newCommitId();
    newCommits[newId] = {
      id: newId,
      parents: [prev],
      branch: sourceBranchId,
      message: orig.message,
    };
    prev = newId;
    newSourceHead = newId;
  }
  // 古い source 側の commit を削除（rebase は履歴を書き換える）
  for (const cid of toReplay) {
    if (!isReferencedElsewhere(state, cid, sourceBranchId)) {
      delete newCommits[cid];
    }
  }

  return {
    state: {
      ...state,
      commits: newCommits,
      branches: {
        ...state.branches,
        [sourceBranchId]: { ...source, head: newSourceHead },
      },
    },
    command: `git checkout ${source.name} && git rebase ${target.name}`,
    newCommitId: newSourceHead,
    ok: true,
  };
}

export function cherryPickBranch(
  state: BonsaiState,
  sourceBranchId: string,
  targetBranchId: string,
): MergeResult {
  if (sourceBranchId === targetBranchId) {
    return { state, command: '', newCommitId: null, ok: false };
  }
  const source = state.branches[sourceBranchId];
  const target = state.branches[targetBranchId];
  if (!source || !target) {
    return { state, command: '', newCommitId: null, ok: false };
  }
  if (source.head === target.head) {
    return { state, command: '', newCommitId: null, ok: false };
  }
  // 既に target の祖先にいるなら no-op（既に取り込まれている）
  if (ancestorsOf(state, target.head).has(source.head)) {
    return { state, command: '', newCommitId: null, ok: false };
  }
  const sourceCommit = state.commits[source.head];
  if (!sourceCommit) {
    return { state, command: '', newCommitId: null, ok: false };
  }
  const newId = newCommitId();
  const newCommit: Commit = {
    id: newId,
    parents: [target.head],
    branch: targetBranchId,
    message: sourceCommit.message,
  };
  return {
    state: {
      ...state,
      commits: { ...state.commits, [newId]: newCommit },
      branches: {
        ...state.branches,
        [targetBranchId]: { ...target, head: newId },
      },
    },
    command: `git checkout ${target.name} && git cherry-pick ${hashOf(source.head)}`,
    newCommitId: newId,
    ok: true,
  };
}

export function revertBranch(
  state: BonsaiState,
  sourceBranchId: string,
  targetBranchId: string,
): MergeResult {
  if (sourceBranchId === targetBranchId) {
    return { state, command: '', newCommitId: null, ok: false };
  }
  const source = state.branches[sourceBranchId];
  const target = state.branches[targetBranchId];
  if (!source || !target) {
    return { state, command: '', newCommitId: null, ok: false };
  }
  // revert する対象 (source.head) が target に取り込まれている必要がある
  if (!ancestorsOf(state, target.head).has(source.head)) {
    return { state, command: '', newCommitId: null, ok: false };
  }
  const sourceCommit = state.commits[source.head];
  if (!sourceCommit) {
    return { state, command: '', newCommitId: null, ok: false };
  }
  const newId = newCommitId();
  const newCommit: Commit = {
    id: newId,
    parents: [target.head],
    branch: targetBranchId,
    message: `Revert: ${sourceCommit.message ?? ''}`,
  };
  return {
    state: {
      ...state,
      commits: { ...state.commits, [newId]: newCommit },
      branches: {
        ...state.branches,
        [targetBranchId]: { ...target, head: newId },
      },
    },
    command: `git checkout ${target.name} && git revert ${hashOf(source.head)}`,
    newCommitId: newId,
    ok: true,
  };
}

export function resetBranch(
  state: BonsaiState,
  sourceBranchId: string,
  targetBranchId: string,
): MergeResult {
  if (sourceBranchId === targetBranchId) {
    return { state, command: '', newCommitId: null, ok: false };
  }
  const source = state.branches[sourceBranchId];
  const target = state.branches[targetBranchId];
  if (!source || !target) {
    return { state, command: '', newCommitId: null, ok: false };
  }
  if (source.head === target.head) {
    return { state, command: '', newCommitId: null, ok: false };
  }
  // 巻き戻し: target.head は source.head の祖先である必要がある
  if (!ancestorsOf(state, source.head).has(target.head)) {
    return { state, command: '', newCommitId: null, ok: false };
  }
  const newBranches = {
    ...state.branches,
    [sourceBranchId]: { ...source, head: target.head },
  };
  const collected = gc({ ...state, branches: newBranches });
  return {
    state: collected,
    command: `git checkout ${source.name} && git reset --hard ${target.name}`,
    newCommitId: target.head,
    ok: true,
  };
}

export function squashMergeBranches(
  state: BonsaiState,
  sourceBranchId: string,
  targetBranchId: string,
): MergeResult {
  if (sourceBranchId === targetBranchId) {
    return { state, command: '', newCommitId: null, ok: false };
  }
  const source = state.branches[sourceBranchId];
  const target = state.branches[targetBranchId];
  if (!source || !target) {
    return { state, command: '', newCommitId: null, ok: false };
  }
  if (source.head === target.head) {
    return { state, command: '', newCommitId: null, ok: false };
  }
  const base = findMergeBase(state, source.head, target.head);
  if (!base) {
    return { state, command: '', newCommitId: null, ok: false };
  }
  // 既に target の祖先 (＝ source は merge 済み) なら squash 対象なし
  if (base === source.head) {
    return { state, command: '', newCommitId: null, ok: false };
  }
  const toSquash = chainBefore(state, source.head, base);
  if (toSquash.length === 0) {
    return { state, command: '', newCommitId: null, ok: false };
  }
  const newId = newCommitId();
  const newCommit: Commit = {
    id: newId,
    parents: [target.head],
    branch: targetBranchId,
    message: `Squash: ${source.name}`,
  };
  return {
    state: {
      ...state,
      commits: { ...state.commits, [newId]: newCommit },
      branches: {
        ...state.branches,
        [targetBranchId]: { ...target, head: newId },
      },
    },
    command: `git checkout ${target.name} && git merge --squash ${source.name} && git commit -m "${source.name}"`,
    newCommitId: newId,
    ok: true,
  };
}

function gc(state: BonsaiState): BonsaiState {
  const reachable = new Set<string>();
  for (const b of Object.values(state.branches)) {
    for (const id of ancestorsOf(state, b.head)) {
      reachable.add(id);
    }
  }
  const newCommits: Record<string, Commit> = {};
  for (const id of reachable) {
    const c = state.commits[id];
    if (c) newCommits[id] = c;
  }
  return { ...state, commits: newCommits };
}

function isReferencedElsewhere(
  state: BonsaiState,
  commitId: string,
  excludeBranch: string,
): boolean {
  for (const b of Object.values(state.branches)) {
    if (b.id === excludeBranch) continue;
    if (b.head === commitId) return true;
    // ブランチの head から辿って包含されているか
    const ancestors = ancestorsOf(state, b.head);
    if (ancestors.has(commitId)) return true;
  }
  return false;
}

export function ancestorsOf(state: BonsaiState, headId: string): Set<string> {
  const out = new Set<string>();
  const stack = [headId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (out.has(id)) continue;
    const c = state.commits[id];
    if (!c) continue;
    out.add(id);
    for (const p of c.parents) stack.push(p);
  }
  return out;
}

export function findMergeBase(
  state: BonsaiState,
  a: string,
  b: string,
): string | null {
  const aAnc = ancestorsOf(state, a);
  const visited = new Set<string>();
  const queue: string[] = [b];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    if (aAnc.has(id)) return id;
    const c = state.commits[id];
    if (!c) continue;
    for (const p of c.parents) queue.push(p);
  }
  return null;
}

function chainBefore(
  state: BonsaiState,
  fromId: string,
  baseId: string,
): string[] {
  const out: string[] = [];
  let cur: string | undefined = fromId;
  while (cur && cur !== baseId) {
    out.push(cur);
    const c: Commit | undefined = state.commits[cur];
    cur = c?.parents[0];
  }
  return out;
}

function commitsAt(state: BonsaiState, headId: string): Commit[] {
  const out: Commit[] = [];
  let cur: string | undefined = headId;
  while (cur !== undefined) {
    const c: Commit | undefined = state.commits[cur];
    if (!c) break;
    out.push(c);
    cur = c.parents[0];
  }
  return out;
}

export function matchesTarget(
  current: BonsaiState,
  target: BonsaiState,
): boolean {
  const branchIds = Object.keys(target.branches);
  if (Object.keys(current.branches).length !== branchIds.length) return false;
  for (const id of branchIds) {
    const t = target.branches[id];
    const c = current.branches[id];
    if (!t || !c) return false;
    const tChain = commitsAt(target, t.head);
    const cChain = commitsAt(current, c.head);
    if (tChain.length !== cChain.length) return false;
    for (let i = 0; i < tChain.length; i++) {
      const tc = tChain[i]!;
      const cc = cChain[i]!;
      if (tc.parents.length !== cc.parents.length) return false;
      if (tc.branch !== cc.branch) return false;
    }
  }
  return true;
}

export function computeGenerations(
  state: BonsaiState,
): Record<string, number> {
  const memo: Record<string, number> = {};
  const visit = (id: string): number => {
    if (memo[id] !== undefined) return memo[id]!;
    const c = state.commits[id];
    if (!c || c.parents.length === 0) {
      memo[id] = 0;
      return 0;
    }
    const g = Math.max(...c.parents.map((p) => visit(p))) + 1;
    memo[id] = g;
    return g;
  };
  for (const id of Object.keys(state.commits)) visit(id);
  return memo;
}
