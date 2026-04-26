export interface Commit {
  readonly id: string;
  readonly parents: ReadonlyArray<string>;
  readonly branch: string;
  readonly message?: string;
}

export interface Branch {
  readonly id: string;
  readonly name: string;
  readonly head: string;
  readonly color: string;
}

export interface BonsaiState {
  readonly commits: Readonly<Record<string, Commit>>;
  readonly branches: Readonly<Record<string, Branch>>;
  readonly branchOrder: ReadonlyArray<string>;
}

export interface Stage {
  readonly id: string;
  readonly chapter: string;
  readonly title: string;
  readonly description: string;
  readonly lesson: string;
  readonly hint: string;
  readonly initial: BonsaiState;
  readonly goal: BonsaiState;
}

export interface MergeResult {
  readonly state: BonsaiState;
  readonly command: string;
  readonly newCommitId: string | null;
  readonly ok: boolean;
}
