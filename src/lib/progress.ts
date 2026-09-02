/**
 * ホームの飾り木に咲かせる花の数。解いた数に応じて根元から増え、
 * 全問解いたときにだけ満開になる。
 *
 * 素朴に丸めるだけだと round(19/20 * 7) = 7 で、最後の 1 問を残して
 * 満開になってしまう。全部咲くのは全問解いた人だけに取っておく。
 */
export function bloomCountFor(
  clearedCount: number,
  totalStages: number,
  nodeCount: number,
): number {
  if (clearedCount <= 0) return 0;
  if (clearedCount >= totalStages) return nodeCount;
  return Math.max(
    1,
    Math.min(
      nodeCount - 1,
      Math.round((clearedCount / totalStages) * nodeCount),
    ),
  );
}
