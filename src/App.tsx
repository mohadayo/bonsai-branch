import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  pointerWithin,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { motion, AnimatePresence } from 'framer-motion';
import { Bonsai } from './components/Bonsai';
import { stages } from './stages';
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
  const [history, setHistory] = useState<BonsaiState[]>([]);
  const [state, setState] = useState<BonsaiState>(stage.initial);
  const [recentCommitId, setRecentCommitId] = useState<string | null>(null);
  const [commandLog, setCommandLog] = useState<string[]>([]);
  const [goalRevealed, setGoalRevealed] = useState(false);
  const yourBoxRef = useRef<HTMLDivElement>(null);
  const goalBoxRef = useRef<HTMLDivElement>(null);
  const [yourAspect, setYourAspect] = useState<number | null>(null);
  const [goalAspect, setGoalAspect] = useState<number | null>(null);
  const [activeBranch, setActiveBranch] = useState<string | null>(null);
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
  const isFinalClear =
    isCleared && stageIndex === stages.length - 1 && isAllCleared;

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
  }, [stage]);

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
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'r' || e.key === 'R') {
        reset();
      } else if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault();
        undo();
      } else if (e.key === 'ArrowRight' && (e.metaKey || e.ctrlKey)) {
        gotoStage(stageIndex + 1);
      } else if (e.key === 'ArrowLeft' && (e.metaKey || e.ctrlKey)) {
        gotoStage(stageIndex - 1);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, state, stageIndex, maxUnlockedIndex]);

  function handleDragStart(event: DragStartEvent): void {
    const id = String(event.active.id);
    const m = /^tip-(.+)$/.exec(id);
    if (m) setActiveBranch(m[1]!);
  }

  function handleDragEnd(event: DragEndEvent): void {
    setActiveBranch(null);
    const activeId = String(event.active.id);
    const overId = event.over?.id ? String(event.over.id) : null;
    if (!overId) return;
    const sourceMatch = /^tip-(.+)$/.exec(activeId);
    const targetMatch = /^tip-(.+)-drop$/.exec(overId);
    if (!sourceMatch || !targetMatch) return;
    const source = sourceMatch[1]!;
    const target = targetMatch[1]!;
    if (source === target) return;
    const result = applyOp(state, mode, source, target);
    if (!result.ok) return;
    setHistory((h) => [...h, state]);
    setState(result.state);
    setRecentCommitId(result.newCommitId);
    setCommandLog((log) => [...log, result.command]);
  }

  function reset(): void {
    setState(stage.initial);
    setHistory([]);
    setRecentCommitId(null);
    setCommandLog([]);
  }

  function undo(): void {
    setHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1]!;
      setState(prev);
      setRecentCommitId(null);
      return h.slice(0, -1);
    });
    setCommandLog((log) => log.slice(0, -1));
  }

  function gotoStage(idx: number): void {
    if (idx < 0 || idx >= stages.length) return;
    if (idx > maxUnlockedIndex) return;
    setStageIndex(idx);
  }

  return (
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
                stroke="#7a5e3a"
                strokeWidth={1.1}
                fill="none"
                strokeLinecap="round"
                opacity={0.85}
              />
              <path
                d="M 78 14 Q 84 6 92 3"
                stroke="#7a5e3a"
                strokeWidth={0.8}
                fill="none"
                strokeLinecap="round"
                opacity={0.7}
              />
              <path
                d="M 120 17 Q 126 11 134 9"
                stroke="#7a5e3a"
                strokeWidth={0.8}
                fill="none"
                strokeLinecap="round"
                opacity={0.7}
              />
              <circle cx="42" cy="14" r="2.6" fill="#7a8b56" />
              <circle cx="78" cy="14" r="2.2" fill="#a47b35" />
              <circle cx="92" cy="3" r="1.9" fill="#7a8b56" />
              <circle cx="120" cy="17" r="2.2" fill="#c44a3a" />
              <circle cx="134" cy="9" r="1.9" fill="#a47b35" />
              <circle cx="154" cy="6" r="2.4" fill="#7a8b56" />
            </svg>
            <span className="logo-text">盆栽ブランチ</span>
            <svg
              className="logo-pot"
              viewBox="0 0 28 12"
              aria-hidden="true"
            >
              <ellipse cx="14" cy="10" rx="12" ry="1.4" fill="rgba(31,22,13,0.22)" />
              <path
                d="M 2 2 L 26 2 L 22 9 Q 22 10.5 20 10.5 L 8 10.5 Q 6 10.5 6 9 Z"
                fill="#5b3a25"
              />
              <ellipse cx="14" cy="2" rx="12" ry="1.2" fill="#3a2417" />
            </svg>
          </button>
          <span className="title-en">bonsai branch</span>
        </h1>
        <div className="overall">
          <span className="overall-label">クリア</span>
          <span className="overall-value">{cleared.size}</span>
          <span className="overall-of">/ {stages.length}</span>
        </div>
      </header>

      {view === 'home' ? (
        <section className="home">
          {isAllCleared && (
            <div className="home-allcleared">
              <span className="home-allcleared-badge">全クリア</span>
              <p className="home-allcleared-text">
                {stages.length} 問ぜんぶ制覇しました
              </p>
            </div>
          )}
          <p className="home-tagline">盆栽を育てる気分で、git に慣れる</p>
          <p className="home-desc">
            PR を取り込む、こじれたブランチを整える、間違いを巻き戻す——
            現場でよくある git のシーンを、ドラッグだけで覚える 20 問のパズル。
          </p>
          <div className="home-howto">
            <h3 className="home-howto-title">あそびかた</h3>
            <ol className="home-howto-list">
              <li>お題を読んで、合いそうな操作（merge・rebase・cherry-pick など）を選ぶ</li>
              <li>枝の先（HEAD）をつかんで、別の枝の先にドラッグ</li>
              <li>見本と同じ形になればクリア。次のお題に進める</li>
            </ol>
          </div>
          <div className="home-cta">
            <button
              type="button"
              className="btn primary home-start"
              onClick={() => setView('play')}
            >
              {cleared.size > 0 ? `続きから（#${String(stageIndex + 1).padStart(2, '0')}）` : 'はじめる'}
            </button>
            {cleared.size > 0 && stageIndex !== 0 && (
              <button
                type="button"
                className="btn home-start-from-zero"
                onClick={() => {
                  setStageIndex(0);
                  setView('play');
                }}
              >
                #01 から見直す
              </button>
            )}
          </div>
        </section>
      ) : (
      <>
      <nav className="rail" aria-label="ステージ">
        <button
          className="rail-btn"
          onClick={() => gotoStage(stageIndex - 1)}
          disabled={stageIndex === 0}
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
          <div className="hint-wrap">
            <button
              type="button"
              className="hint-link"
              aria-describedby="hint-tooltip"
              tabIndex={0}
            >
              <span className="hint-icon">?</span>
              ヒント
            </button>
            <div
              id="hint-tooltip"
              role="tooltip"
              className="hint-tooltip"
            >
              <strong>ヒント</strong>
              <p>{stage.hint}</p>
            </div>
          </div>
        </div>
      </section>

      <DndContext
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <main className="boards">
          <section className="board">
            <header className="bh">
              <span className="lbl your">いま</span>
            </header>
            <div className="bb">
              <div className="bb-inner" ref={yourBoxRef}>
                <Bonsai
                  state={state}
                  interactive
                  recentMergeId={recentCommitId}
                  invalidDropBranchIds={invalidDropBranchIds}
                  containerAspect={yourAspect}
                  bloomAll={isCleared}
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
                  盆栽、立派に育ちました。20 問ぜんぶ制覇、お疲れさまでした。
                  ここまで来た方は merge / rebase / cherry-pick / squash / revert / reset
                  を実務シナリオで判断できる素地があります。
                </p>
              ) : (
                stage.lesson && (
                  <p className="solved-lesson">{stage.lesson}</p>
                )
              )}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <footer className="foot">
        <button
          className="btn"
          onClick={undo}
          disabled={history.length === 0}
        >
          戻す
        </button>
        <button className="btn" onClick={reset}>
          リセット
        </button>
        {isCleared && stageIndex < stages.length - 1 && (
          <button
            className="btn primary"
            onClick={() => gotoStage(stageIndex + 1)}
          >
            次へ →
          </button>
        )}
        {isFinalClear && (
          <button
            className="btn primary"
            onClick={() => setView('home')}
          >
            ホームへ →
          </button>
        )}
      </footer>
      </>
      )}

    </motion.div>
  );
}
