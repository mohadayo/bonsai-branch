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

/**
 * 操作が成立しないときの結果。reason は UI が「なぜダメか」を出すために使う。
 * ドラッグ元と同じ枝に落とした場合など、UI 上そもそも起こせない弾き方には付けない。
 */
function fail(state: BonsaiState, reason?: string): MergeResult {
  return { state, command: '', newCommitId: null, ok: false, reason };
}

export function mergeBranches(
  state: BonsaiState,
  sourceBranchId: string,
  targetBranchId: string,
): MergeResult {
  if (sourceBranchId === targetBranchId) {
    return fail(state);
  }
  const source = state.branches[sourceBranchId];
  const target = state.branches[targetBranchId];
  if (!source || !target) {
    return fail(state);
  }
  if (source.head === target.head) {
    return fail(
      state,
      `${source.name} と ${target.name} は同じコミットを指しています`,
    );
  }
  // 既に source が target の祖先なら取り込み済み → 空マージを作らない
  if (ancestorsOf(state, target.head).has(source.head)) {
    return fail(
      state,
      `${source.name} はすでに ${target.name} に取り込まれています`,
    );
  }
  // 注: fast-forward 検出はしない。
  // 学習目的なので、未取り込みの merge は明示的に merge commit を作る (git merge --no-ff 相当)。

  const id = newCommitId();
  const newCommit: Commit = {
    id,
    parents: [target.head, source.head],
    branch: targetBranchId,
    message: `${source.name} をマージ`,
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
    return fail(state);
  }
  const source = state.branches[sourceBranchId];
  const target = state.branches[targetBranchId];
  if (!source || !target) {
    return fail(state);
  }
  const base = findMergeBase(state, source.head, target.head);
  if (!base) {
    return fail(state);
  }
  // 既に target.head の上にある（base === target.head）なら no-op
  if (base === target.head) {
    return fail(
      state,
      `${source.name} はすでに ${target.name} の先端の上にあります`,
    );
  }
  const toReplay = chainBefore(state, source.head, base).reverse();
  if (toReplay.length === 0) {
    return fail(
      state,
      `${source.name} に ${target.name} へ載せ替えるコミットがありません`,
    );
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
    return fail(state);
  }
  const source = state.branches[sourceBranchId];
  const target = state.branches[targetBranchId];
  if (!source || !target) {
    return fail(state);
  }
  if (source.head === target.head) {
    return fail(
      state,
      `${source.name} と ${target.name} は同じコミットを指しています`,
    );
  }
  // 既に target の祖先にいるなら no-op（既に取り込まれている）
  if (ancestorsOf(state, target.head).has(source.head)) {
    return fail(
      state,
      `${source.name} の先端のコミットは、すでに ${target.name} に入っています`,
    );
  }
  const sourceCommit = state.commits[source.head];
  if (!sourceCommit) {
    return fail(state);
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
    return fail(state);
  }
  const source = state.branches[sourceBranchId];
  const target = state.branches[targetBranchId];
  if (!source || !target) {
    return fail(state);
  }
  // revert する対象 (source.head) が target に取り込まれている必要がある
  if (!ancestorsOf(state, target.head).has(source.head)) {
    return fail(
      state,
      `revert できるのは取り込み済みのコミットだけです。${source.name} の先端はまだ ${target.name} に入っていません`,
    );
  }
  const sourceCommit = state.commits[source.head];
  if (!sourceCommit) {
    return fail(state);
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
    return fail(state);
  }
  const source = state.branches[sourceBranchId];
  const target = state.branches[targetBranchId];
  if (!source || !target) {
    return fail(state);
  }
  if (source.head === target.head) {
    return fail(
      state,
      `${source.name} と ${target.name} は同じコミットを指しています`,
    );
  }
  // 巻き戻し: target.head は source.head の祖先である必要がある
  if (!ancestorsOf(state, source.head).has(target.head)) {
    return fail(
      state,
      `reset で戻せるのは ${source.name} 自身の履歴にあるコミットだけです。${target.name} の先端はそこにありません`,
    );
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
    return fail(state);
  }
  const source = state.branches[sourceBranchId];
  const target = state.branches[targetBranchId];
  if (!source || !target) {
    return fail(state);
  }
  if (source.head === target.head) {
    return fail(
      state,
      `${source.name} と ${target.name} は同じコミットを指しています`,
    );
  }
  const base = findMergeBase(state, source.head, target.head);
  if (!base) {
    return fail(state);
  }
  // 既に target の祖先 (＝ source は merge 済み) なら squash 対象なし
  if (base === source.head) {
    return fail(
      state,
      `${target.name} にまとめて取り込む差分が ${source.name} にありません`,
    );
  }
  const toSquash = chainBefore(state, source.head, base);
  if (toSquash.length === 0) {
    return fail(
      state,
      `${target.name} にまとめて取り込む差分が ${source.name} にありません`,
    );
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

export function matchesTarget(
  current: BonsaiState,
  target: BonsaiState,
): boolean {
  const branchIds = Object.keys(target.branches);
  if (Object.keys(current.branches).length !== branchIds.length) return false;
  for (const id of branchIds) {
    if (!current.branches[id]) return false;
  }

  // 各ブランチ先端から到達できる全コミットを (branch, message, 親数) の多重集合にして比較する。
  // first-parent の鎖だけを見ると、merge や cherry-pick で「取り込んだ相手」を取り違えても
  // 形だけ一致してクリア扱いになってしまう (over-acceptance)。全祖先を辿り message まで含めることで、
  // cherry-pick / squash / revert の区別も、merge の相手違いも検出できる。
  const signatures = (
    state: BonsaiState,
    heads: ReadonlyArray<string>,
  ): Map<string, number> => {
    const reachable = new Set<string>();
    for (const h of heads) {
      for (const id of ancestorsOf(state, h)) reachable.add(id);
    }
    const counts = new Map<string, number>();
    for (const id of reachable) {
      const c = state.commits[id];
      if (!c) continue;
      const key = `${c.branch} ${c.message ?? ''} ${c.parents.length}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  };

  const tSig = signatures(
    target,
    branchIds.map((id) => target.branches[id]!.head),
  );
  const cSig = signatures(
    current,
    branchIds.map((id) => current.branches[id]!.head),
  );
  if (tSig.size !== cSig.size) return false;
  for (const [key, n] of tSig) {
    if (cSig.get(key) !== n) return false;
  }

  // 各ブランチ先端の検査。先端の message は照合しない: 独立した取り込みの順序違い
  // (例: 2 本の PR をどちらから先に merge してもよい) を正当な別解として許容するため。
  // ただし first-parent の鎖の長さは見る: rebase は (branch, message, 親数) の多重集合を
  // 変えずトポロジーだけ変えるので、鎖の長さ (= ブランチの根がどこに繋がるか) を比べないと
  // initial と goal すら区別できない。鎖の長さは merge の取り込み順では不変なので、
  // 順序非依存を壊さずに rebase を区別できる。
  const firstParentDepth = (state: BonsaiState, head: string): number => {
    let n = 0;
    let cur: string | undefined = head;
    while (cur !== undefined) {
      const c: Commit | undefined = state.commits[cur];
      if (!c) break;
      n++;
      cur = c.parents[0];
    }
    return n;
  };
  for (const id of branchIds) {
    const tHead = target.branches[id]!.head;
    const cHead = current.branches[id]!.head;
    const th = target.commits[tHead];
    const ch = current.commits[cHead];
    if (!th || !ch) return false;
    if (th.branch !== ch.branch) return false;
    if (th.parents.length !== ch.parents.length) return false;
    if (firstParentDepth(target, tHead) !== firstParentDepth(current, cHead)) {
      return false;
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
