import { memo, useState, useRef, useCallback } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Dice1, Lock, Unlock, Trash2, Loader2, Wand2, Edit3, ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import type { Direction, NodeStatus } from '@/types';

export type CanvasNodeData = {
  title: string;
  content: string;
  taskId: string | null;
  status: NodeStatus;
  highlighted: boolean;
  version: number;
  color: string;
  onReroll?: (nodeId: string) => void;
  onLock?: (nodeId: string) => void;
  onDelete?: (nodeId: string) => void;
  onOptimize?: (nodeId: string) => void;
  onEdit?: (nodeId: string) => void;
  onExpand?: (nodeId: string, direction: Direction) => void;
  isGenerating?: boolean;
};

const DIRECTION_ICONS: Record<Direction, typeof ArrowUp> = {
  up: ArrowUp, down: ArrowDown, left: ArrowLeft, right: ArrowRight,
};

const DARK = {
  bg: 'linear-gradient(135deg, #0d0d1a 0%, #13132a 100%)',
  border: 'rgba(59, 59, 82, 0.5)',
  text: '#e2e8f0',
  textSecondary: '#94a3b8',
  shadow: '0 4px 16px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.03)',
  actionBg: 'rgba(18,18,35,0.97)',
  actionBorder: 'rgba(99, 102, 241, 0.25)',
  actionShadow: '0 8px 32px rgba(0,0,0,0.6), 0 0 16px rgba(99,102,241,0.15)',
  overlayBg: 'rgba(13,13,26,0.92)',
  handleBorder: '#0d0d1a',
};

const LIGHT = {
  bg: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
  border: 'rgba(203, 213, 225, 0.8)',
  text: '#1e293b',
  textSecondary: '#475569',
  shadow: '0 2px 8px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)',
  actionBg: 'rgba(255,255,255,0.97)',
  actionBorder: 'rgba(99, 102, 241, 0.25)',
  actionShadow: '0 8px 32px rgba(0,0,0,0.1), 0 0 12px rgba(99,102,241,0.08)',
  overlayBg: 'rgba(248,250,252,0.92)',
  handleBorder: '#e2e8f0',
};

function CustomNode({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as CanvasNodeData;
  const { lightMode } = useTheme();
  const isLocked = nodeData.status === 'locked';
  const isDeleted = nodeData.status === 'deleted';
  const [showActions, setShowActions] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = useCallback(() => {
    if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
    setShowActions(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    hideTimerRef.current = setTimeout(() => setShowActions(false), 400);
  }, []);

  if (isDeleted) return null;

  const t = lightMode ? LIGHT : DARK;

  const borderColor = nodeData.highlighted
    ? nodeData.color
    : selected
    ? '#818cf8'
    : t.border;

  return (
    <div
      className={`
        group relative rounded-xl transition-all duration-300 cursor-pointer
        ${!nodeData.highlighted && !selected ? 'opacity-45 hover:opacity-75' : ''}
        ${nodeData.isGenerating ? 'animate-pulse' : ''}
      `}
      style={{
        minWidth: 200,
        maxWidth: 320,
        background: t.bg,
        border: `1.5px solid ${borderColor}`,
        boxShadow: selected || nodeData.highlighted
          ? `0 0 20px ${nodeData.color}40, inset 0 0 20px ${nodeData.color}08`
          : t.shadow,
        backdropFilter: 'blur(4px)',
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Top accent bar */}
      <div
        className="absolute top-0 left-3 right-3 h-[2px] rounded-b opacity-60"
        style={{ background: `linear-gradient(90deg, transparent, ${nodeData.color}, transparent)` }}
      />

      {/* Corner accents */}
      <div className="absolute top-1.5 left-1.5 w-1.5 h-1.5 rounded-full opacity-40" style={{ backgroundColor: nodeData.color }} />
      <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full opacity-40" style={{ backgroundColor: nodeData.color }} />
      <div className="absolute bottom-1.5 left-1.5 w-1.5 h-1.5 rounded-full opacity-40" style={{ backgroundColor: nodeData.color }} />
      <div className="absolute bottom-1.5 right-1.5 w-1.5 h-1.5 rounded-full opacity-40" style={{ backgroundColor: nodeData.color }} />

      {/* Source handles */}
      {(['top', 'bottom', 'left', 'right'] as const).map((pos) => (
        <Handle
          key={`source-${pos}`}
          type="source"
          position={Position[pos.charAt(0).toUpperCase() + pos.slice(1) as 'Top' | 'Bottom' | 'Left' | 'Right']}
          id={pos}
          className="!w-3 !h-3 !border-2 !bg-indigo-400/80 transition-all duration-200 hover:!w-4 hover:!h-4 hover:!bg-indigo-300"
          style={{ borderColor: t.handleBorder, opacity: showActions ? 1 : 0.3 }}
        />
      ))}

      {/* Target handles (invisible) */}
      {(['top', 'bottom', 'left', 'right'] as const).map((pos) => (
        <Handle
          key={`target-${pos}`}
          type="target"
          position={Position[pos.charAt(0).toUpperCase() + pos.slice(1) as 'Top' | 'Bottom' | 'Left' | 'Right']}
          id={`target-${pos}`}
          className="!bg-transparent !w-3 !h-3 !border-0"
          style={{ opacity: 0 }}
        />
      ))}

      <div className="px-4 py-3">
        <div className="flex items-center justify-between mb-2 min-h-[18px]">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: nodeData.color, boxShadow: `0 0 6px ${nodeData.color}80` }} />
            <span className="text-[10px] text-gray-600 font-mono tracking-wider uppercase">
              {isLocked ? 'LOCKED' : 'DRAFT'}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {nodeData.version > 1 && <span className="text-[10px] text-gray-600 font-mono">v{nodeData.version}</span>}
            {isLocked && <Lock className="w-3 h-3 text-emerald-400" style={{ filter: 'drop-shadow(0 0 4px rgba(52,211,153,0.5))' }} />}
          </div>
        </div>

        <h4 className="font-semibold text-sm mb-1.5 truncate leading-snug" style={{ color: t.text }}>
          {nodeData.title || '未命名'}
        </h4>

        <div className="h-px mb-1.5 opacity-20" style={{ background: `linear-gradient(90deg, transparent, ${nodeData.color}80, transparent)` }} />

        <p className="text-xs leading-relaxed line-clamp-3 font-sans" style={{ color: t.textSecondary }}>
          {nodeData.content || '生成中...'}
        </p>
      </div>

      {nodeData.isGenerating && (
        <div className="absolute inset-0 rounded-xl flex items-center justify-center z-10" style={{ background: t.overlayBg, backdropFilter: 'blur(2px)' }}>
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
            <span className="text-[10px] text-indigo-400/70 font-mono">GENERATING</span>
          </div>
        </div>
      )}

      <div
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`
          absolute left-1/2 -translate-x-1/2 flex items-center gap-0.5
          rounded-xl p-1 z-20
          transition-all duration-300 ease-out
          ${showActions && !nodeData.isGenerating
            ? 'opacity-100 -bottom-11 translate-y-0 pointer-events-auto'
            : 'opacity-0 -bottom-8 translate-y-2 pointer-events-none'
          }
        `}
        style={{
          background: t.actionBg,
          border: `1px solid ${t.actionBorder}`,
          boxShadow: t.actionShadow,
          backdropFilter: 'blur(12px)',
        }}
      >
        {(['up', 'down', 'left', 'right'] as Direction[]).map((dir) => {
          const Icon = DIRECTION_ICONS[dir];
          const colors: Record<Direction, string> = {
            up: 'hover:text-violet-400 hover:bg-violet-500/15',
            down: 'hover:text-cyan-400 hover:bg-cyan-500/15',
            left: 'hover:text-amber-400 hover:bg-amber-500/15',
            right: 'hover:text-emerald-400 hover:bg-emerald-500/15',
          };
          return (
            <button key={dir} onClick={(e) => { e.stopPropagation(); nodeData.onExpand?.(id, dir); }}
              className={`w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 transition-all duration-150 hover:scale-110 ${colors[dir]}`}>
              <Icon className="w-3.5 h-3.5" />
            </button>
          );
        })}

        <div className="w-px h-4 bg-white/10 mx-0.5" />

        <button onClick={(e) => { e.stopPropagation(); nodeData.onReroll?.(id); }}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:text-amber-400 hover:bg-amber-500/15 transition-all duration-150 hover:scale-110">
          <Dice1 className="w-3.5 h-3.5" />
        </button>
        <button onClick={(e) => { e.stopPropagation(); nodeData.onOptimize?.(id); }}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:text-cyan-400 hover:bg-cyan-500/15 transition-all duration-150 hover:scale-110">
          <Wand2 className="w-3.5 h-3.5" />
        </button>
        <button onClick={(e) => { e.stopPropagation(); nodeData.onEdit?.(id); }}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:text-indigo-400 hover:bg-indigo-500/15 transition-all duration-150 hover:scale-110">
          <Edit3 className="w-3.5 h-3.5" />
        </button>
        <button onClick={(e) => { e.stopPropagation(); nodeData.onLock?.(id); }}
          className={`w-7 h-7 flex items-center justify-center rounded-lg transition-all duration-150 hover:scale-110 ${
            isLocked ? 'text-emerald-400 hover:bg-emerald-500/15' : 'text-gray-500 hover:text-emerald-400 hover:bg-emerald-500/15'
          }`}>
          {isLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
        </button>
        <button onClick={(e) => { e.stopPropagation(); nodeData.onDelete?.(id); }}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/15 transition-all duration-150 hover:scale-110">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export default memo(CustomNode);
