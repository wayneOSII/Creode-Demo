import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useNav } from '@/hooks/useNav';
import { useAuth } from '@/hooks/useAuth';
import { useLang } from '@/hooks/useLang';
import { supabase } from '@/lib/supabase';
import { api } from '@/lib/api';
import type { Project, Task } from '@/types';
import {
  ArrowLeft,
  Play,
  Plus,
  Trash2,
  Check,
  Loader2,
  Edit3,
  AlertTriangle,
  Sparkles,
  Layers,
} from 'lucide-react';
import toast from 'react-hot-toast';

const MAX_TASKS = 10;

export default function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { user, loading: authLoading } = useAuth();
  const { go } = useNav();
  const { t } = useLang();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTask, setEditingTask] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editColor, setEditColor] = useState('#6366f1');
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newColor, setNewColor] = useState('#6366f1');
  const [adding, setAdding] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const addFormRef = useRef<HTMLDivElement>(null);

  const atLimit = tasks.length >= MAX_TASKS;

  useEffect(() => {
    if (!authLoading && !user) go('/login', { replace: true });
  }, [user, authLoading, go]);

  useEffect(() => {
    if (!projectId || !user) return;
    Promise.all([
      supabase.from('projects').select('*').eq('id', projectId).single(),
      supabase.from('tasks').select('*').eq('project_id', projectId).order('order_index'),
    ]).then(([projRes, taskRes]) => {
      if (projRes.data) setProject(projRes.data as Project);
      if (taskRes.data) setTasks(taskRes.data as Task[]);
      setLoading(false);
    });

    const channel = supabase
      .channel(`tasks-${projectId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `project_id=eq.${projectId}` }, () => {
        supabase.from('tasks').select('*').eq('project_id', projectId).order('order_index').then(({ data }) => {
          if (data) setTasks(data as Task[]);
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [projectId, user]);

  const addTask = async () => {
    if (!newTitle.trim() || !user || !projectId || atLimit) return;
    setAdding(true);
    const { data, error } = await supabase.from('tasks').insert({
      project_id: projectId, user_id: user.id, title: newTitle.trim(),
      description: newDesc.trim(), order_index: tasks.length, color: newColor,
    }).select().single();
    if (!error && data) {
      setTasks([...tasks, data as Task]);
      setNewTitle(''); setNewDesc(''); setNewColor('#6366f1');
      setShowAddForm(false);
    } else { toast.error(t('project.addTaskError')); }
    setAdding(false);
  };

  const aiGenerateTask = async () => {
    if (!project?.goal || !user || !projectId || atLimit) return;
    setAiGenerating(true);
    try {
      const existingTitles = tasks.map((t) => t.title).join('、');
      const goalWithContext = existingTitles
        ? `${project.goal}\n\n${t('project.existingTasks')}: ${existingTitles}\n${t('project.avoidDuplicate')}`
        : project.goal;
      const result = await api.generateTasks({ goal: goalWithContext, task_count: 1 });
      if (result.tasks.length > 0) {
        const palette = ['#a855f7','#f97316','#06b6d4','#22c55e','#92400e','#3b82f6','#8b5cf6','#ec4899','#14b8a6','#f59e0b'];
        const task = result.tasks[0];
        const { data, error } = await supabase.from('tasks').insert({
          project_id: projectId, user_id: user.id, title: task.title,
          description: task.description, order_index: tasks.length, color: palette[tasks.length % palette.length],
        }).select().single();
        if (!error && data) { setTasks([...tasks, data as Task]); }
      }
    } catch { toast.error(t('project.aiGenError')); }
    finally { setAiGenerating(false); }
  };

  const deleteTask = async (taskId: string) => {
    await supabase.from('tasks').delete().eq('id', taskId);
    setTasks(tasks.filter((t) => t.id !== taskId));
  };

  const startEdit = (task: Task) => {
    setEditingTask(task.id); setEditTitle(task.title); setEditDesc(task.description); setEditColor(task.color || '#6366f1');
  };

  const saveEdit = async (taskId: string) => {
    const { error } = await supabase.from('tasks').update({ title: editTitle, description: editDesc, color: editColor }).eq('id', taskId);
    if (!error) {
      setTasks(tasks.map((t) => t.id === taskId ? { ...t, title: editTitle, description: editDesc, color: editColor } : t));
      setEditingTask(null);
    }
  };

  const deleteProject = async () => {
    if (!projectId || !user) return;
    setDeleting(true);
    try {
      await supabase.from('canvas_nodes').delete().eq('project_id', projectId);
      await supabase.from('tasks').delete().eq('project_id', projectId);
      const { error } = await supabase.from('projects').delete().eq('id', projectId);
      if (error) throw error;
      go('/dashboard');
    } catch { toast.error(t('project.deleteError')); }
    finally { setDeleting(false); }
  };

  const toggleStatus = async (task: Task) => {
    const newStatus = task.status === 'completed' ? 'pending' : task.status === 'in_progress' ? 'completed' : 'in_progress';
    await supabase.from('tasks').update({ status: newStatus }).eq('id', task.id);
    setTasks(tasks.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t)));
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen bg-canvas-bg"><Loader2 className="w-8 h-8 animate-spin text-indigo-400" /></div>;
  }

  return (
    <div className="min-h-screen bg-canvas-bg">
      {/* Header */}
      <header className="h-16 flex items-center gap-3 px-4 bg-canvas-surface/90 backdrop-blur-md border-b border-indigo-500/20 flex-shrink-0 relative overflow-hidden">
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-indigo-400/60 to-transparent animate-pulse" />
        <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/3 via-transparent to-purple-500/3 pointer-events-none" />

        <button onClick={() => go(-1)} className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-all duration-200 active:scale-90">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-semibold text-lg truncate bg-gradient-to-r from-indigo-300 via-purple-300 to-indigo-300 bg-clip-text text-transparent project-title">
            {project?.title || t('project.untitled')}
          </h1>
        </div>
        <button onClick={() => go(`/canvas/${projectId}`)} disabled={tasks.length === 0}
          className="flex items-center gap-1.5 py-1.5 px-3 rounded-lg font-medium text-xs transition-all duration-300
                     bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500
                     shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40
                     hover:scale-105 active:scale-95
                     disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
          style={{ color: '#ffffff' }}>
          <Play className="w-3.5 h-3.5" />{t('project.enterCanvas')}
        </button>
        <button onClick={() => setShowDeleteConfirm(true)} className="p-2 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-all duration-200 active:scale-90">
          <Trash2 className="w-4 h-4" />
        </button>
      </header>

      <div className="max-w-2xl mx-auto p-6">
        {/* Goal section */}
        <div className="mb-8 animate-fade-in">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1.5 h-5 rounded-full bg-indigo-400/60" />
            <h2 className="text-sm font-semibold text-indigo-300/70 uppercase tracking-[0.15em]">
              {t('project.tasks')}
              <span className="text-indigo-400 ml-1.5 font-mono">({tasks.length}/{MAX_TASKS})</span>
            </h2>
          </div>
          <div className="glass-surface p-5 border-indigo-500/10 shadow-[0_0_20px_rgba(99,102,241,0.05)]">
            <p className="text-base text-gray-300 leading-relaxed">{project?.goal}</p>
          </div>
        </div>

        {/* Task list */}
        <div className="space-y-2.5 stagger-children">
          {tasks.map((task, i) => {
            const isCompleted = task.status === 'completed';
            const isInProgress = task.status === 'in_progress';
            return (
              <div
                key={task.id}
                className={`group relative overflow-hidden rounded-xl border transition-all duration-300 ${
                  isCompleted
                    ? 'border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.05)]'
                    : isInProgress
                    ? 'border-indigo-500/20 shadow-[0_0_10px_rgba(99,102,241,0.08)]'
                    : 'border-canvas-border hover:border-indigo-500/20 hover:shadow-[0_0_10px_rgba(99,102,241,0.04)] bg-canvas-surface/50'
                } ${editingTask === task.id ? 'ring-1 ring-indigo-500/30 shadow-[0_0_12px_rgba(99,102,241,0.15)]' : ''}`}
                style={{
                  background: isCompleted
                    ? 'linear-gradient(135deg, rgba(16,185,129,0.04), rgba(16,185,129,0.01))'
                    : isInProgress
                    ? 'linear-gradient(135deg, rgba(99,102,241,0.05), rgba(99,102,241,0.01))'
                    : undefined,
                }}
              >
                {/* Left accent bar */}
                <div className={`absolute left-0 top-0 bottom-0 w-1 transition-all duration-300 ${
                  isCompleted ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]' :
                  isInProgress ? 'bg-indigo-500 shadow-[0_0_6px_rgba(99,102,241,0.3)]' :
                  'bg-transparent group-hover:bg-indigo-500/30'
                }`} />

                <div className="flex items-stretch gap-0">
                  {/* Status + number column */}
                  <div className="flex flex-col items-center justify-center w-16 flex-shrink-0 py-4 gap-2.5">
                    <button
                      onClick={() => toggleStatus(task)}
                      className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${
                        isCompleted
                          ? 'bg-emerald-500 border-emerald-500 scale-100 shadow-[0_0_8px_rgba(16,185,129,0.3)]'
                          : isInProgress
                          ? 'border-indigo-400 bg-indigo-400/20 hover:bg-indigo-400/40 hover:shadow-[0_0_6px_rgba(99,102,241,0.3)]'
                          : 'border-gray-600 hover:border-indigo-400 hover:bg-indigo-400/10'
                      }`}
                    >
                      {isCompleted && <Check className="w-3 h-3 text-white" />}
                    </button>
                    <span className="text-xs text-gray-600 font-mono tabular-nums">{i + 1}</span>
                  </div>

                  {/* Content area */}
                  <div className="flex-1 min-w-0 py-3 pr-3">
                    {editingTask === task.id ? (
                      <div className="space-y-3 animate-scale-in">
                        <input
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="input-field text-sm font-medium"
                          placeholder={t('project.taskTitle')}
                          autoFocus
                        />
                        <textarea
                          value={editDesc}
                          onChange={(e) => setEditDesc(e.target.value)}
                          className="input-field text-sm h-16 resize-none"
                          placeholder={t('project.taskDesc')}
                        />
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <span className="text-[10px] text-gray-500 uppercase tracking-wider">{t('project.color')}</span>
                            <div className="relative">
                              <input type="color" value={editColor} onChange={(e) => setEditColor(e.target.value)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                              <div className="w-8 h-8 rounded-lg border-2 border-canvas-border hover:border-gray-500 transition-colors cursor-pointer flex items-center justify-center" style={{ backgroundColor: editColor }}>
                                <span className="w-3 h-3 rounded-full bg-white/20 backdrop-blur-sm" />
                              </div>
                            </div>
                            <span className="text-[10px] text-gray-600 font-mono uppercase">{editColor}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button onClick={() => setEditingTask(null)} className="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-white/5 transition-all duration-200">{t('common.cancel')}</button>
                            <button onClick={() => saveEdit(task.id)} className="btn-primary text-xs py-1.5 px-4 rounded-lg flex items-center gap-1.5">
                              <Check className="w-3 h-3" />{t('project.save')}
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="animate-fade-in">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: task.color || '#6366f1', boxShadow: `0 0 6px ${task.color || '#6366f1'}80` }} />
                          <h3 className={`text-lg font-semibold ${isCompleted ? 'line-through text-gray-500' : 'text-white'}`}>
                            {task.title}
                          </h3>
                        </div>
                        {task.description && (
                          <p className="text-sm text-gray-500 ml-5 leading-relaxed line-clamp-2">{task.description}</p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  {editingTask !== task.id && (
                    <div className="flex items-center gap-0.5 pr-2 py-3 opacity-0 group-hover:opacity-100 transition-all duration-200 translate-x-2 group-hover:translate-x-0">
                      <button onClick={() => startEdit(task)} className="p-2 rounded-lg text-gray-400 hover:text-indigo-400 hover:bg-indigo-500/10 transition-all duration-150"><Edit3 className="w-3.5 h-3.5" /></button>
                      <button onClick={() => deleteTask(task.id)} className="p-2 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-all duration-150"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Add task */}
        <div className="mt-3" ref={addFormRef}>
          {!showAddForm ? (
            <button
              onClick={() => { if (!atLimit) setShowAddForm(true); }}
              disabled={atLimit}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed
                         border-canvas-border text-gray-500 hover:text-indigo-400 hover:border-indigo-500/40
                         hover:shadow-[0_0_16px_rgba(99,102,241,0.08)]
                         transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" />
              {atLimit ? t('project.maxTasksReached') : t('project.addTask')}
            </button>
          ) : (
            <div className="glass-surface p-5 space-y-3 animate-scale-in border-indigo-500/10 shadow-[0_0_20px_rgba(99,102,241,0.06)]">
              <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder={t('project.taskTitle')}
                className="input-field text-sm font-medium" autoFocus onKeyDown={(e) => e.key === 'Enter' && addTask()} />
              <textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder={t('project.taskDesc')}
                className="input-field text-sm h-16 resize-none" />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="text-[10px] text-gray-500 uppercase tracking-wider">{t('project.color')}</span>
                  <div className="relative">
                    <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                    <div className="w-8 h-8 rounded-lg border-2 border-canvas-border hover:border-gray-500 transition-colors cursor-pointer flex items-center justify-center" style={{ backgroundColor: newColor }}>
                      <span className="w-3 h-3 rounded-full bg-white/20 backdrop-blur-sm" />
                    </div>
                  </div>
                  <span className="text-[10px] text-gray-600 font-mono uppercase">{newColor}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => { setShowAddForm(false); setNewTitle(''); setNewDesc(''); }}
                    className="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-white/5 transition-all duration-200">{t('common.cancel')}</button>
                  <button onClick={aiGenerateTask} disabled={aiGenerating || atLimit}
                    className="px-3 py-1.5 rounded-lg text-xs border border-indigo-500/30 text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 flex items-center gap-1 transition-all duration-200 disabled:opacity-40">
                    {aiGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" /> : <Sparkles className="w-3.5 h-3.5 flex-shrink-0" />}{t('project.aiGenerate')}
                  </button>
                  <button onClick={addTask} disabled={!newTitle.trim() || adding || aiGenerating}
                    className="btn-primary text-xs py-1.5 px-4 rounded-lg flex items-center gap-1.5">
                    <Plus className="w-3 h-3" />{t('project.addTask')}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delete modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="glass-surface p-6 w-full max-w-md space-y-4 animate-scale-in border-red-500/10 shadow-[0_0_30px_rgba(239,68,68,0.08)]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center shadow-[0_0_12px_rgba(239,68,68,0.2)]">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">{t('project.deleteTitle')}</h2>
                <p className="text-sm text-gray-400">{t('project.irreversible')}</p>
              </div>
            </div>
            <p className="text-sm text-gray-300">{t('project.deleteConfirm').replace('{title}', project?.title || '')}</p>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowDeleteConfirm(false)} className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-white/5 transition-all duration-200" disabled={deleting}>{t('common.cancel')}</button>
              <button onClick={deleteProject} disabled={deleting}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-medium rounded-lg transition-all duration-200 disabled:opacity-50 flex items-center gap-2 shadow-[0_0_10px_rgba(239,68,68,0.2)]">
                {deleting ? <><Loader2 className="w-4 h-4 animate-spin" />{t('project.deleting')}</> : <><Trash2 className="w-4 h-4" />{t('project.confirmDelete')}</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
