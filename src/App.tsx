import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  pointerWithin,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { motion, AnimatePresence, MotionConfig } from 'framer-motion';
import { Bonsai } from './components/Bonsai';
import { stages } from './stages';
import { heroState } from './heroState';
import { bloomCountFor } from './lib/progress';
import {
  cherryPickBranch,
  matchesTarget,
  mergeBranches,
  rebaseBranch,
  resetBranch,
  revertBranch,
  squashMergeBranches,
} from './lib/dag';
import type { BonsaiState, MergeResult } from './types';

type Mode = 'merge' | 'rebase' | 'cherry-pick' | 'squash' | 'revert' | 'reset';

function applyOp(
  state: BonsaiState,
  mode: Mode,
  source: string,
  target: string,
): MergeResult {
  switch (mode) {
    case 'merge':
      return mergeBranches(state, source, target);
    case 'rebase':
      return rebaseBranch(state, source, target);
    case 'cherry-pick':
      return cherryPickBranch(state, source, target);
    case 'squash':
      return squashMergeBranches(state, source, target);
    case 'revert':
      return revertBranch(state, source, target);
    case 'reset':
      return resetBranch(state, source, target);
  }
}

const MODE_LABELS: Record<Mode, string> = {
  merge: 'merge',
  rebase: 'rebase',
  'cherry-pick': 'cherry-pick',
  squash: 'squash',
  revert: 'revert',
  reset: 'reset',
};

const MODE_GROUPS: ReadonlyArray<{
  label: string;
  modes: ReadonlyArray<Mode>;
}> = [
  { label: '取り込む', modes: ['merge', 'rebase', 'cherry-pick', 'squash'] },
  { label: '巻き戻す', modes: ['revert', 'reset'] },
];

// ホームの飾り盆栽の縦横比。styles.css の .home-tree の aspect-ratio と必ず揃える。
// さらに heroState の自然な縦横比 (枝の本数と段数から決まる) とも合わせること。
// ずれると svg が viewBox を伸ばして中身を中央に置くので、木の上下に余白が出る。
// 現在の heroState は 3 枝 / 3 段なので
//   desktop: (80 + 80 + 2*140) / (58 + 3*70 + 64) = 440 / 332 = 1.325
//   mobile : (36 + 36 + 2*140) / 332              = 352 / 332 = 1.06
const HERO_ASPECT_DESKTOP = 1.325;
const HERO_ASPECT_MOBILE = 1.06;

// ホームで「この 20 問で何を触るか」を一望させるための操作名。
const HOME_OPS: ReadonlyArray<string> = [
  'merge',
  'rebase',
  'cherry-pick',
  'squash',
  'revert',
  'reset',
];

const STORAGE_KEY = 'bonsai-branch-progress-v1';
interface StoredProgress {
  cleared: string[];
  stageIndex: number;
}

function loadProgress(): StoredProgress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { cleared: [], stageIndex: 0 };
    const parsed = JSON.parse(raw) as StoredProgress;
    const validIds = new Set(stages.map((s) => s.id));
    const filteredCleared = Array.isArray(parsed.cleared)
      ? parsed.cleared.filter((id) => validIds.has(id))
      : [];
    let maxUnlocked = stages.length - 1;
    const clearedSet = new Set(filteredCleared);
    for (let i = 0; i < stages.length; i++) {
      if (!clearedSet.has(stages[i]!.id)) {
        maxUnlocked = i;
        break;
      }
    }
    const rawIndex = Number.isInteger(parsed.stageIndex)
      ? (parsed.stageIndex as number)
      : 0;
    return {
      cleared: filteredCleared,
      stageIndex: Math.max(0, Math.min(maxUnlocked, rawIndex)),
    };
  } catch {
    return { cleared: [], stageIndex: 0 };
  }
}

function saveProgress(p: StoredProgress): void {
  try {
    // 複数タブで遊んでいても、別タブでクリアした分を上書きで消さないよう
    // cleared は保存済みの内容と合算する（stageIndex は後勝ちでよい）
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const prev = JSON.parse(raw) as StoredProgress;
        if (Array.isArray(prev.cleared)) {
          p = {
            ...p,
            cleared: Array.from(new Set([...prev.cleared, ...p.cleared])),
          };
        }
      }
    } catch {}
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {}
}

export default function App(): React.ReactElement {
  const initial = useMemo(() => loadProgress(), []);
  const [stageIndex, setStageIndex] = useState<number>(initial.stageIndex);
  const [cleared, setCleared] = useState<Set<string>>(
    () => new Set(initial.cleared),
  );
  const [mode, setMode] = useState<Mode>('merge');
  const [view, setView] = useState<'home' | 'play'>('home');

  const stage = stages[stageIndex]!;
  // 盤面と、その時点までのコマンド列を対で積む。リセットも一手として積むので
  // 「一手戻す」で取り消せる（押し間違いで進行を失わせない）
  const [history, setHistory] = useState<
    Array<{ state: BonsaiState; commandLog: string[] }>
  >([]);
  const [state, setState] = useState<BonsaiState>(stage.initial);
  const [recentCommitId, setRecentCommitId] = useState<string | null>(null);
  const [commandLog, setCommandLog] = useState<string[]>([]);
  // 成立しない操作をしたときの一言。同じ文言が続けて出ても消えるまでを測り直せるよう、
  // 毎回新しいオブジェクトにする
  const [opError, setOpError] = useState<{ text: string } | null>(null);
  const [goalRevealed, setGoalRevealed] = useState(false);
  const yourBoxRef = useRef<HTMLDivElement>(null);
  const goalBoxRef = useRef<HTMLDivElement>(null);
  const [yourAspect, setYourAspect] = useState<number | null>(null);
  const [goalAspect, setGoalAspect] = useState<number | null>(null);
  const [activeBranch, setActiveBranch] = useState<string | null>(null);
  // ドラッグせずに遊ぶときの「いま選んである枝」
  const [picked, setPicked] = useState<string | null>(null);
  // 画面外の分岐ボタンにフォーカスがある枝。盤面の節にリングを出す
  const [focusedBranch, setFocusedBranch] = useState<string | null>(null);
  const [hintOpen, setHintOpen] = useState<boolean>(false);
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(max-width: 720px)').matches
      : false,
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 720px)');
    const handler = (): void => setIsMobile(mq.matches);
    handler();
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  const isCleared = useMemo(
    () => matchesTarget(state, stage.goal),
    [state, stage.goal],
  );
  const maxUnlockedIndex = useMemo(() => {
    for (let i = 0; i < stages.length; i++) {
      if (!cleared.has(stages[i]!.id)) return i;
    }
    return stages.length - 1;
  }, [cleared]);
  const isAllCleared = cleared.size === stages.length;
  // ホームの飾り木は、解いた数だけ根元から花が咲く。全問解くと満開になる。
  // 木の形そのものは変えない（枝を足すと viewBox の縦横比が動いて余白が出る）
  const heroBloomCount = useMemo(
    () =>
      bloomCountFor(
        cleared.size,
        stages.length,
        Object.keys(heroState.commits).length,
      ),
    [cleared.size],
  );
  // gotoStage が maxUnlockedIndex より先へ行かせないので、ステージは順番にしか
  // 進めない。つまり最終ステージを解いた時点で全問クリアが確定している。
  // ここで isAllCleared を見ると、cleared に加える useEffect が走るまで false の
  // ままなので、いちばんの見せ場で「正解」が一度出てから「全クリア」に化ける。
  const isFinalClear = isCleared && stageIndex === stages.length - 1;

  const invalidDropBranchIds = useMemo(() => {
    const s = new Set<string>();
    if (!activeBranch) return s;
    s.add(activeBranch);
    for (const tid of state.branchOrder) {
      if (tid === activeBranch) continue;
      const r = applyOp(state, mode, activeBranch, tid);
      if (!r.ok) s.add(tid);
    }
    return s;
  }, [activeBranch, mode, state]);

  useEffect(() => {
    setState(stage.initial);
    setHistory([]);
    setRecentCommitId(null);
    setCommandLog([]);
    setGoalRevealed(false);
    setMode('merge');
    setHintOpen(false);
    setOpError(null);
    setPicked(null);
    setFocusedBranch(null);
  }, [stage]);

  // モバイルでタップ操作するため、外側クリック / Escape で閉じる
  useEffect(() => {
    if (!hintOpen) return;
    function onClick(e: MouseEvent): void {
      const wrap = document.getElementById('hint-wrap');
      if (wrap && !wrap.contains(e.target as Node)) setHintOpen(false);
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') setHintOpen(false);
    }
    const t = window.setTimeout(() => {
      document.addEventListener('click', onClick);
    }, 0);
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [hintOpen]);

  // クリアしたら自動で答え合わせ
  useEffect(() => {
    if (isCleared) setGoalRevealed(true);
  }, [isCleared]);

  // 直近 commit ハイライトを 1.7s で消す
  useEffect(() => {
    if (!recentCommitId) return;
    const t = window.setTimeout(() => setRecentCommitId(null), 1700);
    return () => window.clearTimeout(t);
  }, [recentCommitId]);

  // 操作が成立しなかった理由を 3s で消す
  useEffect(() => {
    if (!opError) return;
    const t = window.setTimeout(() => setOpError(null), 3000);
    return () => window.clearTimeout(t);
  }, [opError]);

  // 枠のサイズを計測して SVG の viewBox aspect を合わせる
  // view が 'home' → 'play' に切り替わった時に ref が初めて DOM に付くため、view を依存に入れる
  useEffect(() => {
    function observe(
      el: HTMLDivElement | null,
      setter: (n: number | null) => void,
    ): (() => void) | undefined {
      if (!el) return;
      const ro = new ResizeObserver((entries) => {
        const r = entries[0]?.contentRect;
        if (!r || r.height === 0) return;
        setter(r.width / r.height);
      });
      ro.observe(el);
      return () => ro.disconnect();
    }
    const u1 = observe(yourBoxRef.current, setYourAspect);
    const u2 = observe(goalBoxRef.current, setGoalAspect);
    return () => {
      u1?.();
      u2?.();
    };
  }, [view]);

  useEffect(() => {
    if (!isCleared) return;
    setCleared((prev) => {
      if (prev.has(stage.id)) return prev;
      const next = new Set(prev);
      next.add(stage.id);
      return next;
    });
  }, [isCleared, stage.id]);

  useEffect(() => {
    saveProgress({ cleared: Array.from(cleared), stageIndex });
  }, [stageIndex, cleared]);

  useEffect(() => {
    if (view !== 'play') return;
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'Escape') {
        setPicked(null);
        return;
      }
      if (e.key === 'r' || e.key === 'R') {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        reset();
      } else if (e.key === 'z' || e.key === 'Z') {
        if (e.altKey) return;
        e.preventDefault();
        undo();
      } else if (
        // Cmd+←→ はブラウザの「戻る / 進む」なので奪わない。Shift で移動する
        e.key === 'ArrowRight' &&
        e.shiftKey &&
        !e.metaKey &&
        !e.ctrlKey
      ) {
        e.preventDefault();
        gotoStage(stageIndex + 1);
      } else if (
        e.key === 'ArrowLeft' &&
        e.shiftKey &&
        !e.metaKey &&
        !e.ctrlKey
      ) {
        e.preventDefault();
        gotoStage(stageIndex - 1);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, history, state, stageIndex, maxUnlockedIndex]);

  function handleDragStart(event: DragStartEvent): void {
    const id = String(event.active.id);
    const m = /^tip-(.+)$/.exec(id);
    if (m) setActiveBranch(m[1]!);
  }

  // ドラッグでも「選ぶ → 相手を選ぶ」でも、ここに集まる
  function applyMove(source: string, target: string): void {
    if (source === target) return;
    const result = applyOp(state, mode, source, target);
    if (!result.ok) {
      if (result.reason) setOpError({ text: result.reason });
      return;
    }
    setOpError(null);
    setHistory((h) => [...h, { state, commandLog }]);
    setState(result.state);
    setRecentCommitId(result.newCommitId);
    setCommandLog((log) => [...log, result.command]);
  }

  function handleDragEnd(event: DragEndEvent): void {
    setActiveBranch(null);
    const activeId = String(event.active.id);
    const overId = event.over?.id ? String(event.over.id) : null;
    if (!overId) return;
    const sourceMatch = /^tip-(.+)$/.exec(activeId);
    const targetMatch = /^tip-(.+)-drop$/.exec(overId);
    if (!sourceMatch || !targetMatch) return;
    setPicked(null);
    applyMove(sourceMatch[1]!, targetMatch[1]!);
  }

  // ドラッグせずに遊ぶ経路。1 回目で枝を選び、2 回目で相手を選ぶ。
  // キーボード（Enter / Space）でもタップでも同じ手順になる
  function handlePick(branchId: string): void {
    if (isCleared) return;
    if (picked === null) {
      setPicked(branchId);
      setOpError(null);
      return;
    }
    if (picked === branchId) {
      setPicked(null);
      return;
    }
    const source = picked;
    setPicked(null);
    applyMove(source, branchId);
  }

  // 盤面を初期状態に戻す。history は捨てずに現在の盤面を積むので、
  // 誤って押しても「一手戻す」で直前の盤面ごと帰ってこられる
  function reset(): void {
    if (state !== stage.initial) {
      setHistory((h) => [...h, { state, commandLog }]);
    }
    setState(stage.initial);
    setRecentCommitId(null);
    setCommandLog([]);
    setOpError(null);
    setPicked(null);
  }

  function undo(): void {
    if (history.length === 0) return;
    const prev = history[history.length - 1]!;
    setState(prev.state);
    setRecentCommitId(null);
    setHistory((h) => h.slice(0, -1));
    setCommandLog(prev.commandLog);
    setOpError(null);
    setPicked(null);
  }

  function gotoStage(idx: number): void {
    if (idx < 0 || idx >= stages.length) return;
    if (idx > maxUnlockedIndex) return;
    setStageIndex(idx);
  }

  // ステージを解いていない状態から始める。stageIndex が変わらないときは
  // [stage] の useEffect が走らないので、盤面はここで初期化する
  function startFresh(idx: number): void {
    const next = stages[idx];
    if (!next) return;
    setStageIndex(idx);
    setState(next.initial);
    setHistory([]);
    setRecentCommitId(null);
    setCommandLog([]);
    setGoalRevealed(false);
    setMode('merge');
    setHintOpen(false);
    setOpError(null);
    setPicked(null);
    setView('play');
  }

  return (
    // OS の「視差効果を減らす」設定を尊重する。transform 系の動きが止まり、
    // opacity のフェードだけが残る
    <MotionConfig reducedMotion="user">
    <motion.div
      className="app"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
    >
      <header className="header">
        <h1 className="title">
          <button
            type="button"
            className="logo logo-btn"
            onClick={() => setView('home')}
            aria-label="ホームへ"
            disabled={view === 'home'}
          >
            <svg
              className="logo-art"
              viewBox="0 0 200 28"
              aria-hidden="true"
              preserveAspectRatio="xMidYMax meet"
            >
              <path
                d="M 18 26 Q 42 8 78 14 Q 116 20 154 6"
                stroke="#7d5740"
                strokeWidth={1.1}
                fill="none"
                strokeLinecap="round"
                opacity={0.85}
              />
              <path
                d="M 78 14 Q 84 6 92 3"
                stroke="#7d5740"
                strokeWidth={0.8}
                fill="none"
                strokeLinecap="round"
                opacity={0.7}
              />
              <path
                d="M 120 17 Q 126 11 134 9"
                stroke="#7d5740"
                strokeWidth={0.8}
                fill="none"
                strokeLinecap="round"
                opacity={0.7}
              />
              <circle cx="42" cy="14" r="2.6" fill="#6d8763" />
              <circle cx="78" cy="14" r="2.2" fill="#ab8b4b" />
              <circle cx="92" cy="3" r="1.9" fill="#6d8763" />
              <circle cx="120" cy="17" r="2.2" fill="#9c4b58" />
              <circle cx="134" cy="9" r="1.9" fill="#ab8b4b" />
              <circle cx="154" cy="6" r="2.4" fill="#6d8763" />
            </svg>
            <span className="logo-text">盆栽ブランチ</span>
          </button>
          <span className="title-en">bonsai branch</span>
        </h1>
      </header>

      {view === 'home' ? (
        <section className="home">
          <div className="home-tree" aria-hidden="true">
            <Bonsai
              state={heroState}
              containerAspect={
                isMobile ? HERO_ASPECT_MOBILE : HERO_ASPECT_DESKTOP
              }
              isMobile={isMobile}
              bloomCount={heroBloomCount}
              bare
            />
          </div>

          {/* 盆栽展では木の手前に札が置かれ、銘と樹種と樹歴が書かれている。
              このアプリの素性もその型で出す */}
          <div className="plate">
            <p className="plate-name">盆栽を育てる気分で、git に慣れる</p>
            <p className="plate-desc">
              PR を取り込む、こじれたブランチを整える、間違いを巻き戻す——
              現場でよくある git のシーンを、コマンドを打たずに手で覚える。
            </p>
            <dl className="plate-spec">
              <div className="plate-row">
                <dt>お題</dt>
                <dd>{stages.length} 問</dd>
              </div>
              <div className="plate-row">
                <dt>扱う操作</dt>
                <dd className="plate-ops">{HOME_OPS.join('・')}</dd>
              </div>
              <div className={`plate-row ${isAllCleared ? 'done' : ''}`}>
                <dt>樹歴</dt>
                <dd>
                  {isAllCleared
                    ? `全 ${stages.length} 問 制覇`
                    : cleared.size > 0
                      ? `${cleared.size} 問まで`
                      : 'まだ手をつけていない'}
                </dd>
              </div>
            </dl>
            <div className="home-cta">
              {/* 全部終わっている人に「続きから」は出さない。続きが無いので */}
              {isAllCleared ? (
                <>
                  <button
                    type="button"
                    className="btn primary home-start"
                    onClick={() => startFresh(0)}
                  >
                    もう一度あそぶ　#01
                  </button>
                  {/* 解き直している途中で戻ってきた人が、その問題に帰れるように */}
                  {stageIndex !== 0 && (
                    <button
                      type="button"
                      className="btn home-start-from-zero"
                      onClick={() => setView('play')}
                    >
                      #{String(stageIndex + 1).padStart(2, '0')} を開く
                    </button>
                  )}
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn primary home-start"
                    onClick={() => setView('play')}
                  >
                    {cleared.size > 0
                      ? `続きから　#${String(stageIndex + 1).padStart(2, '0')}`
                      : 'はじめる'}
                  </button>
                  {cleared.size > 0 && stageIndex !== 0 && (
                    <button
                      type="button"
                      className="btn home-start-from-zero"
                      onClick={() => startFresh(0)}
                    >
                      はじめから見直す
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="home-howto">
            <p className="home-howto-title">あそびかた</p>
            <ol className="home-howto-list">
              <li>
                <span className="home-howto-step">一</span>
                お題を読んで、合いそうな操作を選ぶ
              </li>
              <li>
                <span className="home-howto-step">二</span>
                枝の先（HEAD）をつかんで、別の枝の先にドラッグ。
                つかまずに、選ぶ → 相手を選ぶ でも同じ
              </li>
              <li>
                <span className="home-howto-step">三</span>
                お題どおりの形に整えばクリア（見本は「答えを見る」でいつでも）
              </li>
            </ol>
          </div>
        </section>
      ) : (
      <>
      <nav className="rail" aria-label="ステージ">
        <button
          className="rail-btn"
          onClick={() => gotoStage(stageIndex - 1)}
          disabled={stageIndex === 0}
          title="前の問（Shift + ←）"
          aria-label="前の問"
        >
          ←
        </button>
        <div className="dots">
          {stages.map((s, i) => {
            const locked = i > maxUnlockedIndex;
            return (
              <button
                key={s.id}
                className={`dot ${i === stageIndex ? 'current' : ''} ${cleared.has(s.id) ? 'done' : ''} ${locked ? 'locked' : ''}`}
                onClick={() => gotoStage(i)}
                disabled={locked}
                title={locked ? '前の問をクリアすると開放' : `${i + 1}. ${s.title}`}
                aria-label={locked ? '未開放の問' : s.title}
              />
            );
          })}
        </div>
        <button
          className="rail-btn"
          onClick={() => gotoStage(stageIndex + 1)}
          disabled={
            stageIndex === stages.length - 1 || stageIndex >= maxUnlockedIndex
          }
          title="次の問（Shift + →）"
          aria-label="次の問"
        >
          →
        </button>
      </nav>

      <section className="prompt">
        <div className="meta">
          <span className="meta-num">
            #{String(stageIndex + 1).padStart(2, '0')}
          </span>
          <span className="meta-chapter">{stage.chapter}</span>
          {/* 初見なのか解き直しているのかが分かるようにする */}
          {cleared.has(stage.id) && !isCleared && (
            <span className="meta-cleared">クリア済み</span>
          )}
        </div>
        <h2 className="t">{stage.title}</h2>
        <p className="d">{stage.description}</p>
        <div className="actions">
          <div className="modes">
            {MODE_GROUPS.map((group) => (
              <div className="mode" key={group.label} data-group={group.label}>
                <span className="mode-group-label">{group.label}</span>
                {group.modes.map((m) => (
                  <button
                    key={m}
                    className={`mode-btn mode-${m} ${mode === m ? 'on' : ''}`}
                    onClick={() => setMode(m)}
                    disabled={activeBranch !== null}
                  >
                    <span className={`mdot mdot-${m}`} />
                    {MODE_LABELS[m]}
                  </button>
                ))}
              </div>
            ))}
          </div>
          <div className="hint-wrap" id="hint-wrap">
            <button
              type="button"
              className="hint-link"
              aria-expanded={hintOpen}
              onClick={() => setHintOpen((v) => !v)}
            >
              <span className="hint-icon">?</span>
              ヒント
            </button>
            {/* 考え方 → 操作の順。先に判断基準を読ませ、操作は区切りの下に置く */}
            <div id="hint-tooltip" className="hint-tooltip">
              <strong>ヒント</strong>
              <p>{stage.idea}</p>
              <p className="hint-move">{stage.hint}</p>
            </div>
          </div>
        </div>
      </section>

      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveBranch(null)}
      >
        <main className="boards">
          <section className="board">
            <header className="bh">
              <span className="lbl your">いま</span>
            </header>
            {/* キーボードと支援技術の入口。SVG 内の図形に role を持たせても
                環境によって読まれないため、本物のボタンをここに置く。
                見た目は隠すが、フォーカス中の枝は盤面の節にリングで示す */}
            <div className="sr-only">
              {state.branchOrder.map((bid) => (
                <button
                  key={`pick-${bid}`}
                  type="button"
                  disabled={isCleared}
                  aria-pressed={picked === bid}
                  onClick={() => handlePick(bid)}
                  onFocus={() => setFocusedBranch(bid)}
                  onBlur={() => setFocusedBranch(null)}
                >
                  {picked === bid
                    ? `${state.branches[bid]?.name} の先端（選択中。相手の枝を選ぶと操作します）`
                    : `${state.branches[bid]?.name} の先端を選ぶ`}
                </button>
              ))}
            </div>
            <div className="bb">
              <div className="bb-inner" ref={yourBoxRef}>
                <Bonsai
                  state={state}
                  interactive
                  recentMergeId={recentCommitId}
                  invalidDropBranchIds={invalidDropBranchIds}
                  pickedBranchId={picked}
                  focusedBranchId={focusedBranch}
                  onPick={handlePick}
                  containerAspect={yourAspect}
                  bloomAll={isCleared}
                  isMobile={isMobile}
                  solved={isCleared}
                />
              </div>
            </div>
          </section>
          <section className={`board ${isCleared ? 'cleared' : ''}`}>
            <header className="bh">
              <span className="lbl goal">{goalRevealed ? '答え' : '目標'}</span>
              {!goalRevealed && !isCleared && (
                <button
                  className="reveal-btn"
                  onClick={() => setGoalRevealed(true)}
                  title="目標の盆栽を見る（答えを見る）"
                >
                  答えを見る
                </button>
              )}
            </header>
            <div className="bb">
              <div className="bb-inner" ref={goalBoxRef}>
              <AnimatePresence mode="wait">
                {goalRevealed ? (
                  <motion.div
                    key="goal"
                    style={{ width: '100%', height: '100%' }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <Bonsai
                      state={stage.goal}
                      containerAspect={goalAspect}
                      isMobile={isMobile}
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    key="mask"
                    className="mask"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <p className="mask-icon">？</p>
                    <p className="mask-text">操作した盆栽がこの形になれば正解</p>
                    <p className="mask-sub">クリアすると自動で答え合わせ</p>
                  </motion.div>
                )}
              </AnimatePresence>
              </div>
              <AnimatePresence>
                {isCleared && (
                  <motion.div
                    className="check"
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 280, damping: 20 }}
                  >
                    ✓
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </section>
        </main>
      </DndContext>

      <div className="cmd-line" aria-live="polite">
        <AnimatePresence mode="wait">
          {isCleared && commandLog.length > 0 ? (
            <motion.div
              key="solved"
              className="solved"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.32, ease: 'easeOut' }}
            >
              <div className="solved-head">
                <span
                  className={`solved-badge ${isFinalClear ? 'final' : ''}`}
                >
                  {isFinalClear ? '全クリア' : '正解'}
                </span>
                {commandLog.length > 1 && (
                  <span className="solved-step-count">{commandLog.length} 手</span>
                )}
              </div>
              <ol className="solved-cmds">
                {commandLog.map((cmd, i) => (
                  <li key={i} className="solved-cmd-row">
                    {commandLog.length > 1 && (
                      <span className="solved-step-num">{i + 1}</span>
                    )}
                    <code className="solved-cmd">
                      <span className="cmd-prompt">$</span>
                      <span className="cmd-text">{cmd}</span>
                    </code>
                  </li>
                ))}
              </ol>
              {isFinalClear ? (
                <p className="solved-lesson final-lesson">
                  盆栽、立派に育ちました。
                  {stages.length} 問ぜんぶ制覇、お疲れさまでした。
                  もう「どの操作を選ぶか」で迷う場面は、だいぶ減っているはずです。
                </p>
              ) : (
                stage.lesson && (
                  <p className="solved-lesson">{stage.lesson}</p>
                )
              )}
            </motion.div>
          ) : opError ? (
            <motion.div
              key="op-error"
              className="op-error"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              <span className="op-error-mark" aria-hidden="true" />
              {opError.text}
            </motion.div>
          ) : picked ? (
            <motion.div
              key="pick-hint"
              className="pick-hint"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              <span className="pick-hint-name">
                {state.branches[picked]?.name}
              </span>
              を選びました。次に相手の枝の先を選んでください（同じ枝を選ぶか
              Esc でやめる）
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <footer className="foot">
        {/* 操作モードの reset (git reset) と紛れないよう、盤面側の 2 つは
            git の語を避けた名前にする */}
        <button
          className="btn"
          onClick={undo}
          disabled={history.length === 0}
          title="一手戻す（Z）"
        >
          一手戻す
        </button>
        <button className="btn" onClick={reset} title="最初から（R）">
          最初から
        </button>
        {isCleared && stageIndex < stages.length - 1 && (
          <button
            className="btn primary"
            onClick={() => gotoStage(stageIndex + 1)}
          >
            次へ →
          </button>
        )}
        {/* 解き終えた問題を開き直しているときは、ここからホームに戻れないと
            ロゴを押すしか手が無くなる。全クリアの回だけは主役として出す。
            初めて解いた直後は「次へ」が主役なので、並べて出さない */}
        {(isFinalClear || (cleared.has(stage.id) && !isCleared)) && (
          <button
            className={`btn ${isFinalClear ? 'primary' : ''}`}
            onClick={() => setView('home')}
          >
            ホームへ →
          </button>
        )}
      </footer>
      </>
      )}

    </motion.div>
    </MotionConfig>
  );
}
