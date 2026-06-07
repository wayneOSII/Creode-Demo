import { useEffect, useState, useRef } from 'react';
import { useNav } from '@/hooks/useNav';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { useLang } from '@/hooks/useLang';
import { supabase } from '@/lib/supabase';
import { api } from '@/lib/api';
import type { Project } from '@/types';
import {
  Plus, LogOut, Loader2, Sparkles, Settings, LayoutDashboard,
  FolderOpen, Clock, Archive, Search, BarChart3,
  MoreHorizontal, CheckCircle, Trash2, PlayCircle, Monitor, Globe, Zap, ChevronDown,
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function Dashboard() {
  const { user, profile, signOut, loading: authLoading, error: authError } = useAuth();
  const { lightMode, toggleTheme } = useTheme();
  const { lang, setLang, t } = useLang();
  const { go } = useNav();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [goal, setGoal] = useState('');
  const [creating, setCreating] = useState(false);
  const [taskCount, setTaskCount] = useState<number | 'auto'>('auto');
  const [taskMenuOpen, setTaskMenuOpen] = useState(false);
  const taskMenuRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
      if (taskMenuRef.current && !taskMenuRef.current.contains(e.target as Node)) setTaskMenuOpen(false);
    };
    if (menuOpen || taskMenuOpen) document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [menuOpen, taskMenuOpen]);

  const userName = profile?.email?.split('@')[0] || '';

  useEffect(() => {
    if (!authLoading && !user) go('/login', { replace: true });
  }, [user, authLoading, go]);

  useEffect(() => {
    if (!user) return;
    supabase.from('projects').select('*').order('updated_at', { ascending: false })
      .then(({ data, error }) => { if (!error && data) setProjects(data as Project[]); setLoading(false); });
  }, [user]);

  const handleCreate = async () => {
    if (!newTitle.trim() || !goal.trim() || !user) return;
    setCreating(true);
    try {
      const { data: project, error: projErr } = await supabase.from('projects')
        .insert({ user_id: user.id, title: newTitle.trim(), goal: goal.trim() }).select().single();
      if (projErr || !project) throw projErr || new Error('Create failed');
      const count = taskCount === 'auto' ? (Math.floor(Math.random() * 3) + 5) : taskCount;
      toast.promise(Promise.all([
        api.generateTasks({ goal, task_count: count }).then(async (result) => {
          const palette = ['#a855f7','#f97316','#06b6d4','#22c55e','#92400e','#3b82f6','#8b5cf6','#ec4899','#14b8a6','#f59e0b'];
          const tasks = result.tasks.map((t, i) => ({ project_id: project.id, user_id: user.id, title: t.title, description: t.description, order_index: i, color: palette[i % palette.length] }));
          const { error: taskErr } = await supabase.from('tasks').insert(tasks);
          if (taskErr) throw taskErr;
        }),
        api.generateProjectPrompts(goal, project.id).catch(() => {}),
      ]), { loading: t('dashboard.aiProcessing'), success: t('dashboard.success'), error: t('dashboard.error') });
      go(`/project/${project.id}`);
    } catch { toast.error(t('dashboard.error')); }
    finally { setCreating(false); }
  };

  const [filter, setFilter] = useState<'all' | 'active' | 'completed' | 'archived'>('all');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'projects' | 'usage'>('projects');
  const [menuProjectId, setMenuProjectId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ id: string; action: string; title: string } | null>(null);
  const [usageData, setUsageData] = useState<Array<{ id: string; endpoint: string; prompt_tokens: number; completion_tokens: number; total_tokens: number; created_at: string }>>([]);
  const [usageLoading, setUsageLoading] = useState(false);

  const executeProjectAction = async () => {
    if (!confirmAction) return;
    const { id, action } = confirmAction;
    try {
      if (action === 'active') { await supabase.from('projects').update({ status: 'active' }).eq('id', id); setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, status: 'active' } : p))); toast.success(t('dashboard.setActiveToast')); }
      else if (action === 'complete') { await supabase.from('projects').update({ status: 'completed' }).eq('id', id); setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, status: 'completed' } : p))); toast.success(t('dashboard.setCompleteToast')); }
      else if (action === 'archive') { await supabase.from('projects').update({ status: 'archived' }).eq('id', id); setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, status: 'archived' } : p))); toast.success(t('dashboard.setArchiveToast')); }
      else if (action === 'delete') { await supabase.from('canvas_nodes').delete().eq('project_id', id); await supabase.from('tasks').delete().eq('project_id', id); await supabase.from('projects').delete().eq('id', id); setProjects((prev) => prev.filter((p) => p.id !== id)); toast.success(t('dashboard.projectDeletedToast')); }
    } catch { toast.error(t('dashboard.actionError')); }
    setConfirmAction(null); setMenuProjectId(null);
  };

  const loadUsage = async () => { setUsageLoading(true); try { const data = await api.getUsage(30); setUsageData(data.usage || []); } catch { toast.error(t('dashboard.usageLoadError')); } finally { setUsageLoading(false); } };

  const filteredProjects = projects.filter((p) => {
    if (filter !== 'all' && p.status !== filter) return false;
    if (search.trim()) { const q = search.toLowerCase(); return p.title.toLowerCase().includes(q) || p.goal.toLowerCase().includes(q); }
    return true;
  });

  if (authError) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-canvas-bg p-6">
        <div className="glass-surface p-8 max-w-md text-center space-y-4 border-red-500/10 shadow-[0_0_30px_rgba(239,68,68,0.08)]">
          <div className="text-4xl">⚠️</div>
          <h2 className="text-xl font-semibold text-red-400">{t('common.error')}</h2>
          <p className="text-sm text-gray-400 font-mono bg-canvas-bg p-3 rounded-lg text-left whitespace-pre-wrap">{authError}</p>
        </div>
      </div>
    );
  }

  if (authLoading) {
    return <div className="flex items-center justify-center min-h-screen"><Loader2 className="w-8 h-8 animate-spin text-indigo-400" /></div>;
  }

  return (
    <div className="h-screen flex flex-col bg-canvas-bg overflow-hidden">
      {/* Header */}
      <header className="h-16 flex items-center justify-between px-4 bg-canvas-surface/90 backdrop-blur-md border-b border-indigo-500/20 flex-shrink-0 relative">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-indigo-400/60 to-transparent animate-pulse" />
          <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/3 via-transparent to-purple-500/3" />
        </div>
        <h1 className="font-bold text-2xl bg-gradient-to-r from-indigo-400 via-purple-400 to-amber-400 bg-clip-text text-transparent">Creode</h1>
        <div className="relative" ref={menuRef}>
          <button onClick={() => setMenuOpen(!menuOpen)} className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-white/5 transition-all duration-200 text-sm">
            <span className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs font-bold shadow-[0_0_6px_rgba(99,102,241,0.3)]">{userName.charAt(0).toUpperCase()}</span>
            <span className="text-gray-300 text-xs">{userName}</span>
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-44 rounded-xl p-1.5 shadow-2xl z-50 border border-indigo-500/15 animate-scale-in"
              style={{ background: lightMode ? 'rgba(255,255,255,0.98)' : 'rgba(20,20,35,0.98)', backdropFilter: 'blur(12px)' }}>
              {[{ icon: <Settings className="w-4 h-4" />, label: t('nav.settings'), action: () => go('/settings') },
                { icon: <Monitor className="w-4 h-4" />, label: lightMode ? t('theme.dark') : t('theme.light'), action: toggleTheme },
                { icon: <Globe className="w-4 h-4" />, label: lang === 'zh-TW' ? 'English' : '繁體中文', action: () => setLang(lang === 'zh-TW' ? 'en' : 'zh-TW') },
                { icon: <LogOut className="w-4 h-4" />, label: t('nav.logout'), action: signOut },
              ].map((item, i) => (
                <button key={i} onClick={() => { item.action(); setMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-300 hover:text-white hover:bg-white/5 transition-all duration-150">
                  {item.icon}{item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      <div className="flex-1 flex">
        {/* Sidebar */}
        <aside className="w-56 flex-shrink-0 bg-canvas-surface/80 backdrop-blur-sm border-r border-indigo-500/15 p-3 flex flex-col relative">
          <div className="absolute right-0 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-indigo-400/30 to-transparent" />
          <nav className="space-y-1 flex-1 w-full">
            {[
              { icon: <LayoutDashboard className="w-4 h-4 flex-shrink-0" />, label: t('dashboard.allProjects'), count: projects.length, active: view === 'projects' && filter === 'all', onClick: () => { setView('projects'); setFilter('all'); } },
              { icon: <Clock className="w-4 h-4 flex-shrink-0" />, label: t('dashboard.inProgress'), count: projects.filter((p) => p.status === 'active').length, active: view === 'projects' && filter === 'active', onClick: () => { setView('projects'); setFilter('active'); } },
              { icon: <FolderOpen className="w-4 h-4 flex-shrink-0" />, label: t('dashboard.completed'), count: projects.filter((p) => p.status === 'completed').length, active: view === 'projects' && filter === 'completed', onClick: () => { setView('projects'); setFilter('completed'); } },
              { icon: <Archive className="w-4 h-4 flex-shrink-0" />, label: t('dashboard.archived'), count: projects.filter((p) => p.status === 'archived').length, active: view === 'projects' && filter === 'archived', onClick: () => { setView('projects'); setFilter('archived'); } },
            ].map((item, i) => (
              <button key={i} onClick={item.onClick}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-200 border ${
                  item.active ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/20 shadow-[0_0_10px_rgba(99,102,241,0.1)]' : 'text-gray-400 hover:text-white hover:bg-white/5 border-transparent'
                }`}>
                {item.icon}<span className="flex-1 text-left truncate">{item.label}</span>
                <span className="text-xs text-gray-600 font-mono tabular-nums">{item.count}</span>
              </button>
            ))}
          </nav>
          <div className="pt-3 border-t border-indigo-500/10 space-y-1 w-full">
            <button onClick={() => { setView('usage'); loadUsage(); }}
              className={`w-full flex items-center gap-2.5 rounded-lg text-sm transition-all duration-200 border px-3 py-2 ${
                view === 'usage' ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/20 shadow-[0_0_10px_rgba(99,102,241,0.1)]' : 'text-gray-400 hover:text-white hover:bg-white/5 border-transparent'
              }`}>
              <BarChart3 className="w-4 h-4 flex-shrink-0" />{t('dashboard.usage')}
            </button>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 overflow-y-auto p-6">
          {view === 'usage' ? (
            <UsageView data={usageData} loading={usageLoading} projectCount={projects.length} projects={projects} t={t} lightMode={lightMode} />
          ) : (
            <>
              <div className="flex items-center gap-3 mb-6">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('dashboard.search')}
                    className="w-full pl-9 pr-4 py-2 bg-canvas-surface/80 border border-indigo-500/15 rounded-xl text-white text-sm placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-all duration-200" />
                </div>
                <button onClick={() => { setNewTitle(''); setGoal(''); setTaskCount('auto'); setShowNewModal(true); }}
                  className="flex items-center gap-2 py-2 px-4 rounded-xl font-medium text-sm transition-all duration-300
                             bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500
                             shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40 hover:scale-105 active:scale-95 flex-shrink-0"
                  style={{ color: '#ffffff' }}>
                  <Plus className="w-4 h-4" />{t('dashboard.newProject')}
                </button>
              </div>

              {loading ? (
                <div className="flex items-center justify-center h-full text-gray-500"><Loader2 className="w-6 h-6 animate-spin mr-2" />{t('dashboard.loading')}</div>
              ) : filteredProjects.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 flex items-center justify-center mx-auto mb-4 shadow-[0_0_16px_rgba(99,102,241,0.1)]">
                      <Sparkles className="w-8 h-8 text-indigo-400/60" />
                    </div>
                    <p className="text-gray-500 text-lg mb-2">{t('dashboard.noProjects')}</p>
                    <p className="text-gray-600 text-sm">{t('dashboard.noProjectsDesc')}</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 stagger-children">
                  {filteredProjects.map((p) => (
                    <div key={p.id} className="group relative rounded-xl transition-all duration-300 hover:-translate-y-0.5 hover:border-indigo-500/30 hover:shadow-[0_0_20px_rgba(99,102,241,0.1)]"
                      style={{
                        background: lightMode
                          ? 'linear-gradient(135deg, rgba(255,255,255,0.85), rgba(248,250,252,0.85))'
                          : 'linear-gradient(135deg, rgba(20,20,35,0.6), rgba(25,25,40,0.6))',
                        border: lightMode ? '1px solid rgba(203,213,225,0.6)' : '1px solid rgba(59,59,82,0.4)',
                        backdropFilter: 'blur(4px)',
                      }}>
                      <div className="absolute top-0 left-4 right-4 h-[2px] rounded-b opacity-0 group-hover:opacity-40 transition-opacity duration-300"
                        style={{ background: `linear-gradient(90deg, transparent, ${p.status === 'active' ? '#22c55e' : p.status === 'completed' ? '#818cf8' : '#6b7280'}, transparent)` }} />
                      <button onClick={() => go(`/project/${p.id}`)} className="w-full text-left p-5">
                        <h3 className="font-semibold text-white truncate pr-8">{p.title || t('project.untitled')}</h3>
                        <p className="text-sm text-gray-500 mt-1 line-clamp-2">{p.goal}</p>
                        <div className="flex items-center gap-2 mt-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            p.status === 'active' ? 'bg-emerald-500/15 text-emerald-400' :
                            p.status === 'completed' ? 'bg-indigo-500/15 text-indigo-400' :
                            'bg-gray-500/15 text-gray-400'
                          }`}>
                            {p.status === 'active' ? t('dashboard.inProgress') : p.status === 'completed' ? t('dashboard.completed') : t('dashboard.archived')}
                          </span>
                          <span className="text-xs text-gray-600 font-mono">{new Date(p.updated_at).toLocaleDateString(lang === 'zh-TW' ? 'zh-TW' : 'en')}</span>
                        </div>
                      </button>
                      <div className="absolute top-3 right-3">
                        <button onClick={(e) => { e.stopPropagation(); setMenuProjectId(menuProjectId === p.id ? null : p.id); }}
                          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/5 text-gray-500 hover:text-gray-300 transition-all duration-150">
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                        {menuProjectId === p.id && (
                          <div className="absolute right-0 top-full mt-1 w-32 rounded-xl p-1 shadow-2xl z-20 border border-indigo-500/15 animate-scale-in"
                            style={{ background: lightMode ? 'rgba(255,255,255,0.98)' : 'rgba(20,20,35,0.98)', backdropFilter: 'blur(12px)' }}>
                            {[
                              { icon: <PlayCircle className="w-3.5 h-3.5" />, label: t('dashboard.inProgress'), action: 'active', hover: 'hover:text-blue-400' },
                              { icon: <CheckCircle className="w-3.5 h-3.5" />, label: t('dashboard.completed'), action: 'complete', hover: 'hover:text-green-400' },
                              { icon: <Archive className="w-3.5 h-3.5" />, label: t('dashboard.archived'), action: 'archive', hover: 'hover:text-amber-400' },
                              { icon: <Trash2 className="w-3.5 h-3.5" />, label: t('common.delete'), action: 'delete', hover: 'hover:text-red-400' },
                            ].map((item, i) => (
                              <button key={i} onClick={(e) => { e.stopPropagation(); setConfirmAction({ id: p.id, action: item.action, title: p.title }); }}
                                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-gray-300 ${item.hover} hover:bg-white/5 transition-all duration-150`}>
                                {item.icon}{item.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* Confirm Modal */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-fade-in">
          <div className="relative w-full max-w-sm animate-scale-in">
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-indigo-500/20 via-purple-500/20 to-indigo-500/20 blur-xl animate-pulse" />
            <div className="relative glass-surface p-8 space-y-6 border-indigo-500/15 shadow-[0_0_60px_rgba(99,102,241,0.15)]">
              <div className="absolute top-0 left-6 right-6 h-[2px] bg-gradient-to-r from-transparent via-indigo-400 to-transparent" />
              <div className="text-center space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-indigo-500/15 flex items-center justify-center mx-auto shadow-[0_0_16px_rgba(99,102,241,0.2)]">
                  {confirmAction.action === 'delete' ? <Trash2 className="w-7 h-7 text-red-400" /> : <Zap className="w-7 h-7 text-indigo-400" />}
                </div>
                <h2 className="text-xl font-bold text-white">{confirmAction.action === 'active' ? t('project.setActive') : confirmAction.action === 'complete' ? t('project.setComplete') : confirmAction.action === 'archive' ? t('project.setArchive') : t('project.deleteProject')}</h2>
                <p className="text-base text-gray-300">{confirmAction.action === 'active' ? t('project.setActiveConfirm').replace('{title}', confirmAction.title) : confirmAction.action === 'complete' ? t('project.setCompleteConfirm').replace('{title}', confirmAction.title) : confirmAction.action === 'archive' ? t('project.setArchiveConfirm').replace('{title}', confirmAction.title) : t('project.deleteConfirm').replace('{title}', confirmAction.title)}</p>
              </div>
              <div className="flex justify-center gap-4 pt-2 border-t border-indigo-500/10">
                <button onClick={() => setConfirmAction(null)} className="px-5 py-2.5 rounded-xl text-base font-medium text-gray-400 hover:text-white hover:bg-white/5 border border-transparent hover:border-white/10 transition-all duration-200 active:scale-95">{t('common.cancel')}</button>
                <button onClick={executeProjectAction}
                  className={`px-5 py-2.5 rounded-xl text-base font-bold transition-all duration-300 hover:scale-105 active:scale-95 ${
                    confirmAction.action === 'delete' ? 'bg-red-600 hover:bg-red-500 shadow-lg shadow-red-500/30' : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 shadow-lg shadow-indigo-500/30'
                  }`} style={{ color: '#ffffff' }}>{t('common.confirm')}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Project Modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-fade-in">
          <div className="relative w-full max-w-lg animate-scale-in">
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-indigo-500/20 via-purple-500/20 to-indigo-500/20 blur-xl animate-pulse" />
            <div className="relative glass-surface p-8 space-y-5 border-indigo-500/15 shadow-[0_0_60px_rgba(99,102,241,0.15)]">
              <div className="absolute top-0 left-6 right-6 h-[2px] bg-gradient-to-r from-transparent via-indigo-400 to-transparent" />
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/15 flex items-center justify-center shadow-[0_0_12px_rgba(99,102,241,0.2)]">
                  <Sparkles className="w-5 h-5 text-indigo-400" />
                </div>
                <h2 className="text-xl font-bold text-white">{t('dashboard.createProject')}</h2>
              </div>
              <p className="text-sm text-gray-400">{t('dashboard.createDesc')}</p>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">{t('dashboard.projectTitle')}</label>
                <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder={t('dashboard.newProject')}
                  className="w-full px-4 py-2.5 rounded-xl bg-black/20 border border-indigo-500/20 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-all duration-200" autoFocus />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">{t('dashboard.projectGoal')}</label>
                <textarea value={goal} onChange={(e) => setGoal(e.target.value)} placeholder={t('dashboard.placeholder')}
                  className="w-full px-4 py-3 rounded-xl bg-black/20 border border-indigo-500/20 text-white text-sm h-28 resize-none placeholder-gray-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-all duration-200" />
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-300 flex-shrink-0">{t('dashboard.taskCount')}</label>
                <div className="relative" ref={taskMenuRef}>
                  <button onClick={() => setTaskMenuOpen(!taskMenuOpen)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-black/20 border border-indigo-500/20 text-white text-sm
                               hover:border-indigo-500/40 transition-all duration-200 min-w-[56px]">
                    <span>{taskCount === 'auto' ? t('dashboard.random') : taskCount}</span>
                    <ChevronDown className={`w-3.5 h-3.5 text-gray-500 transition-transform duration-200 ${taskMenuOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {taskMenuOpen && (
                    <div className="absolute top-full left-0 mt-1 w-full rounded-xl p-1 shadow-2xl z-30 animate-scale-in max-h-48 overflow-y-auto"
                      style={{ background: lightMode ? 'rgba(255,255,255,0.98)' : 'rgba(20,20,35,0.98)', border: '1px solid rgba(99,102,241,0.2)', backdropFilter: 'blur(12px)' }}>
                      {(['auto',1,2,3,4,5,6,7,8,9,10] as (number | 'auto')[]).map((n) => (
                        <button key={n} onClick={() => { setTaskCount(n); setTaskMenuOpen(false); }}
                          className={`w-full text-center px-3 py-2 rounded-lg text-sm transition-all duration-150 ${
                            taskCount === n ? 'bg-indigo-500/15 text-indigo-300' : 'text-gray-400 hover:text-white hover:bg-white/5'
                          }`}>{n === 'auto' ? t('dashboard.random') : n}</button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-1">
                <button onClick={() => setShowNewModal(false)} className="px-5 py-2.5 rounded-xl text-base font-medium text-gray-400 hover:text-white hover:bg-white/5 border border-transparent hover:border-white/10 transition-all duration-200 active:scale-95">{t('common.cancel')}</button>
                <button onClick={handleCreate} disabled={!newTitle.trim() || !goal.trim() || creating}
                  className="px-5 py-2.5 rounded-xl text-base font-bold transition-all duration-300 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:scale-105 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center gap-2"
                  style={{ color: '#ffffff' }}>
                  {creating ? <><Loader2 className="w-4 h-4 animate-spin" />{t('dashboard.aiProcessing')}</> : <><Sparkles className="w-4 h-4" />{t('dashboard.startCreate')}</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function UsageView({ data, loading, projectCount, projects, t, lightMode }: { projectCount?: number; projects?: Array<{ status: string }>; t: (key: string) => string; data: Array<{ id: string; endpoint: string; prompt_tokens: number; completion_tokens: number; total_tokens: number; created_at: string }>; loading: boolean; lightMode: boolean; }) {
  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="w-6 h-6 animate-spin text-indigo-400 mr-2" /><span className="text-gray-400">{t('dashboard.loadingUsage')}</span></div>;

  const activeCount = projects?.filter((p) => p.status === 'active').length || 0;
  const completedCount = projects?.filter((p) => p.status === 'completed').length || 0;
  const archivedCount = projects?.filter((p) => p.status === 'archived').length || 0;
  const total = (projectCount || 0) || 1;
  const fmt = (n: number) => n.toLocaleString();

  return (
    <div>
      <h2 className="text-lg font-bold mb-6 flex items-center gap-2 text-indigo-300/70 uppercase tracking-[0.1em]">
        <span className="w-1.5 h-5 rounded-full bg-indigo-400/60" />{t('dashboard.overview')}
      </h2>
      <div className="space-y-5">
        <div className="rounded-xl p-5 border border-indigo-500/10 shadow-[0_0_20px_rgba(99,102,241,0.04)]" style={{
          background: lightMode ? 'linear-gradient(135deg, rgba(255,255,255,0.85), rgba(248,250,252,0.85))' : 'linear-gradient(135deg, rgba(20,20,35,0.6), rgba(25,25,40,0.6))',
          backdropFilter: 'blur(4px)',
        }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium" style={{ color: 'var(--node-text)' }}>{t('dashboard.progress')}</span>
            <span className="text-xs text-gray-500 font-mono">{t('dashboard.completedCount').replace('{completed}', fmt(completedCount)).replace('{total}', fmt(total))}</span>
          </div>
          <div className="h-3 bg-black/20 rounded-full overflow-hidden flex">
            <div className="h-full bg-emerald-500 rounded-l-full transition-all duration-500" style={{ width: `${(completedCount / total) * 100}%` }} />
            <div className="h-full bg-indigo-500 transition-all duration-500" style={{ width: `${(activeCount / total) * 100}%` }} />
            <div className="h-full bg-gray-500 rounded-r-full transition-all duration-500" style={{ width: `${(archivedCount / total) * 100}%` }} />
          </div>
          <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.4)]" />{t('dashboard.completed')} {completedCount}</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_4px_rgba(99,102,241,0.4)]" />{t('dashboard.inProgress')} {activeCount}</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-gray-500" />{t('dashboard.archived')} {archivedCount}</span>
          </div>
        </div>
        <div className="rounded-xl p-4 border border-indigo-500/10 shadow-[0_0_20px_rgba(99,102,241,0.04)]" style={{
          background: lightMode ? 'linear-gradient(135deg, rgba(255,255,255,0.85), rgba(248,250,252,0.85))' : 'linear-gradient(135deg, rgba(20,20,35,0.6), rgba(25,25,40,0.6))',
          backdropFilter: 'blur(4px)',
        }}>
          <div className="w-10 h-10 rounded-xl bg-indigo-500/15 flex items-center justify-center mb-3 shadow-[0_0_10px_rgba(99,102,241,0.15)]">
            <FolderOpen className="w-5 h-5 text-indigo-400" />
          </div>
          <p className="text-xs text-gray-500">{t('dashboard.projectCount')}</p>
          <p className="text-xl font-bold mt-0.5" style={{ color: 'var(--node-text)' }}>{fmt(projectCount || 0)}</p>
        </div>
      </div>
    </div>
  );
}
