import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useNav } from '@/hooks/useNav';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  type Node,
  type Edge,
  MarkerType,
  BackgroundVariant,
  ConnectionMode,
  SelectionMode,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { useLang } from '@/hooks/useLang';
import { supabase } from '@/lib/supabase';
import { api } from '@/lib/api';
import type {
  Project,
  Task,
  CanvasNode,
  Direction,
  NodeStatus,
} from '@/types';
import CustomNode from '@/components/canvas/CustomNode';
import type { CanvasNodeData } from '@/components/canvas/CustomNode';
import OptimizerNode from '@/components/canvas/OptimizerNode';
import type { OptimizerNodeData } from '@/components/canvas/OptimizerNode';
import {
  ArrowLeft,
  FileText,
  Loader2,
  ChevronRight,
  ChevronLeft,
  Layers,
  Wand2,
  Sparkles,
  PlusCircle,
  Settings,
  PenSquare,
  Edit3,
  Crosshair,
  Wrench,
  Sun,
  Moon,
  Globe,
  Lock,
  Trash2,
  Clock,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import toast from 'react-hot-toast';

// ──── Constants ────

const NODE_TYPES = { custom: CustomNode, optimizer: OptimizerNode };

const DIRECTION_OFFSET: Record<Direction, { x: number; y: number }> = {
  up: { x: 0, y: -200 },
  down: { x: 0, y: 200 },
  left: { x: -300, y: 0 },
  right: { x: 300, y: 0 },
};

/** Map direction → { parent source handle, child target handle } */
const HANDLE_MAP: Record<Direction, { source: string; target: string }> = {
  up: { source: 'top', target: 'target-bottom' },
  down: { source: 'bottom', target: 'target-top' },
  left: { source: 'left', target: 'target-right' },
  right: { source: 'right', target: 'target-left' },
};

// ──── Helper: map DB node to React Flow node ────

function toFlowNode(
  dbNode: CanvasNode,
  highlighted: boolean,
  color: string,
  handlers: {
    onReroll: (id: string) => void;
    onLock: (id: string) => void;
    onDelete: (id: string) => void;
    onOptimize: (id: string) => void;
    onEdit: (id: string) => void;
    onExpand: (id: string, dir: Direction) => void;
  }
): Node<CanvasNodeData> {
  return {
    id: dbNode.id,
    type: 'custom',
    position: { x: dbNode.position_x, y: dbNode.position_y },
    data: {
      title: dbNode.title,
      content: dbNode.content,
      taskId: dbNode.task_id,
      status: dbNode.status,
      highlighted,
      color,
      version: dbNode.version,
      isGenerating: false,
      ...handlers,
    },
  };
}

// ──── Page ────

export default function CanvasPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { user, loading: authLoading } = useAuth();
  const { lightMode, toggleTheme } = useTheme();
  const { lang, setLang, t } = useLang();
  const { go } = useNav();

  // Data
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [dbNodes, setDbNodes] = useState<CanvasNode[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatingNodeId, setGeneratingNodeId] = useState<string | null>(null);

  // UI state
  const [showTaskPanel, setShowTaskPanel] = useState(true);
  const [showSynthesize, setShowSynthesize] = useState(false);
  const [synthesizedContent, setSynthesizedContent] = useState('');
  const [synthesizing, setSynthesizing] = useState(false);
  const [showSynthesizeConfirm, setShowSynthesizeConfirm] = useState(false);
  const [showAddNode, setShowAddNode] = useState(false);
  const [newNodeTitle, setNewNodeTitle] = useState('');
  const [newNodeContent, setNewNodeContent] = useState('');
  const [addingNode, setAddingNode] = useState(false);
  const [addNodeTaskId, setAddNodeTaskId] = useState('');
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editNodeTitle, setEditNodeTitle] = useState('');
  const [editNodeContent, setEditNodeContent] = useState('');
  const [edgeToDelete, setEdgeToDelete] = useState<string | null>(null);
  const [optimizerPrompts, setOptimizerPrompts] = useState<Record<string, string>>({});
  const [optimizerTasks, setOptimizerTasks] = useState<Record<string, string>>({});
  const [optimizerGenerating, setOptimizerGenerating] = useState<string | null>(null);
  const [selectionEnabled, setSelectionEnabled] = useState(false);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [nodePrompts, setNodePrompts] = useState<Record<string, string>>({});
  const [manualEdges, setManualEdges] = useState<
    Array<{ id: string; source_node_id: string; target_node_id: string; edge_type: string }>
  >([]);

  // Saved outputs
  const [showOutputs, setShowOutputs] = useState(false);
  const [outputs, setOutputs] = useState<Array<{ id: string; content: string; node_count: number; created_at: string }>>([]);
  const [outputsLoading, setOutputsLoading] = useState(false);
  const [viewingOutput, setViewingOutput] = useState<{ id: string; content: string; node_count: number; created_at: string } | null>(null);

  // Action confirmation modal
  const [confirmAction, setConfirmAction] = useState<{
    type: 'expand' | 'reroll' | 'optimize' | 'lock' | 'delete';
    nodeId: string;
    direction?: Direction;
    title: string;
    descriptionKey: string;
    descriptionArgs?: Record<string, string>;
  } | null>(null);

  // React Flow state
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [nodes, setNodes, onNodesChange] = useNodesState<any>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // ──── Auth guard ────
  useEffect(() => {
    if (!authLoading && !user) go('/login', { replace: true });
  }, [user, authLoading, go]);

  // ──── Load project + tasks + nodes ────
  useEffect(() => {
    if (!projectId || !user) return;

    Promise.all([
      supabase.from('projects').select('*').eq('id', projectId).single(),
      supabase
        .from('tasks')
        .select('*')
        .eq('project_id', projectId)
        .order('order_index'),
      supabase
        .from('canvas_nodes')
        .select('*')
        .eq('project_id', projectId)
        .neq('status', 'deleted')
        .neq('node_type', 'optimizer')
        .order('created_at'),
      supabase
        .from('canvas_edges')
        .select('*')
        .eq('project_id', projectId),
      supabase
        .from('canvas_nodes')
        .select('*')
        .eq('project_id', projectId)
        .eq('node_type', 'optimizer')
        .neq('status', 'deleted'),
    ]).then(([projRes, taskRes, nodeRes, edgeRes, optRes]) => {
      if (projRes.data) {
        const p = projRes.data as Project & { node_prompts?: Record<string, string> };
        setProject(p);
        if (p.node_prompts) setNodePrompts(p.node_prompts);
      }
      if (taskRes.data) {
        const taskList = taskRes.data as Task[];
        setTasks(taskList);
      }
      if (nodeRes.data) setDbNodes(nodeRes.data as CanvasNode[]);
      if (edgeRes.data) setManualEdges(edgeRes.data as typeof manualEdges);
      if (optRes.data && optRes.data.length > 0) {
        setDbNodes((prev) => [...prev, ...(optRes.data as CanvasNode[])]);
      }
      setLoading(false);
    });
  }, [projectId, user]);

  // ──── Handlers ────
  const handlers = useMemo(
    () => ({
      onReroll: (nodeId: string) => {
        const dbNode = dbNodes.find((n) => n.id === nodeId);
        if (!dbNode || !projectId || !user) return;
        setConfirmAction({ type: 'reroll', nodeId, title: dbNode.title, descriptionKey: 'canvas.confirmReroll' });
      },

      onLock: (nodeId: string) => {
        const dbNode = dbNodes.find((n) => n.id === nodeId);
        if (!dbNode) return;
        const isLocked = dbNode.status === 'locked';
        setConfirmAction({
          type: 'lock', nodeId, title: dbNode.title,
          descriptionKey: isLocked ? 'canvas.confirmUnlock' : 'canvas.confirmLock',
        });
      },

      onEdit: (nodeId: string) => {
        const dbNode = dbNodes.find((n) => n.id === nodeId);
        if (!dbNode) return;
        setEditingNodeId(nodeId);
        setEditNodeTitle(dbNode.title);
        setEditNodeContent(dbNode.content);
      },

      onOptimize: (nodeId: string) => {
        const dbNode = dbNodes.find((n) => n.id === nodeId);
        if (!dbNode) return;
        setConfirmAction({ type: 'optimize', nodeId, title: dbNode.title, descriptionKey: 'canvas.confirmOptimize' });
      },

      onDelete: (nodeId: string) => {
        const dbNode = dbNodes.find((n) => n.id === nodeId);
        if (!dbNode) return;
        setConfirmAction({ type: 'delete', nodeId, title: dbNode.title, descriptionKey: 'canvas.confirmDeleteNode' });
      },

      onExpand: (nodeId: string, direction: Direction) => {
        const dbNode = dbNodes.find((n) => n.id === nodeId);
        if (!dbNode || !projectId || !user) return;
        const dirLabels: Record<Direction, string> = { up: '↑', down: '↓', left: '←', right: '→' };
        setConfirmAction({
          type: 'expand', nodeId, direction, title: dbNode.title,
          descriptionKey: 'canvas.confirmExpand',
          descriptionArgs: { dir: dirLabels[direction] },
        });
      },
    }),
    [dbNodes, tasks, activeTaskId, projectId, user, setNodes, setEdges]
  );

  // ──── Execute confirmed action ────
  const executeConfirmed = useCallback(async () => {
    if (!confirmAction || !projectId || !user) return;
    const { type, nodeId, direction } = confirmAction;

    // Close modal immediately — action proceeds in background
    setConfirmAction(null);

    // Bulk operations (nodeId is empty)
    const isBulk = !nodeId;
    if (isBulk && (type === 'delete' || type === 'lock')) {
      const ids = selectedNodeIds;
      if (type === 'delete') {
        for (const id of ids) { await supabase.from('canvas_nodes').delete().eq('id', id); }
        setDbNodes((prev) => prev.filter((n) => !ids.includes(n.id)));
        setEdges((prev) => prev.filter((e) => !ids.includes(e.source) && !ids.includes(e.target)));
        toast.success(t('canvas.nodeDeleted'));
      } else if (type === 'lock') {
        const allLocked = ids.every((id) => dbNodes.find((n) => n.id === id)?.status === 'locked');
        const newStatus = allLocked ? 'draft' as NodeStatus : 'locked' as NodeStatus;
        for (const id of ids) { await supabase.from('canvas_nodes').update({ status: newStatus }).eq('id', id); }
        setDbNodes((prev) => prev.map((n) => ids.includes(n.id) ? { ...n, status: newStatus } : n));
        toast.success(newStatus === 'locked' ? t('canvas.nodeLocked') : t('canvas.nodeUnlocked'));
      }
      setSelectedNodeIds([]);
      setSelectionEnabled(false);
      return;
    }

    const dbNode = dbNodes.find((n) => n.id === nodeId);
    if (!dbNode) return;

    if (type === 'delete') {
      await supabase.from('canvas_nodes').delete().eq('id', nodeId);
      setDbNodes((prev) => prev.filter((n) => n.id !== nodeId));
      setEdges((prev) => prev.filter((e) => e.source !== nodeId && e.target !== nodeId));
      toast.success(t('canvas.deleteNodeSuccess'));
    } else if (type === 'lock') {
      const newStatus: NodeStatus = dbNode.status === 'locked' ? 'draft' : 'locked';
      await supabase.from('canvas_nodes').update({ status: newStatus }).eq('id', nodeId);
      setDbNodes((prev) => prev.map((n) => n.id === nodeId ? { ...n, status: newStatus } : n));
      toast.success(newStatus === 'locked' ? t('canvas.nodeLocked') : t('canvas.nodeUnlocked'));
    } else if (type === 'reroll') {
      setGeneratingNodeId(nodeId);
      try {
        const parent = dbNode.parent_node_id ? dbNodes.find((n) => n.id === dbNode.parent_node_id) : null;
        const task = tasks.find((t) => t.id === dbNode.task_id);
        const result = await api.rerollNode({
          task_title: task?.title || '', task_description: task?.description || '',
          parent_node_title: parent?.title, parent_node_content: parent?.content,
          direction: dbNode.direction_from_parent || 'right',
          previous_generation: { title: dbNode.title, content: dbNode.content },
        });
        const newVersion = dbNode.version + 1;
        await supabase.from('canvas_nodes').update({ title: result.title, content: result.content, version: newVersion }).eq('id', nodeId);
        setDbNodes((prev) => prev.map((n) => n.id === nodeId ? { ...n, title: result.title, content: result.content, version: newVersion } : n));
        toast.success(t('canvas.rerollSuccess'));
      } catch { toast.error(t('canvas.rerollError')); }
      finally { setGeneratingNodeId(null); }
    } else if (type === 'optimize') {
      setGeneratingNodeId(nodeId);
      try {
        const result = await api.optimizeNode({ title: dbNode.title, content: dbNode.content });
        await supabase.from('canvas_nodes').update({ title: result.title, content: result.content }).eq('id', nodeId);
        setDbNodes((prev) => prev.map((n) => n.id === nodeId ? { ...n, title: result.title, content: result.content } : n));
        toast.success(t('canvas.optimizeSuccess'));
      } catch { toast.error(t('canvas.optimizeError')); }
      finally { setGeneratingNodeId(null); }
    } else if (type === 'expand' && direction) {
      const taskId = dbNode.task_id || activeTaskId;
      if (!taskId) return;
      const task = tasks.find((t) => t.id === taskId);
      const offset = DIRECTION_OFFSET[direction];
      const newPos = { x: dbNode.position_x + offset.x, y: dbNode.position_y + offset.y };
      const tempId = `temp-${Date.now()}`;
      setNodes((prev) => [...prev, { id: tempId, type: 'custom', position: newPos,
        data: { title: t('canvas.generatingContent'), content: t('canvas.aiGeneratingContent'), taskId, status: 'draft', highlighted: true, color: task?.color || '#6366f1', version: 1, isGenerating: true },
      } as Node<CanvasNodeData>]);
      try {
        const siblings = dbNodes.filter((n) => n.parent_node_id === nodeId && n.id !== nodeId);
        const result = await api.generateNode({
          project_id: projectId, task_id: taskId, task_title: task?.title || '', task_description: task?.description || '',
          parent_node_content: dbNode.content, parent_node_title: dbNode.title, direction,
          context_nodes: siblings.map((s) => ({ title: s.title, content: s.content, direction: s.direction_from_parent || 'right' })),
        });
        const { data: saved, error } = await supabase.from('canvas_nodes').insert({
          project_id: projectId, task_id: taskId, user_id: user.id, parent_node_id: nodeId,
          direction_from_parent: direction, title: result.title, content: result.content,
          status: 'draft', position_x: newPos.x, position_y: newPos.y, version: 1,
        }).select().single();
        if (error || !saved) throw error;
        const isCrossTask = saved.task_id !== dbNode.task_id;
        const { data: savedEdge } = await supabase.from('canvas_edges').insert({
          project_id: projectId, user_id: user.id, source_node_id: nodeId, target_node_id: saved.id,
          edge_type: isCrossTask ? 'cross-task' : 'manual',
        }).select().single();
        setNodes((prev) => prev.filter((n) => n.id !== tempId));
        setDbNodes((prev) => [...prev, saved as CanvasNode]);
        if (savedEdge) setManualEdges((prev) => [...prev, savedEdge as typeof manualEdges[number]]);
        toast.success(t('canvas.nodeGenerated'));
      } catch (err) { console.error('expand error:', err); setNodes((prev) => prev.filter((n) => n.id !== tempId)); toast.error(t('canvas.rerollError')); }
    }
  }, [confirmAction, dbNodes, tasks, activeTaskId, projectId, user, setNodes, setEdges, selectedNodeIds, t]);

  // ──── Sync dbNodes → React Flow nodes ────
  useEffect(() => {
    const taskColorMap = new Map(tasks.map((t) => [t.id, t.color || '#6366f1']));
    const dbIds = new Set(dbNodes.map((n) => n.id));

    setNodes((prev) => {
      // Remove nodes no longer in dbNodes (deleted)
      const kept = prev.filter((n) => dbIds.has(n.id) || n.id.startsWith('temp-') || n.type === 'optimizer');

      // Add new nodes from dbNodes that aren't in React Flow yet
      const existingIds = new Set(prev.map((n) => n.id));
      const newNodes = dbNodes
        .filter((n) => !existingIds.has(n.id))
        .map((n) => {
          const cn = n as CanvasNode & { node_type?: string };
          if (cn.node_type === 'optimizer') {
            let optConfig: { p?: string; t?: string } = {};
            try { optConfig = JSON.parse(cn.content || '{}'); } catch { optConfig.p = cn.content || 'summarize'; }
            return {
              id: cn.id,
              type: 'optimizer',
              position: { x: cn.position_x, y: cn.position_y },
              data: {
                prompt: optimizerPrompts[cn.id] || optConfig.p || cn.content || 'summarize',
                taskId: optimizerTasks[cn.id] || optConfig.t || '',
                taskOptions: tasks.map((t) => ({ id: t.id, title: t.title, color: t.color })),
                connectedTitles: [],
                isGenerating: false,
                onDelete: (nodeId: string) => {
                  supabase.from('canvas_nodes').delete().eq('id', nodeId).then();
                  supabase.from('canvas_edges').delete().eq('source_node_id', nodeId).then();
                  supabase.from('canvas_edges').delete().eq('target_node_id', nodeId).then();
                  setNodes((prev) => prev.filter((n) => n.id !== nodeId));
                  setDbNodes((prev) => prev.filter((n) => n.id !== nodeId));
                  toast.success(t('canvas.optimizerDeleted'));
                },
                onChangeTask: (nodeId: string, taskId: string) => {
                  supabase.from('canvas_nodes').update({ task_id: taskId }).eq('id', nodeId).then();
                  setDbNodes((prev) => prev.map((n) => n.id === nodeId ? { ...n, task_id: taskId } : n));
                  setNodes((prev) =>
                    prev.map((n) =>
                      n.id === nodeId
                        ? { ...n, data: { ...(n.data as OptimizerNodeData), taskId } }
                        : n
                    )
                  );
                },
                onGenerate: handleOptimizerGenerate,
                onChangePrompt: (nodeId: string, prompt: string) => {
                  setOptimizerPrompts((prev) => ({ ...prev, [nodeId]: prompt }));
                  supabase.from('canvas_nodes').update({ content: prompt }).eq('id', nodeId).then();
                  setDbNodes((prev) => prev.map((n) => n.id === nodeId ? { ...n, content: prompt } : n));
                  setNodes((prev) =>
                    prev.map((n) =>
                      n.id === nodeId
                        ? { ...n, data: { ...(n.data as OptimizerNodeData), prompt } }
                        : n
                    )
                  );
                },
              },
            };
          }
          return toFlowNode(
            n,
            activeTaskId === null || n.task_id === activeTaskId,
            taskColorMap.get(n.task_id ?? '') || '#6366f1',
            handlers
          );
        });

      const updatedNodes = kept.map((n) => {
        if (n.id.startsWith('temp-')) return n;
        const dbNode = dbNodes.find((dn) => dn.id === n.id);
        if (!dbNode) return n;
        return {
          ...n,
          data: {
            ...n.data,
            title: dbNode.title,
            content: dbNode.content,
            taskId: dbNode.task_id,
            status: dbNode.status,
            highlighted:
              activeTaskId === null || dbNode.task_id === activeTaskId,
            color: taskColorMap.get(dbNode.task_id ?? '') || '#6366f1',
            version: dbNode.version,
            isGenerating: generatingNodeId ? n.id === generatingNodeId : false,
          },
        };
      });

      return [...updatedNodes, ...newNodes];
    });

    // Rebuild edges from parent relationships
    const flowEdges: Edge[] = dbNodes
      .filter((n) => n.parent_node_id)
      .map((n) => {
        const handles = n.direction_from_parent
          ? HANDLE_MAP[n.direction_from_parent as Direction]
          : null;
        const parentNode = dbNodes.find((pn) => pn.id === n.parent_node_id);
        const isCrossTaskParent =
          parentNode && parentNode.task_id !== n.task_id;
        const edgeActive =
          activeTaskId === null || n.task_id === activeTaskId;
        const sourceColor = parentNode
          ? taskColorMap.get(parentNode.task_id ?? '') || '#6366f1'
          : '#6366f1';
        const edgeColor = edgeActive ? sourceColor : '#3b3b52';
        const edgeId = `e-${n.parent_node_id}-${n.id}`;
        const isDeleteTarget = edgeToDelete === edgeId;
        return {
          id: edgeId,
          source: n.parent_node_id!,
          target: n.id,
          sourceHandle: handles?.source ?? undefined,
          targetHandle: handles?.target ?? undefined,
          animated: !isDeleteTarget && n.status !== 'locked',
          style: {
            stroke: isDeleteTarget ? '#ef4444' : isCrossTaskParent ? '#94a3b8' : edgeColor,
            strokeWidth: isDeleteTarget ? 2.5 : isCrossTaskParent ? 2 : 1.5,
            strokeDasharray: isDeleteTarget ? undefined : isCrossTaskParent ? '8 4 2 4' : '6 3',
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: isDeleteTarget ? '#ef4444' : isCrossTaskParent ? '#94a3b8' : edgeColor,
          },
        };
      });

    // Dedup: skip manual edges already covered by parent-child relationships
    const parentChildPairs = new Set(
      dbNodes
        .filter((n) => n.parent_node_id)
        .map((n) => `${n.parent_node_id}→${n.id}`)
    );

    // Add manual edges (skip those already represented by parent-child)
    manualEdges.forEach((me) => {
      if (parentChildPairs.has(`${me.source_node_id}→${me.target_node_id}`)) return;

      const sourceNode = dbNodes.find((n) => n.id === me.source_node_id);
      const targetNode = dbNodes.find((n) => n.id === me.target_node_id);
      const sourceTaskColor = sourceNode
        ? taskColorMap.get(sourceNode.task_id ?? '') || '#6366f1'
        : '#6366f1';

      // Determine handles from positions
      let sourceHandle: string | undefined;
      let targetHandle: string | undefined;
      if (sourceNode && targetNode) {
        const dx = targetNode.position_x - sourceNode.position_x;
        const dy = targetNode.position_y - sourceNode.position_y;
        if (Math.abs(dx) > Math.abs(dy)) {
          sourceHandle = dx > 0 ? 'right' : 'left';
          targetHandle = dx > 0 ? 'target-left' : 'target-right';
        } else {
          sourceHandle = dy > 0 ? 'bottom' : 'top';
          targetHandle = dy > 0 ? 'target-top' : 'target-bottom';
        }
      }

      // Optimizer connections always use source color, not cross-task gray
      const isTargetOptimizer = (targetNode as any)?.node_type === 'optimizer';
      const isCrossTask = isTargetOptimizer ? false : me.edge_type === 'cross-task';
      const isDeleteTarget = edgeToDelete === me.id;
      const edgeColor = isDeleteTarget ? '#ef4444' : isCrossTask ? '#94a3b8' : sourceTaskColor;
      flowEdges.push({
        id: me.id,
        source: me.source_node_id,
        target: me.target_node_id,
        sourceHandle,
        targetHandle,
        animated: !isDeleteTarget,
        style: {
          stroke: edgeColor,
          strokeWidth: isDeleteTarget ? 2.5 : isCrossTask ? 2 : 1.5,
          strokeDasharray: isDeleteTarget ? undefined : isCrossTask ? '8 4 2 4' : '6 3',
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: edgeColor,
        },
      });
    });

    setEdges(flowEdges);
  }, [dbNodes, manualEdges, activeTaskId, generatingNodeId, edgeToDelete, handlers, setNodes, setEdges, optimizerTasks, optimizerPrompts]);

  // ──── Connection handler (manual edge creation) ────
  const onConnect = useCallback(
    async (connection: Connection) => {
      if (!connection.source || !connection.target || !projectId || !user) return;

      // Detect nodes
      let sourceId = connection.source;
      let targetId = connection.target;
      let sourceNode = dbNodes.find((n) => n.id === sourceId);
      let targetNode = dbNodes.find((n) => n.id === targetId);

      // If source is optimizer, swap (optimizer only receives input)
      if ((sourceNode as any)?.node_type === 'optimizer' && (targetNode as any)?.node_type !== 'optimizer') {
        [sourceId, targetId] = [targetId, sourceId];
        [sourceNode, targetNode] = [targetNode, sourceNode];
      }

      // Optimizer nodes have null task_id — never cross-task
      const isOptimizerInvolved =
        (sourceNode as any)?.node_type === 'optimizer' ||
        (targetNode as any)?.node_type === 'optimizer';
      const isCrossTask =
        !isOptimizerInvolved &&
        sourceNode && targetNode &&
        sourceNode.task_id != null && targetNode.task_id != null &&
        sourceNode.task_id !== targetNode.task_id;

      // Persist to DB
      const { data, error } = await supabase
        .from('canvas_edges')
        .insert({
          project_id: projectId,
          user_id: user.id,
          source_node_id: sourceId,
          target_node_id: targetId,
          edge_type: isCrossTask ? 'cross-task' : 'manual',
        })
        .select()
        .single();

      if (!error && data) {
        setManualEdges((prev) => [
          ...prev,
          data as typeof manualEdges[number],
        ]);
      }
    },
    [dbNodes, projectId, user]
  );

  // Validate: force optimizer connections to left input handle
  const isValidConnection = useCallback(
    (connection: Edge | Connection) => {
      const targetNode = dbNodes.find((n) => n.id === connection.target);
      const isOptimizerTarget = (targetNode as any)?.node_type === 'optimizer';
      // Optimizer only accepts connections on target-left (input)
      if (isOptimizerTarget && connection.targetHandle !== 'target-left') return false;
      return true;
    },
    [dbNodes]
  );

  // ──── Edge click handler (first click = preview, second = delete) ────
  const onEdgeClick = useCallback(
    (_event: React.MouseEvent, edge: Edge) => {
      if (edgeToDelete === edge.id) {
        // Second click — confirm delete
        supabase.from('canvas_edges').delete().eq('id', edge.id).then(() => {
          setManualEdges((prev) => prev.filter((me) => me.id !== edge.id));
          setEdgeToDelete(null);
          toast.success(t('canvas.edgeDeleteSuccess'));
        });
      } else {
        // First click — preview
        setEdgeToDelete(edge.id);
      }
    },
    [edgeToDelete]
  );

  // Reset edge delete selection on pane click
  const onPaneClick = useCallback(() => {
    if (edgeToDelete) setEdgeToDelete(null);
  }, [edgeToDelete]);

  // ──── Edge delete handler ────
  const onEdgesDelete = useCallback(
    async (edgesToDelete: Edge[]) => {
      for (const edge of edgesToDelete) {
        await supabase.from('canvas_edges').delete().eq('id', edge.id);
        setManualEdges((prev) => prev.filter((me) => me.id !== edge.id));
      }
    },
    []
  );

  // ──── Save position on drag end ────
  const onNodeDragStop = useCallback(
    (_event: any, node: any) => {
      const { id, position } = node;
      // Update local dbNodes so position is remembered across task switches
      setDbNodes((prev) =>
        prev.map((n) =>
          n.id === id
            ? { ...n, position_x: position.x, position_y: position.y }
            : n
        )
      );
      // Persist to Supabase (fire-and-forget)
      supabase
        .from('canvas_nodes')
        .update({
          position_x: position.x,
          position_y: position.y,
        })
        .eq('id', id)
        .then(({ error }) => {
          if (error) console.error('Failed to save node position:', error);
        });
    },
    []
  );

  // ──── Synthesize ────
  const handleSynthesize = async () => {
    if (!project || !projectId) return;
    setSynthesizing(true);
    setShowSynthesize(true);

    try {
      const lockedNodes = dbNodes.filter((n) => n.status === 'locked');
      const result = await api.synthesize({
        project_id: projectId,
        project_goal: project.goal,
        tasks: tasks.map((t) => ({
          id: t.id,
          title: t.title,
          order_index: t.order_index,
        })),
        nodes: lockedNodes.map((n) => ({
          task_id: n.task_id ?? '',
          title: n.title,
          content: n.content,
          position_x: n.position_x,
          position_y: n.position_y,
          parent_node_id: n.parent_node_id,
        })),
        format: 'markdown',
      });

      setSynthesizedContent(result.content);
      toast.success(t('canvas.synthesizeSuccess'));
    } catch (err) {
      toast.error(t('canvas.synthesizeError'));
    } finally {
      setSynthesizing(false);
    }
  };

  // ──── Toggle task status ────
  const toggleTaskStatus = async (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    const newStatus: Task['status'] =
      task.status === 'completed' ? 'pending' : 'completed';

    const { error } = await supabase
      .from('tasks')
      .update({ status: newStatus })
      .eq('id', taskId);

    if (!error) {
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t))
      );
    }
  };

  // ──── Bulk operations on selected nodes ────
  const allSelectedLocked = selectedNodeIds.every((id) => {
    const node = dbNodes.find((n) => n.id === id);
    return node?.status === 'locked';
  });

  const onSelectionChange = useCallback(({ nodes }: { nodes: any[] }) => {
    if (!selectionEnabled) return;
    setSelectedNodeIds(nodes.filter((n) => n.type !== 'optimizer').map((n) => n.id));
  }, [selectionEnabled]);

  // ──── Add optimizer node ────
  const addOptimizer = async () => {
    if (!projectId || !user) return;
    // Save to canvas_nodes to get a real UUID
    const { data: savedNode, error } = await supabase
      .from('canvas_nodes')
      .insert({
        project_id: projectId,
        task_id: null,
        user_id: user.id,
        title: '__OPTIMIZER__',
        content: '{"p":"summarize","t":""}',
        status: 'draft',
        position_x: 400,
        position_y: 200,
        version: 1,
        node_type: 'optimizer',
      })
      .select()
      .single();

    if (error || !savedNode) {
      toast.error(t('canvas.optimizerCreateError'));
      return;
    }

    const id = savedNode.id;

    // Add to dbNodes so onConnect / isValidConnection can detect it
    setDbNodes((prev) => [...prev, savedNode as unknown as CanvasNode]);

    let optCfg: { p?: string; t?: string } = {};
    try { optCfg = JSON.parse(savedNode.content || '{}'); } catch { optCfg.p = 'summarize'; }

    const newNode: Node<OptimizerNodeData> = {
      id,
      type: 'optimizer',
      position: { x: 400, y: 200 },
      data: {
        prompt: optCfg.p || 'summarize',
        taskId: optCfg.t || '',
        taskOptions: tasks.map((t) => ({ id: t.id, title: t.title, color: t.color })),
        connectedTitles: [],
        isGenerating: false,
        onDelete: (nodeId: string) => {
          supabase.from('canvas_nodes').delete().eq('id', nodeId).then();
          supabase.from('canvas_edges').delete().eq('source_node_id', nodeId).then();
          supabase.from('canvas_edges').delete().eq('target_node_id', nodeId).then();
          setNodes((prev) => prev.filter((n) => n.id !== nodeId));
          setDbNodes((prev) => prev.filter((n) => n.id !== nodeId));
          toast.success(t('canvas.optimizerDeleted'));
        },
        onGenerate: handleOptimizerGenerate,
        onChangeTask: (nodeId: string, taskId: string) => {
          setOptimizerTasks((prev) => ({ ...prev, [nodeId]: taskId }));
          const cfg = { p: optimizerPrompts[nodeId] || 'summarize', t: taskId };
          const json = JSON.stringify(cfg);
          supabase.from('canvas_nodes').update({ content: json }).eq('id', nodeId).then();
          setDbNodes((prev) => prev.map((n) => n.id === nodeId ? { ...n, content: json } : n));
          setNodes((prev) =>
            prev.map((n) =>
              n.id === nodeId
                ? { ...n, data: { ...(n.data as OptimizerNodeData), taskId } }
                : n
            )
          );
        },
        onChangePrompt: (nodeId: string, prompt: string) => {
          setOptimizerPrompts((prev) => ({ ...prev, [nodeId]: prompt }));
          const optNode = dbNodes.find((n) => n.id === nodeId);
          let t = '';
          try { t = JSON.parse((optNode as any)?.content || '{}').t || ''; } catch {}
          const json = JSON.stringify({ p: prompt, t });
          supabase.from('canvas_nodes').update({ content: json }).eq('id', nodeId).then();
          setDbNodes((prev) => prev.map((n) => n.id === nodeId ? { ...n, content: json } : n));
          setNodes((prev) =>
            prev.map((n) =>
              n.id === nodeId
                ? { ...n, data: { ...(n.data as OptimizerNodeData), prompt } }
                : n
            )
          );
        },
      },
    };
    setNodes((prev) => [...prev, newNode]);
    setOptimizerPrompts((prev) => ({ ...prev, [id]: optCfg.p || 'summarize' }));
    if (optCfg.t) setOptimizerTasks((prev) => ({ ...prev, [id]: optCfg.t }));
    toast.success(t('canvas.optimizerAdded'));
  };

  const handleOptimizerGenerate = async (optimizerId: string, taskId?: string | null) => {
    const prompt = optimizerPrompts[optimizerId] || 'summarize';

    // Find edges that target this optimizer
    const sourceIds = manualEdges
      .filter((me) => me.target_node_id === optimizerId)
      .map((me) => me.source_node_id);

    if (sourceIds.length === 0) {
      toast.error(t('canvas.optimizerNoNodes').replace('{count}', String(manualEdges.filter((me) => me.target_node_id === optimizerId).length)));
      return;
    }

    const connectedNodes = dbNodes.filter((n) => sourceIds.includes(n.id));
    const resolvedTaskId = taskId || activeTaskId || tasks[0]?.id || '';
    setOptimizerGenerating(optimizerId);

    try {
      const result = await api.runOptimizer({
        prompt,
        nodes: connectedNodes.map((n) => ({ title: n.title, content: n.content })),
      });

      // Save new node
      const offsetX = 250;
      const { data: saved } = await supabase
        .from('canvas_nodes')
        .insert({
          project_id: projectId,
          task_id: resolvedTaskId,
          user_id: user!.id,
          title: result.title,
          content: result.content,
          status: 'draft',
          position_x: 400 + offsetX,
          position_y: 200,
          version: 1,
        })
        .select()
        .single();

      if (saved) {
        setDbNodes((prev) => [...prev, saved as CanvasNode]);

        // Create edge from optimizer to new node
        const { data: edge } = await supabase
          .from('canvas_edges')
          .insert({
            project_id: projectId,
            user_id: user!.id,
            source_node_id: optimizerId,
            target_node_id: saved.id,
            edge_type: 'manual',
          })
          .select()
          .single();

        if (edge) setManualEdges((prev) => [...prev, edge as typeof manualEdges[number]]);
        toast.success(t('canvas.optimizerGenSuccess'));
      }
    } catch {
      toast.error(t('canvas.optimizerGenError'));
    } finally {
      setOptimizerGenerating(null);
    }
  };

  // ──── Sync optimizer connected titles ────
  useEffect(() => {
    setNodes((prev) =>
      prev.map((n) => {
        if (n.type !== 'optimizer') return n;
        const sourceIds = manualEdges
          .filter((me) => me.target_node_id === n.id)
          .map((me) => me.source_node_id);
        const titles = dbNodes
          .filter((dn) => sourceIds.includes(dn.id))
          .map((dn) => dn.title);
        return {
          ...n,
          data: {
            ...(n.data as unknown as OptimizerNodeData),
            connectedTitles: titles,
            isGenerating: optimizerGenerating === n.id,
            taskId: optimizerTasks[n.id] || (n.data as OptimizerNodeData).taskId || '',
            prompt: optimizerPrompts[n.id] || (n.data as OptimizerNodeData).prompt || 'summarize',
            onGenerate: handleOptimizerGenerate,
            onDelete: (nodeId: string) => {
              supabase.from('canvas_nodes').delete().eq('id', nodeId).then();
              supabase.from('canvas_edges').delete().eq('source_node_id', nodeId).then();
              supabase.from('canvas_edges').delete().eq('target_node_id', nodeId).then();
              setNodes((prev) => prev.filter((n) => n.id !== nodeId));
              setDbNodes((prev) => prev.filter((n) => n.id !== nodeId));
              toast.success(t('canvas.optimizerDeleted'));
            },
            onChangeTask: (nodeId: string, taskId: string) => {
              setOptimizerTasks((prev) => ({ ...prev, [nodeId]: taskId }));
              const cfg = { p: optimizerPrompts[nodeId] || 'summarize', t: taskId };
              const json = JSON.stringify(cfg);
              supabase.from('canvas_nodes').update({ content: json }).eq('id', nodeId).then();
              setDbNodes((prev) => prev.map((n) => n.id === nodeId ? { ...n, content: json } : n));
              setNodes((prev) =>
                prev.map((n) =>
                  n.id === nodeId
                    ? { ...n, data: { ...(n.data as OptimizerNodeData), taskId } }
                    : n
                )
              );
            },
            onChangePrompt: (nodeId: string, prompt: string) => {
              setOptimizerPrompts((prev) => ({ ...prev, [nodeId]: prompt }));
              const optNode = dbNodes.find((n) => n.id === nodeId);
              let t = '';
              try { t = JSON.parse((optNode as any)?.content || '{}').t || ''; } catch {}
              const json = JSON.stringify({ p: prompt, t });
              supabase.from('canvas_nodes').update({ content: json }).eq('id', nodeId).then();
              setDbNodes((prev) => prev.map((n) => n.id === nodeId ? { ...n, content: json } : n));
              setNodes((prev) =>
                prev.map((n) =>
                  n.id === nodeId
                    ? { ...n, data: { ...(n.data as OptimizerNodeData), prompt } }
                    : n
                )
              );
            },
          },
        };
      })
    );
  }, [manualEdges, dbNodes, optimizerGenerating, setNodes, t, optimizerTasks, optimizerPrompts]);

  // ──── Save edited node ────
  const handleSaveEdit = async () => {
    if (!editingNodeId || !editNodeTitle.trim()) return;
    const { error } = await supabase
      .from('canvas_nodes')
      .update({ title: editNodeTitle.trim(), content: editNodeContent.trim() })
      .eq('id', editingNodeId);
    if (!error) {
      setDbNodes((prev) =>
        prev.map((n) =>
          n.id === editingNodeId
            ? { ...n, title: editNodeTitle.trim(), content: editNodeContent.trim() }
            : n
        )
      );
      setEditingNodeId(null);
      toast.success(t('canvas.nodeUpdated'));
    }
  };

  // ──── Add node manually ────
  const handleAddNode = async () => {
    if (!newNodeTitle.trim() || !projectId || !user) return;
    setAddingNode(true);
    try {
      let content = newNodeContent.trim();

      // Auto-generate content only if empty
      if (!content) {
        const result = await api.generateNode({
          project_id: projectId,
          task_id: activeTaskId || tasks[0]?.id || '',
          task_title: newNodeTitle.trim(),
          task_description: '',
          direction: 'right',
        });
        content = result.content.slice(0, 50);
      }

      const pos = { x: 400, y: 300 };
      const { data: saved, error } = await supabase
        .from('canvas_nodes')
        .insert({
          project_id: projectId,
          task_id: addNodeTaskId || activeTaskId || tasks[0]?.id || '',
          user_id: user.id,
          parent_node_id: null,
          direction_from_parent: null,
          title: newNodeTitle.trim(),
          content,
          status: 'draft',
          position_x: pos.x,
          position_y: pos.y,
          version: 1,
        })
        .select()
        .single();

      if (error || !saved) throw error || new Error('Save failed');

      setDbNodes((prev) => [...prev, saved as CanvasNode]);
      setShowAddNode(false);
      setNewNodeTitle('');
      setNewNodeContent('');
      toast.success(t('canvas.nodeAdded'));
    } catch (err) {
      console.error('add node error:', err);
      toast.error(t('canvas.nodeAddError'));
    } finally {
      setAddingNode(false);
    }
  };

  // ──── Generate root node ────
  const [generatingRoot, setGeneratingRoot] = useState(false);
  const [showRootDialog, setShowRootDialog] = useState(false);
  const [selectedContextNodes, setSelectedContextNodes] = useState<string[]>([]);
  const [rootDirection, setRootDirection] = useState<Direction | null>(null);

  const handleGenerateRoot = async () => {
    if (!activeTaskId || !projectId || !user) return;
    const task = tasks.find((t) => t.id === activeTaskId);
    if (!task) return;

    setGeneratingRoot(true);
    const rootPos = { x: 400, y: 300 };

    // Get selected context nodes
    const contextNodes = dbNodes
      .filter((n) => selectedContextNodes.includes(n.id))
      .map((n) => ({
        title: n.title,
        content: n.content,
        direction: n.direction_from_parent || 'right',
      }));

    try {
      const result = await api.generateNode({
        project_id: projectId,
        task_id: activeTaskId,
        task_title: task.title,
        task_description: task.description,
        direction: rootDirection || 'right',
        context_nodes: contextNodes.length > 0 ? contextNodes : undefined,
      });

      const { data: saved, error } = await supabase
        .from('canvas_nodes')
        .insert({
          project_id: projectId,
          task_id: activeTaskId,
          user_id: user.id,
          parent_node_id: null,
          direction_from_parent: null,
          title: result.title,
          content: result.content,
          status: 'draft',
          position_x: rootPos.x,
          position_y: rootPos.y,
          version: 1,
        })
        .select()
        .single();

      if (error || !saved) throw error || new Error('Save failed');

      // Create cross-task edges from selected context nodes → new root node
      if (selectedContextNodes.length > 0) {
        const edgesToInsert = selectedContextNodes.map((sourceId) => ({
          project_id: projectId,
          user_id: user.id,
          source_node_id: sourceId,
          target_node_id: saved.id,
          edge_type: 'cross-task',
        }));

        const { data: newEdges } = await supabase
          .from('canvas_edges')
          .insert(edgesToInsert)
          .select();

        if (newEdges) {
          setManualEdges((prev) => [
            ...prev,
            ...(newEdges as typeof manualEdges),
          ]);
        }
      }

      setDbNodes((prev) => [...prev, saved as CanvasNode]);
      setShowRootDialog(false);
      setSelectedContextNodes([]);
      toast.success(t('canvas.nodeGenerated'));
    } catch (err) {
      console.error('generate root error:', err);
      toast.error(t('canvas.rerollError'));
    } finally {
      setGeneratingRoot(false);
    }
  };

  // ──── Loading state ────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-canvas-bg overflow-hidden">
      {/* Top bar */}
      <header className="h-16 flex items-center gap-3 px-4 bg-canvas-surface/90 backdrop-blur-md border-b border-indigo-500/20 flex-shrink-0 relative">
        {/* Header glow line */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-indigo-400/60 to-transparent animate-pulse" />
          <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/3 via-transparent to-purple-500/3" />
        </div>

        <button
          onClick={() => go(-1)}
          className="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-all duration-200 active:scale-90"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        <h1 className={`font-semibold text-lg truncate flex-1 bg-gradient-to-r bg-clip-text text-transparent ${
          lightMode ? 'from-indigo-600 via-purple-600 to-indigo-600' : 'from-indigo-300 via-purple-300 to-indigo-300'
        }`}>
          {project?.title || t('canvas.canvasTitle')}
        </h1>

        <button
          onClick={() => setShowTaskPanel(!showTaskPanel)}
          className={`p-2 rounded-lg transition-all duration-200 hover:bg-white/5 active:scale-90 ${
            showTaskPanel ? 'text-indigo-400 shadow-[0_0_8px_rgba(99,102,241,0.3)]' : 'text-gray-400 hover:text-white'
          }`}
        >
          <Layers className="w-4 h-4" />
        </button>

        <button
          onClick={addOptimizer}
          className="p-2 rounded-lg transition-all duration-200 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 active:scale-90"
          title={t('canvas.addOptimizer')}
        >
          <Wrench className="w-4 h-4" />
        </button>
        <button
          onClick={() => setSelectionEnabled(!selectionEnabled)}
          className={`p-2 rounded-lg transition-all duration-200 hover:bg-white/5 active:scale-90 ${
            selectionEnabled ? 'text-indigo-400 shadow-[0_0_8px_rgba(99,102,241,0.3)]' : 'text-gray-400 hover:text-white'
          }`}
          title={t('canvas.selectionMode')}
        >
          <Crosshair className="w-4 h-4" />
        </button>
        <button
          onClick={() => setShowAddNode(true)}
          className="p-2 rounded-lg transition-all duration-200 text-gray-400 hover:text-white hover:bg-white/5 active:scale-90"
          title={t('canvas.addNode')}
        >
          <PenSquare className="w-4 h-4" />
        </button>

        {/* Separator */}
        <div className="w-px h-5 bg-indigo-500/20 mx-0.5" />

        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg transition-all duration-200 text-gray-400 hover:text-white hover:bg-white/5 active:scale-90"
          title={lightMode ? t('theme.dark') : t('theme.light')}
        >
          {lightMode ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
        </button>
        <button
          onClick={() => setLang(lang === 'zh-TW' ? 'en' : 'zh-TW')}
          className="p-1.5 rounded-lg transition-all duration-200 text-gray-400 hover:text-white hover:bg-white/5 active:scale-90 lang-btn flex items-center gap-1 text-sm"
          title="Language"
        >
          <Globe className="w-4 h-4 flex-shrink-0" />
          <span className="text-xs font-medium">{lang === 'zh-TW' ? t('common.chinese') : t('common.english')}</span>
        </button>
        <button
          onClick={() => go('/settings')}
          className="p-2 rounded-lg transition-all duration-200 text-gray-400 hover:text-white hover:bg-white/5 active:scale-90"
          title={t('nav.settings')}
        >
          <Settings className="w-4 h-4" />
        </button>
        <button
          onClick={async () => {
            setShowOutputs(true);
            setOutputsLoading(true);
            try {
              const data = await api.getOutputs(projectId!);
              setOutputs(data.outputs || []);
            } catch { /* ignore */ }
            setOutputsLoading(false);
          }}
          className="p-2 rounded-lg transition-all duration-200 text-gray-400 hover:text-cyan-400 hover:bg-cyan-500/10 active:scale-90"
          title={t('canvas.savedOutputs')}
        >
          <Clock className="w-4 h-4" />
        </button>

        {/* Final Output button */}
        <button
          onClick={() => setShowSynthesizeConfirm(true)}
          disabled={synthesizing || dbNodes.filter((n) => n.status === 'locked').length === 0}
          className="flex items-center gap-1.5 text-xs py-1.5 px-3 rounded-lg font-medium transition-all duration-300
                     bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500
                     shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40
                     hover:scale-105 active:scale-95
                     disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
          style={{ color: '#ffffff' }}
        >
          <Wand2 className="w-3.5 h-3.5" />
          {synthesizing ? t('canvas.synthesizing') : t('canvas.finalOutput')}
        </button>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
        {/* Task Panel (left) */}
        {showTaskPanel && (
          <aside className="w-64 flex-shrink-0 bg-canvas-surface/80 backdrop-blur-sm border-r border-indigo-500/15 overflow-y-auto p-3 relative">
            {/* Sidebar accent line */}
            <div className="absolute right-0 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-indigo-400/40 to-transparent" />

            <h2 className="text-sm font-semibold text-indigo-300/70 uppercase tracking-[0.15em] mb-3 flex items-center gap-2">
              <span className="w-1 h-3 rounded-full bg-indigo-400/60 animate-pulse" />
              {t('canvas.taskPanel')}
            </h2>
            <div className="space-y-1">
              {/* Show all button */}
              <button
                onClick={() => setActiveTaskId(null)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all duration-200 ${
                  activeTaskId === null
                    ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/20 shadow-[0_0_10px_rgba(99,102,241,0.1)]'
                    : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
                }`}
              >
                {t('canvas.showAll')}
              </button>

              {/* Active tasks (pending / in_progress) */}
              {tasks
                .filter((t) => t.status !== 'completed')
                .map((task) => {
                  const nodeCount = dbNodes.filter(
                    (n) => n.task_id === task.id && (n as any).node_type !== 'optimizer'
                  ).length;
                  return (
                    <div
                      key={task.id}
                      className="flex items-center gap-1.5 group"
                    >
                      {/* Checkbox */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleTaskStatus(task.id);
                        }}
                        className="w-4 h-4 rounded border-2 border-gray-600 flex items-center justify-center flex-shrink-0 hover:border-green-400 hover:shadow-[0_0_6px_rgba(34,197,94,0.3)] transition-all duration-200"
                        title={t('common.markComplete')}
                      />
                      {/* Task button */}
                      <button
                        onClick={() => setActiveTaskId(task.id)}
                        className={`flex-1 text-left px-2 py-1.5 rounded-lg text-sm transition-all duration-200 truncate border ${
                          activeTaskId === task.id
                            ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/20 shadow-[0_0_10px_rgba(99,102,241,0.1)]'
                            : 'text-gray-400 hover:text-white hover:bg-white/5 border-transparent'
                        }`}
                      >
                        <span className="truncate">{task.title}</span>
                        <span className="text-xs opacity-60 ml-1 font-medium tabular-nums">
                          {nodeCount}
                        </span>
                      </button>
                    </div>
                  );
                })}

              {/* Completed section */}
              {tasks.some((t) => t.status === 'completed') && (
                <>
                  <div className="pt-3 mt-2 border-t border-indigo-500/10">
                    <h3 className="text-xs font-semibold text-green-400/60 uppercase tracking-[0.15em] mb-2 px-1 flex items-center gap-1.5">
                      <span className="w-1 h-3 rounded-full bg-green-400/40" />
                      {t('canvas.completed')}
                    </h3>
                  </div>
                  {tasks
                    .filter((t) => t.status === 'completed')
                    .map((task) => {
                      const nodeCount = dbNodes.filter(
                        (n) => n.task_id === task.id && (n as any).node_type !== 'optimizer'
                      ).length;
                      return (
                        <div
                          key={task.id}
                          className="flex items-center gap-1.5 group"
                        >
                          {/* Checkbox (checked) */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleTaskStatus(task.id);
                            }}
                            className="w-4 h-4 rounded border-2 border-green-500 bg-green-500 flex items-center justify-center flex-shrink-0 hover:border-green-400 hover:shadow-[0_0_6px_rgba(34,197,94,0.4)] transition-all duration-200"
                            title={t('common.unmarkComplete')}
                          >
                            <svg
                              className="w-2.5 h-2.5 text-white"
                              viewBox="0 0 12 12"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path d="M2 6l3 3 5-6" />
                            </svg>
                          </button>
                          {/* Task button */}
                          <button
                            onClick={() => setActiveTaskId(task.id)}
                            className={`flex-1 text-left px-2 py-1.5 rounded-lg text-sm transition-colors truncate opacity-60 ${
                              activeTaskId === task.id
                                ? 'bg-indigo-500/20 text-indigo-300'
                                : 'text-gray-500 hover:text-white hover:bg-white/5'
                            }`}
                          >
                            <span className="truncate">{task.title}</span>
                            <span className="text-xs text-white/70 ml-1 font-medium tabular-nums">
                              {nodeCount}
                            </span>
                          </button>
                        </div>
                      );
                    })}
                </>
              )}
            </div>

            {/* Direction prompts preview */}
            {Object.keys(nodePrompts).length > 0 && (
              <div className="mt-4 pt-3 border-t border-indigo-500/10">
                <h3 className="text-xs font-semibold text-indigo-300/50 uppercase tracking-[0.15em] mb-2 flex items-center gap-1.5">
                  <span className="w-1 h-3 rounded-full bg-amber-400/40" />
                  {t('canvas.guidancePrompts')}
                </h3>
                <div className="space-y-2">
                  {(['up', 'down', 'left', 'right'] as const).map((dir) => {
                    const prompt = nodePrompts[dir];
                    if (!prompt) return null;
                    const arrows: Record<string, string> = { up: '↑', down: '↓', left: '←', right: '→' };
                    return (
                      <div
                        key={dir}
                        className="text-sm text-gray-300 leading-relaxed group relative"
                      >
                        <span className="text-indigo-400 font-bold">{arrows[dir]}</span>{' '}
                        <span className="line-clamp-2 group-hover:line-clamp-none transition-all">
                          {prompt}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </aside>
        )}

        {/* Canvas */}
        <div className="flex-1 relative">
          {/* Empty canvas prompt — show when no nodes for active task */}
          {activeTaskId &&
            dbNodes.filter((n) => n.task_id === activeTaskId && (n as any).node_type !== 'optimizer').length === 0 &&
            !generatingRoot &&
            !showRootDialog && (
              <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
                <div className="glass-surface p-8 text-center space-y-5 pointer-events-auto max-w-sm border-indigo-500/10 shadow-[0_0_30px_rgba(99,102,241,0.08)]">
                  <div className="relative mx-auto w-fit">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center">
                      <Sparkles className="w-8 h-8 text-indigo-400" />
                    </div>
                    <div className="absolute inset-0 rounded-2xl bg-indigo-500/10 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-1">
                      {t('canvas.generateRoot')}
                    </h3>
                    <p className="text-sm text-gray-400 leading-relaxed">
                      {t('canvas.currentTaskNoNodes').replace('{title}', tasks.find((t) => t.id === activeTaskId)?.title || '')}
                    </p>
                  </div>
                  <button
                    onClick={() => setShowRootDialog(true)}
                    className="flex items-center gap-2 mx-auto py-2 px-5 rounded-lg font-medium text-sm transition-all duration-300
                               bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500
                               shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40
                               hover:scale-105 active:scale-95"
                    style={{ color: '#ffffff' }}
                  >
                    <PlusCircle className="w-4 h-4" />
                    {t('canvas.generateRoot')}
                  </button>
                </div>
              </div>
            )}

          {/* Root generation dialog */}
          {showRootDialog && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-canvas-bg/60 backdrop-blur-sm p-4">
              <div className="glass-surface p-6 w-full max-w-lg max-h-[80vh] flex flex-col">
                <h2 className="text-lg font-semibold mb-1">{t('canvas.generateRoot')}</h2>
                <p className="text-sm text-gray-400 mb-4">
                  {t('canvas.generateRootDesc')}
                </p>

                {/* Direction selector */}
                <div className="mb-4">
                  <label className="text-xs text-gray-500 mb-1.5 block">
                    {t('canvas.selectDirection')} {rootDirection ? '' : t('canvas.notSelected')}
                  </label>
                  <div className="flex gap-1">
                    {(['up', 'down', 'left', 'right'] as Direction[]).map((d) => (
                      <button
                        key={d}
                        onClick={() => setRootDirection(rootDirection === d ? null : d)}
                        className={`flex-1 py-1.5 rounded text-sm font-medium transition-colors ${
                          rootDirection === d
                            ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                            : 'text-gray-500 border border-canvas-border hover:text-gray-300'
                        }`}
                      >
                        {d === 'up' ? '↑' : d === 'down' ? '↓' : d === 'left' ? '←' : '→'} {d}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Show prompt for selected direction */}
                {rootDirection && nodePrompts[rootDirection] && (
                  <div className="mb-4 p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
                    <p className="text-[10px] text-gray-500 mb-1">{t('canvas.promptLabel')}</p>
                    <p className="text-xs text-gray-300 leading-relaxed">
                      {nodePrompts[rootDirection]}
                    </p>
                  </div>
                )}

                {/* Node list — only show when there are existing nodes */}
                {dbNodes.filter((n) => n.task_id !== activeTaskId && (n as any).node_type !== 'optimizer').length > 0 && (
                  <>
                    <p className="text-xs text-gray-500 mb-2">
                      {t('canvas.selectRefNodes')}
                    </p>
                    <div className="flex-1 overflow-y-auto space-y-2 mb-4 min-h-0 max-h-40">
                      {dbNodes
                        .filter((n) => n.task_id !== activeTaskId && (n as any).node_type !== 'optimizer')
                        .map((n) => {
                          const task = tasks.find((t) => t.id === n.task_id);
                          const isSelected = selectedContextNodes.includes(n.id);
                          return (
                            <button
                              key={n.id}
                              onClick={() =>
                                setSelectedContextNodes((prev) =>
                                  isSelected
                                    ? prev.filter((id) => id !== n.id)
                                    : [...prev, n.id]
                                )
                              }
                              className={`w-full text-left p-2.5 rounded-lg border transition-colors ${
                                isSelected
                                  ? 'border-indigo-500/50 bg-indigo-500/10'
                                  : 'border-canvas-border hover:border-gray-600'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <span
                                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: task?.color || '#6366f1' }}
                                />
                                <span className="text-sm text-white font-medium truncate">
                                  {n.title}
                                </span>
                                <span className="text-[10px] text-gray-600 flex-shrink-0">
                                  {task?.title}
                                </span>
                              </div>
                              <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                                {n.content}
                              </p>
                            </button>
                          );
                        })}
                    </div>
                  </>
                )}

              {/* Action buttons */}
                <div className="flex justify-end gap-3 pt-3 border-t border-canvas-border">
                  <button
                    onClick={() => {
                      setShowRootDialog(false);
                      setSelectedContextNodes([]);
                    }}
                    className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-white/5 transition-all duration-200"
                  >
                    {t('canvas.cancel')}
                  </button>
                  <button
                    onClick={handleGenerateRoot}
                    disabled={generatingRoot}
                    className="flex items-center gap-2 py-2 px-5 rounded-lg font-medium text-sm transition-all duration-300
                               bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500
                               shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40
                               hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
                    style={{ color: '#ffffff' }}
                  >
                    {generatingRoot ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {t('canvas.generating')}
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        {t('canvas.generateNode')}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Show hint when no task selected */}
          {!activeTaskId && dbNodes.length === 0 && (
            <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
              <div className="glass-surface p-8 text-center space-y-3 pointer-events-auto max-w-sm border-indigo-500/10 shadow-[0_0_30px_rgba(99,102,241,0.06)]">
                <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center mx-auto">
                  <Layers className="w-6 h-6 text-indigo-400/60" />
                </div>
                <p className="text-gray-400 text-sm leading-relaxed">
                  {t('canvas.noTaskHint')}
                </p>
              </div>
            </div>
          )}

          {/* Generating root spinner */}
          {generatingRoot && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-canvas-bg/60 backdrop-blur-sm">
              <div className="glass-surface p-8 text-center space-y-3">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-400 mx-auto" />
                <p className="text-gray-300">{t('canvas.generatingRoot')}</p>
              </div>
            </div>
          )}

          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            isValidConnection={isValidConnection}
            onEdgesDelete={onEdgesDelete}
            onEdgeClick={onEdgeClick}
            onPaneClick={onPaneClick}
            onSelectionChange={onSelectionChange}
            onNodeDragStop={onNodeDragStop}
            nodeTypes={NODE_TYPES}
            connectionMode={ConnectionMode.Loose}
            selectionMode={SelectionMode.Partial}
            selectionOnDrag={selectionEnabled}
            panOnDrag={selectionEnabled ? [1, 2] : [0, 1, 2]}
            fitView
            attributionPosition="bottom-right"
            defaultEdgeOptions={{
              animated: true,
              style: { stroke: '#3b3b52', strokeWidth: 1.5 },
              markerEnd: {
                type: MarkerType.ArrowClosed,
                color: '#3b3b52',
              },
            }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1.2}
              color={lightMode ? '#cbd5e1' : '#2a2a50'}
            />
            <Controls className="!bg-canvas-surface !border-canvas-border" />
            <MiniMap
              className="!bg-canvas-surface !border-canvas-border"
              maskColor="rgba(0,0,0,0.7)"
              nodeColor={(n) =>
                (n.data as unknown as CanvasNodeData).highlighted
                  ? '#6366f1'
                  : '#3b3b52'
              }
            />
          </ReactFlow>

          {/* Floating bulk action panel */}
          {selectionEnabled && selectedNodeIds.length > 0 && (
            <div className="fixed bottom-8 left-0 right-0 mx-auto w-fit glass-surface px-5 py-3 flex items-center gap-4 shadow-[0_0_20px_rgba(99,102,241,0.15)] border-indigo-500/20 z-50 animate-fade-in-up">
              <span className="text-sm text-gray-300">{t('canvas.nodesSelected').replace('{count}', String(selectedNodeIds.length))}</span>
              <div className="w-px h-6 bg-canvas-border" />
              <button onClick={() => setConfirmAction({
                type: 'lock', nodeId: '', title: t('canvas.nodesSelected').replace('{count}', String(selectedNodeIds.length)),
                descriptionKey: allSelectedLocked ? 'canvas.confirmBulkUnlock' : 'canvas.confirmBulkLock',
                descriptionArgs: { count: String(selectedNodeIds.length) },
              })} className="btn-ghost text-sm flex items-center gap-1.5">
                <Lock className="w-4 h-4" />{allSelectedLocked ? t('canvas.nodeUnlocked') : t('canvas.nodeLocked')}
              </button>
              <button onClick={() => setConfirmAction({
                type: 'delete', nodeId: '', title: t('canvas.nodesSelected').replace('{count}', String(selectedNodeIds.length)),
                descriptionKey: 'canvas.confirmBulkDelete',
                descriptionArgs: { count: String(selectedNodeIds.length) },
              })} className="btn-ghost text-sm flex items-center gap-1.5 text-red-400 hover:text-red-300">
                <Trash2 className="w-4 h-4" />{t('canvas.nodeDeleted')}
              </button>
              <button onClick={() => { setSelectedNodeIds([]); setSelectionEnabled(false); }} className="btn-ghost text-sm">✕</button>
            </div>
          )}
        </div>
      </div>

      {/* Edit Node Modal */}
      {editingNodeId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-fade-in">
          <div className="relative w-full max-w-md animate-scale-in">
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-indigo-500/20 via-purple-500/20 to-indigo-500/20 blur-xl animate-pulse" />
            <div className="relative glass-surface p-8 space-y-5 border-indigo-500/15 shadow-[0_0_60px_rgba(99,102,241,0.15)]">
              <div className="absolute top-0 left-6 right-6 h-[2px] bg-gradient-to-r from-transparent via-indigo-400 to-transparent" />
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/15 flex items-center justify-center shadow-[0_0_12px_rgba(99,102,241,0.2)]">
                  <Edit3 className="w-5 h-5 text-indigo-400" />
                </div>
                <h2 className="text-xl font-bold text-white">{t('canvas.editNode')}</h2>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">{t('canvas.title')}</label>
                <input
                  type="text"
                  value={editNodeTitle}
                  onChange={(e) => setEditNodeTitle(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-black/20 border border-indigo-500/20 text-white text-sm
                             placeholder-gray-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50
                             transition-all duration-200"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">{t('canvas.content')}</label>
                <textarea
                  value={editNodeContent}
                  onChange={(e) => setEditNodeContent(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-black/20 border border-indigo-500/20 text-white text-sm h-28 resize-none
                             placeholder-gray-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50
                             transition-all duration-200"
                />
              </div>

              <div className="flex justify-end gap-3 pt-1">
                <button
                  onClick={() => setEditingNodeId(null)}
                  className="px-5 py-2.5 rounded-xl text-base font-medium text-gray-400 hover:text-white
                             hover:bg-white/5 border border-transparent hover:border-white/10
                             transition-all duration-200 active:scale-95"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={!editNodeTitle.trim()}
                  className="px-5 py-2.5 rounded-xl text-base font-bold transition-all duration-300
                             bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500
                             shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50
                             hover:scale-105 active:scale-95
                             disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
                  style={{ color: '#ffffff' }}
                >
                  {t('common.save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Node Modal */}
      {showAddNode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-fade-in">
          <div className="relative w-full max-w-md animate-scale-in">
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-indigo-500/20 via-purple-500/20 to-indigo-500/20 blur-xl animate-pulse" />
            <div className="relative glass-surface p-8 space-y-5 border-indigo-500/15 shadow-[0_0_60px_rgba(99,102,241,0.15)]">
              <div className="absolute top-0 left-6 right-6 h-[2px] bg-gradient-to-r from-transparent via-indigo-400 to-transparent" />
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/15 flex items-center justify-center shadow-[0_0_12px_rgba(99,102,241,0.2)]">
                  <PlusCircle className="w-5 h-5 text-indigo-400" />
                </div>
                <h2 className="text-xl font-bold text-white">{t('canvas.manualNode')}</h2>
              </div>

              {tasks.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">{t('canvas.selectTask')}</label>
                  <select value={addNodeTaskId || activeTaskId || ''} onChange={(e) => setAddNodeTaskId(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-black/20 border border-indigo-500/20 text-white text-sm
                               focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-all duration-200">
                    <option value="">-- {t('canvas.selectTask')} --</option>
                    {tasks.map((t) => (<option key={t.id} value={t.id}>{t.title}</option>))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">{t('canvas.title')}</label>
                <input type="text" value={newNodeTitle} onChange={(e) => setNewNodeTitle(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-black/20 border border-indigo-500/20 text-white text-sm
                             placeholder-gray-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50
                             transition-all duration-200" autoFocus />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">{t('canvas.content')}</label>
                <textarea value={newNodeContent} onChange={(e) => setNewNodeContent(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-black/20 border border-indigo-500/20 text-white text-sm h-28 resize-none
                             placeholder-gray-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50
                             transition-all duration-200" />
              </div>

              <div className="flex justify-end gap-3 pt-1">
                <button onClick={() => { setShowAddNode(false); setNewNodeTitle(''); setNewNodeContent(''); }}
                  className="px-5 py-2.5 rounded-xl text-base font-medium text-gray-400 hover:text-white
                             hover:bg-white/5 border border-transparent hover:border-white/10
                             transition-all duration-200 active:scale-95">
                  {t('canvas.cancel')}
                </button>
                <button onClick={handleAddNode} disabled={!newNodeTitle.trim() || addingNode}
                  className="px-5 py-2.5 rounded-xl text-base font-bold transition-all duration-300
                             bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500
                             shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50
                             hover:scale-105 active:scale-95
                             disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
                  style={{ color: '#ffffff' }}>
                  {addingNode ? (
                    <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />{t('canvas.adding')}</span>
                  ) : (
                    <span className="flex items-center gap-2"><PlusCircle className="w-4 h-4" />{t('canvas.addNode')}</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Synthesize Confirm Modal */}
      {showSynthesizeConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="glass-surface p-6 w-full max-w-sm space-y-4">
            <h2 className="text-lg font-semibold">{t('canvas.outputConfirm')}</h2>
            <p className="text-sm text-gray-400">
              {t('canvas.outputConfirmDesc').replace('{count}', String(dbNodes.filter((n) => n.status === 'locked').length))}
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowSynthesizeConfirm(false)}
                className="btn-ghost text-sm"
              >
                {t('canvas.cancel')}
              </button>
              <button
                onClick={() => {
                  setShowSynthesizeConfirm(false);
                  handleSynthesize();
                }}
                className="btn-primary text-sm"
              >
                {t('canvas.confirmOutput')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Synthesize Modal */}
      {showSynthesize && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="glass-surface p-6 w-full max-w-3xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">{t('canvas.finalOutput')}</h2>
              <button
                onClick={() => setShowSynthesize(false)}
                className="btn-ghost p-1"
              >
                ✕
              </button>
            </div>

            {synthesizing ? (
              <div className="flex-1 flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
                <span className="ml-3 text-gray-400">{t('canvas.synthesizingContent')}</span>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto bg-canvas-bg p-4 rounded-lg markdown-body">
                <ReactMarkdown>{synthesizedContent}</ReactMarkdown>
              </div>
            )}

            <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-canvas-border">
              <button
                onClick={async () => {
                  const lockedCount = dbNodes.filter((n) => n.status === 'locked').length;
                  try {
                    await api.saveOutput({ project_id: projectId!, content: synthesizedContent, node_count: lockedCount });
                    toast.success(t('canvas.outputSaved'));
                  } catch { toast.error('Failed to save'); }
                }}
                className="btn-ghost text-sm"
                disabled={synthesizing}
              >
                {t('canvas.saveOutput')}
              </button>
              <button
                onClick={() => {
                  const blob = new Blob([synthesizedContent], { type: 'text/markdown' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `creode-output-${new Date().toISOString().slice(0, 10)}.md`;
                  a.click();
                  URL.revokeObjectURL(url);
                  toast.success(t('canvas.mdDownloaded'));
                }}
                className="btn-ghost text-sm"
                disabled={synthesizing}
              >
                {t('canvas.downloadMd')}
              </button>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(synthesizedContent);
                  toast.success(t('canvas.copied'));
                }}
                className="btn-ghost text-sm"
                disabled={synthesizing}
              >
                {t('canvas.copyContent')}
              </button>
              <button
                onClick={() => setShowSynthesize(false)}
                className="btn-primary text-sm"
              >
                {t('canvas.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Saved Outputs Panel */}
      {showOutputs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-fade-in">
          <div className="relative w-full max-w-3xl max-h-[80vh] animate-scale-in">
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-cyan-500/10 via-indigo-500/10 to-cyan-500/10 blur-xl animate-pulse" />
            <div className="relative glass-surface p-8 flex flex-col max-h-[80vh] border-cyan-500/15 shadow-[0_0_60px_rgba(6,182,212,0.12)]">
              <div className="absolute top-0 left-6 right-6 h-[2px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent" />

              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-cyan-500/15 flex items-center justify-center shadow-[0_0_12px_rgba(6,182,212,0.2)]">
                    <Clock className="w-5 h-5 text-cyan-400" />
                  </div>
                  <h2 className="text-xl font-bold text-white">{t('canvas.savedOutputs')}</h2>
                </div>
                <button onClick={() => setShowOutputs(false)}
                  className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-all duration-200 active:scale-90">
                  ✕
                </button>
              </div>

              {outputsLoading ? (
                <div className="flex-1 flex items-center justify-center py-20">
                  <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
                </div>
              ) : outputs.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center py-20 gap-3">
                  <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 flex items-center justify-center">
                    <Clock className="w-7 h-7 text-cyan-400/60" />
                  </div>
                  <p className="text-gray-500 text-base">{t('canvas.noOutputs')}</p>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                  {outputs.map((o) => (
                    <div key={o.id} className="group rounded-xl p-4 transition-all duration-200 hover:border-cyan-500/20"
                      style={{
                        background: lightMode ? 'rgba(248,250,252,0.8)' : 'rgba(15,15,25,0.6)',
                        border: lightMode ? '1px solid rgba(203,213,225,0.5)' : '1px solid rgba(59,59,82,0.3)',
                      }}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-cyan-400/60" />
                          <span className="text-xs text-gray-500 font-mono">
                            {new Date(o.created_at).toLocaleString(lang === 'zh-TW' ? 'zh-TW' : 'en')}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-cyan-400/70 font-mono">
                            {t('canvas.nodeCount').replace('{count}', String(o.node_count))}
                          </span>
                          <button
                            onClick={async () => {
                              await api.deleteOutput(o.id);
                              setOutputs((prev) => prev.filter((x) => x.id !== o.id));
                              toast.success(t('canvas.deleteOutput'));
                            }}
                            className="p-1 rounded text-gray-600 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all duration-200"
                            title={t('canvas.deleteOutput')}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <button onClick={() => setViewingOutput(o)} className="w-full text-left">
                        <div className="markdown-body text-sm max-h-40 overflow-y-auto pointer-events-none">
                          <ReactMarkdown>{o.content.length > 500 ? o.content.slice(0, 500) + '...' : o.content}</ReactMarkdown>
                        </div>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-end mt-4 pt-4 border-t border-indigo-500/10">
                <button onClick={() => setShowOutputs(false)}
                  className="px-5 py-2.5 rounded-xl text-base font-bold transition-all duration-300
                             bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500
                             shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/40
                             hover:scale-105 active:scale-95"
                  style={{ color: '#ffffff' }}>
                  {t('canvas.close')}
              </button>
            </div>
          </div>
        </div>
        </div>
      )}

      {/* ──── Output Detail Modal ──── */}
      {viewingOutput && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-fade-in">
          <div className="relative w-full max-w-3xl max-h-[85vh] animate-scale-in">
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-cyan-500/10 via-indigo-500/10 to-cyan-500/10 blur-xl animate-pulse" />
            <div className="relative glass-surface p-8 flex flex-col max-h-[85vh] border-cyan-500/15 shadow-[0_0_60px_rgba(6,182,212,0.12)]">
              <div className="absolute top-0 left-6 right-6 h-[2px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent" />
              <div className="flex items-center justify-between mb-6 flex-shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-cyan-500/15 flex items-center justify-center shadow-[0_0_12px_rgba(6,182,212,0.2)] flex-shrink-0">
                    <Clock className="w-5 h-5 text-cyan-400" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-lg font-bold text-white truncate">
                      {new Date(viewingOutput.created_at).toLocaleString(lang === 'zh-TW' ? 'zh-TW' : 'en')}
                    </h2>
                    <p className="text-xs text-cyan-400/60 font-mono">
                      {t('canvas.nodeCount').replace('{count}', String(viewingOutput.node_count))}
                    </p>
                  </div>
                </div>
                <button onClick={() => setViewingOutput(null)}
                  className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-all duration-200 active:scale-90 flex-shrink-0">
                  ✕
                </button>
              </div>
              <div className="flex-1 overflow-y-auto rounded-xl p-6 markdown-body text-sm"
                style={{ background: lightMode ? 'rgba(241,245,249,0.6)' : 'rgba(0,0,0,0.2)' }}>
                <ReactMarkdown>{viewingOutput.content}</ReactMarkdown>
              </div>
              <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-indigo-500/10 flex-shrink-0">
                <button onClick={() => {
                  const blob = new Blob([viewingOutput.content], { type: 'text/markdown' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `creode-output-${new Date(viewingOutput.created_at).toISOString().slice(0, 10)}.md`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 border border-transparent hover:border-white/10 transition-all duration-200">
                  {t('canvas.downloadMd')}
                </button>
                <button onClick={() => { navigator.clipboard.writeText(viewingOutput.content); toast.success(t('canvas.copied')); }}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 border border-transparent hover:border-white/10 transition-all duration-200">
                  {t('canvas.copyContent')}
                </button>
                <button onClick={() => setViewingOutput(null)}
                  className="px-5 py-2 rounded-xl text-sm font-bold bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/40 transition-all duration-200"
                  style={{ color: '#ffffff' }}>
                  {t('canvas.close')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ──── Action Confirmation Modal ──── */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-fade-in">
          <div className="relative w-full max-w-md animate-scale-in">
            {/* Outer glow ring */}
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-indigo-500/20 via-purple-500/20 to-indigo-500/20 blur-xl animate-pulse" />

            <div className="relative glass-surface p-8 space-y-6 border-indigo-500/15 shadow-[0_0_60px_rgba(99,102,241,0.15)]">
              {/* Top accent line */}
              <div className="absolute top-0 left-6 right-6 h-[2px] bg-gradient-to-r from-transparent via-indigo-400 to-transparent" />

              {/* Icon + header */}
              <div className="text-center space-y-3">
                <div className="relative mx-auto w-fit">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center
                                  ring-1 ring-indigo-500/20 shadow-[0_0_20px_rgba(99,102,241,0.2)]">
                    <Sparkles className="w-8 h-8 text-indigo-400" />
                  </div>
                  <div className="absolute inset-0 rounded-2xl bg-indigo-500/10 animate-pulse" />
                </div>

                <h2 className="text-xl font-bold text-white leading-snug">
                  {confirmAction.title}
                </h2>
                <p className="text-base text-gray-300 leading-relaxed max-w-sm mx-auto">
                  {confirmAction.descriptionArgs
                    ? t(confirmAction.descriptionKey).replace(/\{(\w+)\}/g, (_, k) => confirmAction.descriptionArgs![k] || '')
                    : t(confirmAction.descriptionKey)}
                </p>
              </div>

              {/* Bottom accent line */}
              <div className="h-px bg-gradient-to-r from-transparent via-indigo-500/20 to-transparent" />

              {/* Buttons */}
              <div className="flex justify-center gap-4">
                <button
                  onClick={() => setConfirmAction(null)}
                  className="px-6 py-2.5 rounded-xl text-base font-medium text-gray-400 hover:text-white
                             hover:bg-white/5 border border-transparent hover:border-white/10
                             transition-all duration-200 active:scale-95"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={executeConfirmed}
                  className={`px-6 py-2.5 rounded-xl text-base font-bold transition-all duration-300
                             hover:scale-105 active:scale-95
                             ${confirmAction.type === 'delete'
                               ? 'bg-red-600 hover:bg-red-500 shadow-lg shadow-red-500/30 hover:shadow-red-500/50'
                               : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50'
                             }`}
                  style={{ color: '#ffffff' }}
                >
                  {t('common.confirm')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
