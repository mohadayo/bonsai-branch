import { useDraggable, useDroppable } from '@dnd-kit/core';
import { motion, AnimatePresence } from 'framer-motion';
import { useMemo, type ReactElement } from 'react';
import { computeGenerations, hashOf } from '../lib/dag';
import type { BonsaiState, Commit } from '../types';

const MIN_ASPECT = 0.6; // 縦長制限（width / height）
const MAX_ASPECT = 2.0; // 横長制限

const COL_W = 140;
const ROW_H_DEFAULT = 70;
const ROW_H_MIN = 48;
const MAX_TRUNK_HEIGHT = 220;
const PAD_X = 80;
const PAD_X_RIGHT = 180;
const PAD_TOP = 60;
const PAD_BOTTOM = 96;
const NODE_R = 13;

interface Pos {
  x: number;
  y: number;
}
interface LayoutResult {
  width: number;
  height: number;
  positions: Record<string, Pos>;
  potCenterX: number;
  potY: number;
  offsetX: number;
  padX: number;
}

function layout(
  state: BonsaiState,
  containerAspect: number | null,
  isMobile: boolean,
): LayoutResult {
  // モバイルでは左右パディングを詰めて、 縦長コンテナでも上下に余白が出すぎないようにする。
  // padXRight はコミットメッセージ (例: "ログインフォーム追加" = 約 120px) が右端で
  // 見切れない長さを確保する。 NODE_R(13) + 10 + 文字幅 = 約 145px なので 150 を採用。
  const padX = isMobile ? 36 : PAD_X;
  const padXRight = isMobile ? 150 : PAD_X_RIGHT;

  const generations = computeGenerations(state);
  const branchIndex: Record<string, number> = {};
  state.branchOrder.forEach((id, i) => {
    branchIndex[id] = i;
  });
  let maxGen = 0;
  for (const c of Object.values(state.commits)) {
    const g = generations[c.id] ?? 0;
    if (g > maxGen) maxGen = g;
  }
  const rowH =
    maxGen > 0
      ? Math.max(ROW_H_MIN, Math.min(ROW_H_DEFAULT, MAX_TRUNK_HEIGHT / maxGen))
      : ROW_H_DEFAULT;
  const positions: Record<string, Pos> = {};
  for (const c of Object.values(state.commits)) {
    const g = generations[c.id] ?? 0;
    const bi = branchIndex[c.branch] ?? 0;
    positions[c.id] = {
      x: padX + bi * COL_W,
      y: PAD_TOP + (maxGen - g) * rowH,
    };
  }
  const branchCount = Math.max(1, state.branchOrder.length);
  const naturalW = padX + padXRight + (branchCount - 1) * COL_W;
  const naturalH = PAD_TOP + maxGen * rowH + PAD_BOTTOM;

  // コンテナのアスペクトに viewBox を合わせて、中身を中央寄せで配置
  let width = naturalW;
  let height = naturalH;
  if (containerAspect !== null && Number.isFinite(containerAspect)) {
    const aspect = Math.max(MIN_ASPECT, Math.min(MAX_ASPECT, containerAspect));
    const naturalAspect = naturalW / naturalH;
    if (aspect > naturalAspect) {
      // コンテナが横長 → viewBox 幅を伸ばす
      width = naturalH * aspect;
    } else {
      // コンテナが縦長 → viewBox 高さを伸ばす
      height = naturalW / aspect;
    }
  }
  // 中身 (commit dot 列 + 右側のコミットメッセージ枠) を含めて中央寄せする。
  // モバイルで commit dot 列だけを viewBox 中央に置くと、 メッセージ表示用の右余白が
  // viewBox 外にはみ出して文字が切れるため、 desktop と同じく naturalW 全体で中央寄せ。
  const offsetX = (width - naturalW) / 2;
  const offsetY = (height - naturalH) / 2;
  for (const id of Object.keys(positions)) {
    const p = positions[id]!;
    positions[id] = { x: p.x + offsetX, y: p.y + offsetY };
  }
  const potCenterX = width / 2;
  const potY = height - 56;
  return { width, height, positions, potCenterX, potY, offsetX, padX };
}

function Pot({ cx, cy }: { cx: number; cy: number }): ReactElement {
  return (
    <g transform={`translate(${cx}, ${cy})`}>
      <ellipse cx={0} cy={42} rx={92} ry={9} fill="rgba(0,0,0,0.32)" />
      <path
        d="M -78 0 L 78 0 L 64 36 Q 64 42 56 42 L -56 42 Q -64 42 -64 36 Z"
        fill="#5b3a25"
      />
      <ellipse cx={0} cy={0} rx={78} ry={9} fill="#3a2417" />
      <ellipse cx={0} cy={-1} rx={74} ry={7} fill="#231509" />
      <path
        d="M -56 14 Q 0 22 56 14"
        stroke="#3a2417"
        strokeWidth={1.2}
        fill="none"
        opacity={0.5}
      />
      <text
        x={0}
        y={28}
        textAnchor="middle"
        fontSize={9}
        fill="#c98855"
        fontFamily="'Shippori Mincho', serif"
        opacity={0.8}
      >
        盆
      </text>
      <ellipse cx={-30} cy={-3} rx={20} ry={3} fill="#5e8c4a" opacity={0.55} />
      <ellipse cx={26} cy={-3} rx={18} ry={3} fill="#7aa05a" opacity={0.5} />
    </g>
  );
}

function curvyPath(a: Pos, b: Pos, sway: number): string {
  const mx = (a.x + b.x) / 2 + sway;
  const my = (a.y + b.y) / 2;
  return `M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`;
}

function Edges({
  state,
  positions,
}: {
  state: BonsaiState;
  positions: Record<string, Pos>;
}): ReactElement {
  const elems: ReactElement[] = [];
  for (const c of Object.values(state.commits)) {
    const cp = positions[c.id];
    if (!cp) continue;
    for (let pi = 0; pi < c.parents.length; pi++) {
      const pid = c.parents[pi]!;
      const pp = positions[pid];
      if (!pp) continue;
      const branchColor = state.branches[c.branch]?.color ?? '#7a5e3a';
      const parentBranch = state.commits[pid]?.branch;
      const isCrossBranch = parentBranch !== c.branch;
      const isMerge = c.parents.length > 1;
      const sway = pi === 0 ? 0 : 10;
      const d = curvyPath(cp, pp, sway);
      elems.push(
        <path
          key={`${c.id}-${pid}-shadow`}
          d={d}
          stroke="rgba(0,0,0,0.3)"
          strokeWidth={isCrossBranch ? 4 : 6}
          fill="none"
          strokeLinecap="round"
          transform="translate(1.2, 1.2)"
        />,
      );
      elems.push(
        <path
          key={`${c.id}-${pid}`}
          d={d}
          stroke={isCrossBranch && isMerge ? '#a98660' : branchColor}
          strokeWidth={isCrossBranch ? 3.5 : 5.5}
          fill="none"
          strokeLinecap="round"
        />,
      );
      // 木目の縦線
      elems.push(
        <path
          key={`${c.id}-${pid}-grain`}
          d={d}
          stroke="rgba(60, 30, 10, 0.35)"
          strokeWidth={0.8}
          fill="none"
          strokeLinecap="round"
          strokeDasharray="6 10"
        />,
      );
      elems.push(
        <path
          key={`${c.id}-${pid}-hl`}
          d={d}
          stroke="rgba(255, 235, 200, 0.32)"
          strokeWidth={1}
          fill="none"
          strokeLinecap="round"
        />,
      );
    }
  }
  return <>{elems}</>;
}

function Leaves({
  pos,
  color,
}: {
  pos: Pos;
  color: string;
}): ReactElement {
  return (
    <g transform={`translate(${pos.x}, ${pos.y})`} pointerEvents="none">
      <ellipse
        cx={-15}
        cy={-12}
        rx={9}
        ry={4.5}
        fill={color}
        opacity={0.55}
        transform="rotate(-32 -15 -12)"
      />
      <ellipse
        cx={14}
        cy={-14}
        rx={9}
        ry={4.5}
        fill={color}
        opacity={0.55}
        transform="rotate(28 14 -14)"
      />
      <ellipse
        cx={2}
        cy={-22}
        rx={7}
        ry={3.5}
        fill={color}
        opacity={0.4}
      />
    </g>
  );
}

function HeadFlag({
  pos,
  color,
  branchName,
}: {
  pos: Pos;
  color: string;
  branchName: string;
}): ReactElement {
  const flagW = 38;
  const flagH = 14;
  return (
    <g
      transform={`translate(${pos.x + 22}, ${pos.y - 40})`}
      pointerEvents="none"
    >
      <line
        x1={0}
        y1={0}
        x2={0}
        y2={flagH + 8}
        stroke="#3a2417"
        strokeWidth={1.3}
        strokeLinecap="round"
      />
      <path
        d={`M 0 -1 L ${flagW} 3 L ${flagW - 8} ${flagH / 2} L ${flagW} ${flagH - 1} L 0 ${flagH - 2} Z`}
        fill={color}
        stroke="#3a2417"
        strokeWidth={0.8}
      />
      <text
        x={flagW / 2 - 4}
        y={flagH / 2 + 2.5}
        fontSize={6.5}
        fill="#fff"
        fontFamily="'JetBrains Mono', monospace"
        fontWeight={700}
        letterSpacing={0.5}
        textAnchor="middle"
      >
        HEAD
      </text>
      <text
        x={2}
        y={-3}
        fontSize={8}
        fill="#3a2417"
        fontFamily="'JetBrains Mono', monospace"
        opacity={0.75}
      >
        {branchName}
      </text>
    </g>
  );
}

function DropTarget({
  branchId,
  pos,
  color,
  invalid,
  enabled,
}: {
  branchId: string;
  pos: Pos;
  color: string;
  invalid: boolean;
  enabled: boolean;
}): ReactElement | null {
  const { setNodeRef, isOver } = useDroppable({
    id: `tip-${branchId}-drop`,
    data: { branchId },
    disabled: !enabled,
  });
  if (!enabled) return null;
  const hit = NODE_R + 30;
  return (
    <g transform={`translate(${pos.x}, ${pos.y})`} style={{ pointerEvents: 'none' }}>
      <rect
        ref={setNodeRef as unknown as React.Ref<SVGRectElement>}
        x={-hit}
        y={-hit}
        width={hit * 2}
        height={hit * 2}
        fill="transparent"
      />
      <AnimatePresence>
        {isOver && !invalid && (
          <>
            <motion.circle
              r={NODE_R + 18}
              fill={color}
              opacity={0.22}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 0.22 }}
              exit={{ opacity: 0 }}
              style={{ pointerEvents: 'none' }}
            />
            <motion.circle
              r={NODE_R + 12}
              fill="none"
              stroke={color}
              strokeWidth={2}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{ pointerEvents: 'none' }}
            />
          </>
        )}
        {isOver && invalid && (
          <motion.g
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ pointerEvents: 'none' }}
          >
            <circle
              r={NODE_R + 14}
              fill="none"
              stroke="#9a4a4a"
              strokeWidth={2}
              strokeDasharray="3 3"
            />
          </motion.g>
        )}
      </AnimatePresence>
    </g>
  );
}

interface CommitVisualProps {
  commit: Commit;
  color: string;
  isHead: boolean;
  isPulse: boolean;
  showMessage: boolean;
  idScope: string;
}

function CommitVisual({
  commit,
  color,
  isHead,
  isPulse,
  showMessage,
  idScope,
}: CommitVisualProps): ReactElement {
  const isMerge = commit.parents.length > 1;
  const hash = hashOf(commit.id);
  const gradId = `node-grad-${idScope}-${commit.id}`;
  return (
    <>
      <defs>
        <radialGradient id={gradId} cx="35%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#fff5e8" stopOpacity={0.9} />
          <stop offset="40%" stopColor={color} />
          <stop offset="100%" stopColor={color} stopOpacity={0.85} />
        </radialGradient>
      </defs>
      {isHead && isPulse && (
        <>
          <motion.circle
            r={NODE_R + 6}
            fill="none"
            stroke={color}
            strokeWidth={1.8}
            initial={{ opacity: 0.6, scale: 1 }}
            animate={{ opacity: [0.55, 0.1, 0.55], scale: [1, 1.45, 1] }}
            transition={{
              duration: 2.2,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
          <motion.circle
            r={NODE_R + 6}
            fill={color}
            opacity={0.18}
            animate={{ opacity: [0.18, 0.32, 0.18] }}
            transition={{
              duration: 2.2,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        </>
      )}
      <ellipse
        cx={0}
        cy={NODE_R + 1}
        rx={NODE_R - 1}
        ry={2}
        fill="rgba(0,0,0,0.28)"
      />
      <circle
        r={NODE_R}
        fill={`url(#${gradId})`}
        stroke={isMerge ? '#fff5e8' : '#1a1208'}
        strokeWidth={isMerge ? 1.6 : 1.2}
      />
      {isMerge && (
        <circle
          r={3}
          fill="rgba(255, 245, 230, 0.85)"
          stroke="#3a2010"
          strokeWidth={0.6}
        />
      )}
      {showMessage && (
        <g transform={`translate(${NODE_R + 10}, 0)`} pointerEvents="none">
          <text
            y={-2}
            fontSize={11.5}
            fill="#3a2c1a"
            fontFamily="'Zen Kaku Gothic New', system-ui, sans-serif"
            fontWeight={500}
          >
            {commit.message ?? ''}
          </text>
          <text
            y={11}
            fontSize={9}
            fill="#9b8d6f"
            fontFamily="'JetBrains Mono', monospace"
            letterSpacing={0.5}
          >
            {hash}
          </text>
        </g>
      )}
    </>
  );
}

interface CommitDotProps {
  commit: Commit;
  pos: Pos;
  color: string;
  isHead: boolean;
  draggable: boolean;
  showMessage: boolean;
  idScope: string;
}

function StaticCommitDot({
  commit,
  pos,
  color,
  isHead,
  showMessage,
  idScope,
}: Omit<CommitDotProps, 'draggable'>): ReactElement {
  return (
    <g transform={`translate(${pos.x}, ${pos.y})`}>
      <CommitVisual
        commit={commit}
        color={color}
        isHead={isHead}
        isPulse={false}
        showMessage={showMessage}
        idScope={idScope}
      />
    </g>
  );
}

function DraggableCommitDot({
  commit,
  pos,
  color,
  isHead,
  showMessage,
  idScope,
}: Omit<CommitDotProps, 'draggable'>): ReactElement {
  const { setNodeRef, listeners, attributes, transform, isDragging } =
    useDraggable({
      id: `tip-${commit.branch}`,
    });
  const dx = transform?.x ?? 0;
  const dy = transform?.y ?? 0;

  return (
    <g
      ref={setNodeRef as unknown as React.Ref<SVGGElement>}
      transform={`translate(${pos.x + dx}, ${pos.y + dy})`}
      style={{
        cursor: isDragging ? 'grabbing' : 'grab',
        touchAction: 'none',
      }}
      {...listeners}
      {...attributes}
    >
      <CommitVisual
        commit={commit}
        color={color}
        isHead={isHead}
        isPulse={isHead}
        showMessage={showMessage}
        idScope={idScope}
      />
    </g>
  );
}

function CommitDot(props: CommitDotProps): ReactElement {
  if (props.draggable) {
    const { draggable: _ignored, ...rest } = props;
    return <DraggableCommitDot {...rest} />;
  }
  const { draggable: _ignored, ...rest } = props;
  return <StaticCommitDot {...rest} />;
}

function Bloom({ at }: { at: Pos }): ReactElement {
  const petalCount = 6;
  const petalColors = ['#f7c5d4', '#f9b3c5', '#fbd9e2', '#fdeaef'];
  return (
    <g transform={`translate(${at.x}, ${at.y})`} pointerEvents="none">
      {Array.from({ length: petalCount }).map((_, i) => {
        const baseAngle = (i / petalCount) * Math.PI * 2 - Math.PI / 2;
        const distance = 18;
        const cx = Math.cos(baseAngle) * distance;
        const cy = Math.sin(baseAngle) * distance;
        return (
          <motion.g
            key={i}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{
              duration: 0.45,
              delay: i * 0.07,
              type: 'spring',
              stiffness: 220,
              damping: 16,
            }}
          >
            <ellipse
              cx={cx}
              cy={cy}
              rx={8}
              ry={5.5}
              fill={petalColors[i % petalColors.length]!}
              stroke="#d97a91"
              strokeWidth={0.7}
              transform={`rotate(${(baseAngle * 180) / Math.PI + 90}, ${cx}, ${cy})`}
            />
          </motion.g>
        );
      })}
      <motion.circle
        r={4.5}
        fill="#fff3b8"
        stroke="#d4a04a"
        strokeWidth={0.8}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ duration: 0.4, delay: 0.35 }}
      />
    </g>
  );
}

function BlossomBurst({ at }: { at: Pos }): ReactElement {
  const petalCount = 14;
  return (
    <g transform={`translate(${at.x}, ${at.y})`} pointerEvents="none">
      {Array.from({ length: petalCount }).map((_, i) => {
        const angle = (i / petalCount) * Math.PI * 2;
        const distance = 44 + (i % 3) * 8;
        const dx = Math.cos(angle) * distance;
        const dy = Math.sin(angle) * distance - 8;
        const colors = ['#f7c5d4', '#f9b3c5', '#fbd9e2', '#fdeaef'];
        const color = colors[i % colors.length]!;
        return (
          <motion.circle
            key={i}
            r={3.6}
            fill={color}
            stroke="#d97a91"
            strokeWidth={0.5}
            initial={{ x: 0, y: 0, opacity: 1, scale: 0.3 }}
            animate={{
              x: dx,
              y: dy,
              opacity: 0,
              scale: 1.3,
            }}
            transition={{ duration: 1.6, ease: 'easeOut' }}
          />
        );
      })}
      <motion.circle
        r={NODE_R + 4}
        fill="#fff3e6"
        initial={{ opacity: 0.85, scale: 0.6 }}
        animate={{ opacity: 0, scale: 2.4 }}
        transition={{ duration: 1.0, ease: 'easeOut' }}
      />
    </g>
  );
}

function AsanohaPattern({ id }: { id: string }): ReactElement {
  // 麻の葉文様（簡素化）
  return (
    <pattern
      id={id}
      width={48}
      height={42}
      patternUnits="userSpaceOnUse"
      patternTransform="rotate(0)"
    >
      <g stroke="#7a5e3a" strokeWidth={0.5} fill="none" opacity={0.18}>
        <path d="M 24 0 L 24 42" />
        <path d="M 0 21 L 48 21" />
        <path d="M 0 0 L 48 42" />
        <path d="M 48 0 L 0 42" />
        <path d="M 24 0 L 0 21 L 24 42 L 48 21 Z" />
      </g>
    </pattern>
  );
}

export function Bonsai({
  state,
  interactive = false,
  recentMergeId = null,
  invalidDropBranchIds,
  containerAspect = null,
  bloomAll = false,
  isMobile = false,
}: {
  state: BonsaiState;
  interactive?: boolean;
  recentMergeId?: string | null;
  invalidDropBranchIds?: ReadonlySet<string>;
  containerAspect?: number | null;
  bloomAll?: boolean;
  isMobile?: boolean;
}): ReactElement {
  const lay = useMemo(
    () => layout(state, containerAspect, isMobile),
    [state, containerAspect, isMobile],
  );
  const generations = useMemo(() => computeGenerations(state), [state]);
  const heads = useMemo(
    () => new Set(Object.values(state.branches).map((b) => b.head)),
    [state],
  );
  const idScope = interactive ? 'a' : 'g';
  const patternId = `asanoha-${idScope}`;
  const paperId = `paper-light-${idScope}`;

  return (
    <svg
      viewBox={`0 0 ${lay.width} ${lay.height}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ display: 'block', width: '100%', height: '100%' }}
      role="img"
      aria-label="盆栽"
    >
      <defs>
        <radialGradient id={paperId} cx="50%" cy="35%" r="80%">
          <stop offset="0%" stopColor="#f6efe1" />
          <stop offset="100%" stopColor="#e6dac0" />
        </radialGradient>
        <AsanohaPattern id={patternId} />
      </defs>
      <rect
        x={0}
        y={0}
        width={lay.width}
        height={lay.height}
        fill={`url(#${paperId})`}
        rx={6}
      />
      <rect
        x={0}
        y={0}
        width={lay.width}
        height={lay.height}
        fill={`url(#${patternId})`}
        rx={6}
      />

      {state.branchOrder.map((bid, i) => {
        const x = lay.padX + i * COL_W + lay.offsetX;
        return (
          <line
            key={`guide-${bid}`}
            x1={x}
            y1={PAD_TOP - 24}
            x2={x}
            y2={lay.height - PAD_BOTTOM + 12}
            stroke={state.branches[bid]?.color ?? '#aaa'}
            strokeWidth={0.6}
            strokeDasharray="2 5"
            opacity={0.18}
          />
        );
      })}

      <Pot cx={lay.potCenterX} cy={lay.potY} />

      {state.branchOrder.map((bid) => {
        const branch = state.branches[bid];
        if (!branch) return null;
        const branchCommits = Object.values(state.commits).filter(
          (c) => c.branch === bid,
        );
        if (branchCommits.length === 0) return null;
        let lowest = branchCommits[0]!;
        let lowestGen = generations[lowest.id] ?? 0;
        for (const c of branchCommits) {
          const g = generations[c.id] ?? 0;
          if (g < lowestGen) {
            lowest = c;
            lowestGen = g;
          }
        }
        const lowestPos = lay.positions[lowest.id];
        if (!lowestPos) return null;
        const branchIndex = state.branchOrder.indexOf(bid);
        if (lowest.parents.length === 0 && branchIndex === 0) {
          return (
            <path
              key={`trunk-${bid}`}
              d={`M ${lay.potCenterX} ${lay.potY - 6} Q ${lay.potCenterX + 10} ${(lay.potY + lowestPos.y) / 2} ${lowestPos.x} ${lowestPos.y}`}
              stroke={branch.color}
              strokeWidth={7}
              fill="none"
              strokeLinecap="round"
            />
          );
        }
        return null;
      })}

      <Edges state={state} positions={lay.positions} />

      {state.branchOrder.map((bid) => {
        const branch = state.branches[bid];
        if (!branch) return null;
        const pos = lay.positions[branch.head];
        if (!pos) return null;
        return <Leaves key={`leaves-${bid}`} pos={pos} color={branch.color} />;
      })}

      <AnimatePresence>
        {Object.values(state.commits).map((c) => {
          const pos = lay.positions[c.id];
          if (!pos) return null;
          const branch = state.branches[c.branch];
          const color = branch?.color ?? '#7a5e3a';
          const isHead = heads.has(c.id);
          return (
            <motion.g
              key={c.id}
              initial={{ opacity: 0, scale: 0.4 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              transition={{ type: 'spring', stiffness: 320, damping: 24 }}
            >
              <CommitDot
                commit={c}
                pos={pos}
                color={color}
                isHead={isHead}
                draggable={interactive && isHead}
                showMessage={interactive}
                idScope={idScope}
              />
            </motion.g>
          );
        })}
      </AnimatePresence>

      {/* HEAD 旗 */}
      {state.branchOrder.map((bid) => {
        const branch = state.branches[bid];
        if (!branch) return null;
        const pos = lay.positions[branch.head];
        if (!pos) return null;
        return (
          <HeadFlag
            key={`flag-${bid}`}
            pos={pos}
            color={branch.color}
            branchName={branch.name}
          />
        );
      })}

      {/* drop targets（head に重ねる、draggable の transform に巻き込まれない固定 g）*/}
      {interactive &&
        state.branchOrder.map((bid) => {
          const branch = state.branches[bid];
          if (!branch) return null;
          const pos = lay.positions[branch.head];
          if (!pos) return null;
          return (
            <DropTarget
              key={`drop-${bid}`}
              branchId={bid}
              pos={pos}
              color={branch.color}
              invalid={invalidDropBranchIds?.has(bid) ?? false}
              enabled={true}
            />
          );
        })}

      {state.branchOrder.map((bid, i) => {
        const cx = lay.padX + i * COL_W + lay.offsetX;
        return (
          <g key={`label-${bid}`}>
            <rect
              x={cx - 36}
              y={lay.height - 26}
              width={72}
              height={18}
              rx={9}
              fill="#3a2417"
              opacity={0.85}
            />
            <text
              x={cx}
              y={lay.height - 13}
              textAnchor="middle"
              fontSize={11}
              fill={state.branches[bid]?.color ?? '#fff'}
              fontFamily="'JetBrains Mono', ui-monospace, monospace"
              fontWeight={500}
            >
              {state.branches[bid]?.name}
            </text>
          </g>
        );
      })}

      {recentMergeId && lay.positions[recentMergeId] && (
        <BlossomBurst key={recentMergeId} at={lay.positions[recentMergeId]!} />
      )}

      {/* クリア時：最も進んだ commit 一つだけに花 */}
      {bloomAll && (() => {
        let maxGen = -1;
        let tipId: string | null = null;
        for (const c of Object.values(state.commits)) {
          const g = generations[c.id] ?? 0;
          if (g > maxGen) {
            maxGen = g;
            tipId = c.id;
          }
        }
        if (!tipId) return null;
        const pos = lay.positions[tipId];
        if (!pos) return null;
        return <Bloom at={pos} />;
      })()}
    </svg>
  );
}
