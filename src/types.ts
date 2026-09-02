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
  /** 一段目のヒント。操作は明かさず、考え方だけを示す */
  readonly idea: string;
  /** 二段目のヒント。具体的な操作。idea を見ても解けない人向け */
  readonly hint: string;
  readonly initial: BonsaiState;
  readonly goal: BonsaiState;
}

export interface MergeResult {
  readonly state: BonsaiState;
  readonly command: string;
  readonly newCommitId: string | null;
  readonly ok: boolean;
  /** ok が false のとき、その操作が成立しない理由。UI 上で起こり得ない弾き方には付けない */
  readonly reason?: string;
}
