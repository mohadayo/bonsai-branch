import { describe, expect, it } from 'vitest';
import { bloomCountFor } from '../src/lib/progress';

// 飾り木は 7 節 / 20 問が現在の構成。関数は数を引数で受けるので、
// heroState や stages が変わってもテスト自体は壊れない。
describe('bloomCountFor', () => {
  it('解いていなければ咲かない', () => {
    expect(bloomCountFor(0, 20, 7)).toBe(0);
  });

  it('1 問でも解けば必ず 1 つは咲く', () => {
    expect(bloomCountFor(1, 20, 7)).toBe(1);
  });

  it('進捗に応じて増える', () => {
    expect(bloomCountFor(5, 20, 7)).toBe(2);
    expect(bloomCountFor(10, 20, 7)).toBe(4);
  });

  it('全問解いたときにだけ満開になる', () => {
    // round(19/20 * 7) = 7 なので、素朴な丸めでは 1 問残して満開になってしまう
    expect(bloomCountFor(19, 20, 7)).toBe(6);
    expect(bloomCountFor(20, 20, 7)).toBe(7);
  });

  it('全問を超える値でも満開のまま', () => {
    expect(bloomCountFor(25, 20, 7)).toBe(7);
  });
});
