import { memo, useState, useMemo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Loader2, ChevronDown, Trash2, Zap } from 'lucide-react';
import { useLang } from '@/hooks/useLang';
import { useTheme } from '@/hooks/useTheme';

export type OptimizerNodeData = {
  prompt: string;
  taskId: string | null;
  taskOptions?: Array<{ id: string; title: string; color: string }>;
  onGenerate?: (nodeId: string, taskId: string | null) => void;
  onChangePrompt?: (nodeId: string, prompt: string) => void;
  onChangeTask?: (nodeId: string, taskId: string) => void;
  onDelete?: (nodeId: string) => void;
  isGenerating?: boolean;
  connectedTitles?: string[];
};

const MODE_KEYS = ['summarize', 'expand', 'synthesize', 'contrast', 'connect'] as const;
const MODE_COLORS: Record<string, string> = {
  summarize: '#818cf8', expand: '#a78bfa', synthesize: '#f472b6', contrast: '#fb923c', connect: '#34d399',
};

const DARK = {
  bg: 'linear-gradient(135deg, #14100c 0%, #1a1510 100%)',
  border: 'rgba(245,158,11,0.3)',
  shadow: '0 0 24px rgba(245,158,11,0.08), inset 0 0 24px rgba(245,158,11,0.03)',
  handleBorder: '#0d0d1a',
  inputBg: 'rgba(245, 158, 11, 0.06)',
  inputBorder: 'rgba(59, 59, 82, 0.45)',
  inputText: '#cbd5e1',
  dropdownBg: 'rgba(16,12,8,0.98)',
  dropdownBorder: 'rgba(245,158,11,0.2)',
  badgeBg: 'rgba(13,13,26,0.8)',
  badgeBorder: 'rgba(59,59,82,0.35)',
  genBg: 'linear-gradient(135deg, rgba(245,158,11,0.18), rgba(251,191,36,0.12))',
  genBorder: 'rgba(245,158,11,0.25)',
  genColor: '#fbbf24',
  genShadow: '0 0 20px rgba(245,158,11,0.12)',
  genDisabledBg: 'rgba(245,158,11,0.08)',
};

const LIGHT = {
  bg: 'linear-gradient(135deg, #fffbf5 0%, #fef9f0 100%)',
  border: 'rgba(245,158,11,0.3)',
  shadow: '0 0 24px rgba(245,158,11,0.06), inset 0 0 24px rgba(245,158,11,0.02)',
  handleBorder: '#e2e8f0',
  inputBg: 'rgba(245, 158, 11, 0.06)',
  inputBorder: 'rgba(203, 213, 225, 0.6)',
  inputText: '#334155',
  dropdownBg: 'rgba(255,255,255,0.98)',
  dropdownBorder: 'rgba(245,158,11,0.3)',
  badgeBg: 'rgba(241,245,249,0.8)',
  badgeBorder: 'rgba(203,213,225,0.5)',
  genBg: 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(251,191,36,0.1))',
  genBorder: 'rgba(245,158,11,0.3)',
  genColor: '#b45309',
  genShadow: '0 0 16px rgba(245,158,11,0.06)',
  genDisabledBg: 'rgba(245,158,11,0.06)',
};

function OptimizerNode({ id, data }: NodeProps) {
  const nodeData = data as unknown as OptimizerNodeData;
  const { t } = useLang();
  const { lightMode } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [taskMenuOpen, setTaskMenuOpen] = useState(false);
  const [hovered, setHovered] = useState(false);

  const s = lightMode ? LIGHT : DARK;

  const modeOptions = useMemo(() => MODE_KEYS.map((k) => ({
    value: k, label: t(`optimizer.${k}`), desc: t(`optimizer.${k}Desc`),
  })), [t]);

  const selectedPrompt = modeOptions.find((p) => p.value === nodeData.prompt);
  const accentColor = MODE_COLORS[nodeData.prompt] || '#f59e0b';

  return (
    <div
      className="relative rounded-xl transition-all duration-300"
      style={{
        minWidth: 260, maxWidth: 340, zIndex: 10,
        background: s.bg, border: `1.5px solid ${s.border}`,
        boxShadow: s.shadow, backdropFilter: 'blur(4px)',
      }}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    >
      <div className="absolute top-0 left-3 right-3 h-[2px] rounded-b opacity-50"
        style={{ background: 'linear-gradient(90deg, transparent, #f59e0b, transparent)' }} />
      <div className="absolute top-1.5 left-1.5 w-1.5 h-1.5 rounded-full opacity-30 bg-amber-400" />
      <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full opacity-30 bg-amber-400" />
      <div className="absolute bottom-1.5 left-1.5 w-1.5 h-1.5 rounded-full opacity-30 bg-amber-400" />
      <div className="absolute bottom-1.5 right-1.5 w-1.5 h-1.5 rounded-full opacity-30 bg-amber-400" />

      <Handle type="target" position={Position.Left} id="target-left"
        className="!bg-cyan-400 !w-4 !h-4 !border-2 transition-all duration-200 hover:!w-5 hover:!h-5"
        style={{ borderColor: s.handleBorder }} isConnectable={true} isConnectableStart={false} />
      <div className="absolute left-0.5 top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none select-none">
        <div className="w-1 h-4 rounded-r bg-cyan-400/30" />
        <span className="text-[9px] font-bold text-cyan-400/70 tracking-widest uppercase">IN</span>
      </div>

      <Handle type="source" position={Position.Right} id="right"
        className="!bg-amber-400 !w-4 !h-4 !border-2 transition-all duration-200 hover:!w-5 hover:!h-5"
        style={{ borderColor: s.handleBorder }} isConnectable={true} />
      <div className="absolute right-0.5 top-1/2 -translate-y-1/2 flex items-center gap-1 flex-row-reverse pointer-events-none select-none">
        <div className="w-1 h-4 rounded-l bg-amber-400/30" />
        <span className="text-[9px] font-bold text-amber-400/70 tracking-widest uppercase">OUT</span>
      </div>

      {hovered && (
        <button onClick={(e) => { e.stopPropagation(); nodeData.onDelete?.(id); }}
          className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500/90 text-white flex items-center justify-center hover:bg-red-400 transition-all duration-150 hover:scale-110 z-20">
          <Trash2 className="w-3 h-3" />
        </button>
      )}

      <div className="px-4 py-3">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(245,158,11,0.12)', boxShadow: '0 0 10px rgba(245,158,11,0.15)' }}>
            <Zap className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div>
            <span className="text-sm font-bold text-amber-400 tracking-wide">OPTIMIZER</span>
            <div className="text-[9px] text-amber-500/50 font-mono tracking-widest">INTEGRATION NODE</div>
          </div>
        </div>

        <div className="relative mb-3">
          <button onClick={() => setMenuOpen(!menuOpen)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-all duration-200 hover:border-amber-500/30"
            style={{ background: s.inputBg, border: `1px solid ${menuOpen ? 'rgba(245,158,11,0.3)' : s.inputBorder}`, color: s.inputText }}>
            <span className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: accentColor }} />
              {selectedPrompt?.label || t('optimizer.selectMode')}
            </span>
            <ChevronDown className={`w-3 h-3 text-gray-500 transition-transform duration-200 ${menuOpen ? 'rotate-180' : ''}`} />
          </button>
          {menuOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 p-1 rounded-xl shadow-2xl z-30 animate-scale-in"
              style={{ background: s.dropdownBg, border: `1px solid ${s.dropdownBorder}`, backdropFilter: 'blur(12px)' }}>
              {modeOptions.map((p) => (
                <button key={p.value} onClick={(e) => { e.stopPropagation(); nodeData.onChangePrompt?.(id, p.value); setMenuOpen(false); }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-all duration-150 ${
                    nodeData.prompt === p.value ? 'bg-amber-500/10 text-amber-300' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                  <div className="font-medium flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: MODE_COLORS[p.value] || '#f59e0b' }} />{p.label}
                  </div>
                  <div className="text-[10px] text-gray-600 mt-0.5 ml-3">{p.desc}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {nodeData.connectedTitles && nodeData.connectedTitles.length > 0 && (
          <div className="mb-3">
            <div className="text-[10px] text-amber-500/50 font-mono tracking-wider mb-1.5 uppercase flex items-center gap-1.5">
              <span className="w-1 h-3 rounded-full bg-cyan-400/40" />{t('optimizer.connectedNodes')}
            </div>
            <div className="space-y-1 max-h-24 overflow-y-auto">
              {nodeData.connectedTitles.map((title, i) => (
                <div key={i} className="text-xs text-gray-400 truncate px-2.5 py-1 rounded-lg"
                  style={{ background: s.badgeBg, border: `1px solid ${s.badgeBorder}` }}>{title}</div>
              ))}
            </div>
          </div>
        )}

        {nodeData.taskOptions && nodeData.taskOptions.length > 0 && (
          <div className="relative mb-2">
            <div className="text-[10px] text-amber-500/50 font-mono tracking-wider mb-1.5 uppercase flex items-center gap-1.5">
              <span className="w-1 h-3 rounded-full bg-amber-400/40" />{t('optimizer.taskType')}
            </div>
            <button onClick={() => setTaskMenuOpen(!taskMenuOpen)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-all duration-200 hover:border-amber-500/30"
              style={{ background: s.inputBg, border: `1px solid ${taskMenuOpen ? 'rgba(245,158,11,0.3)' : s.inputBorder}`, color: s.inputText }}>
              <span className="truncate">{nodeData.taskOptions.find((t) => t.id === nodeData.taskId)?.title || t('canvas.selectTask')}</span>
              <ChevronDown className={`w-3 h-3 text-gray-500 transition-transform duration-200 flex-shrink-0 ml-1 ${taskMenuOpen ? 'rotate-180' : ''}`} />
            </button>
            {taskMenuOpen && (
              <div className="absolute top-full left-0 right-0 mt-1 p-1 rounded-xl shadow-2xl z-30 max-h-32 overflow-y-auto animate-scale-in"
                style={{ background: s.dropdownBg, border: `1px solid ${s.dropdownBorder}`, backdropFilter: 'blur(12px)' }}>
                {nodeData.taskOptions.map((t) => (
                  <button key={t.id} onClick={(e) => { e.stopPropagation(); nodeData.onChangeTask?.(id, t.id); setTaskMenuOpen(false); }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-all duration-150 flex items-center gap-2 ${
                      nodeData.taskId === t.id ? 'bg-amber-500/10 text-amber-300' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: t.color, boxShadow: `0 0 6px ${t.color}80` }} />{t.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <button onClick={() => nodeData.onGenerate?.(id, nodeData.taskId)} disabled={nodeData.isGenerating}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all duration-300 tracking-wider uppercase hover:scale-[1.02] active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
          style={{
            background: nodeData.isGenerating ? s.genDisabledBg : s.genBg,
            border: `1px solid ${s.genBorder}`, color: s.genColor, boxShadow: s.genShadow,
          }}>
          {nodeData.isGenerating ? (
            <><Loader2 className="w-3.5 h-3.5 animate-spin" />{t('canvas.generating')}</>
          ) : (
            <><Zap className="w-3.5 h-3.5" />{t('optimizer.generateNode')}</>
          )}
        </button>
      </div>
    </div>
  );
}

export default memo(OptimizerNode);
