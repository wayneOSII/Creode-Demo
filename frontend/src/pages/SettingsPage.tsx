import { useState, useEffect } from 'react';
import { useNav } from '@/hooks/useNav';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import type { Project } from '@/types';
import {
  ArrowLeft,
  User,
  Save,
  Loader2,
  Check,
  FolderKanban,
} from 'lucide-react';
import toast from 'react-hot-toast';

type SettingsTab = 'profile' | 'projectPrompts';

interface PromptSettings {
  up: string;
  down: string;
  left: string;
  right: string;
}

const DEFAULT_PROMPTS: PromptSettings = {
  up: '請從「宏觀/抽象/高層次」的角度延伸',
  down: '請從「微觀/具體/深層細節」的角度延伸',
  left: '請從「背景脈絡/前置條件/過去相關」的角度延伸',
  right: '請從「後續發展/未來展望/延伸應用」的角度延伸',
};

const DIRECTION_LABELS: Record<keyof PromptSettings, { label: string; icon: string }> = {
  up: { label: '向上延伸 (up)', icon: '↑' },
  down: { label: '向下延伸 (down)', icon: '↓' },
  left: { label: '向左延伸 (left)', icon: '←' },
  right: { label: '向右延伸 (right)', icon: '→' },
};

export default function SettingsPage() {
  const { user, loading: authLoading } = useAuth();
  const { go } = useNav();
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [projectPrompts, setProjectPrompts] = useState<PromptSettings>(DEFAULT_PROMPTS);
  const [projectPromptSaving, setProjectPromptSaving] = useState(false);
  const [projectPromptSaved, setProjectPromptSaved] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) go('/login', { replace: true });
  }, [user, authLoading, go]);

  // Load projects
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('id, title')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });
      if (error) console.error(error);
      if (data) setProjects(data as Project[]);
      setLoading(false);
    })();
  }, [user]);

  // Load project prompts when selected
  useEffect(() => {
    if (!selectedProjectId) return;
    api
      .getProjectPrompts(selectedProjectId)
      .then((data) => {
        const pp = data.node_prompts;
        if (pp && Object.keys(pp).length > 0) {
          setProjectPrompts({
            up: pp.up || DEFAULT_PROMPTS.up,
            down: pp.down || DEFAULT_PROMPTS.down,
            left: pp.left || DEFAULT_PROMPTS.left,
            right: pp.right || DEFAULT_PROMPTS.right,
          });
        } else {
          setProjectPrompts(DEFAULT_PROMPTS);
        }
      })
      .catch(console.error);
  }, [selectedProjectId]);

  const saveProjectPrompts = async () => {
    if (!selectedProjectId) return;
    setProjectPromptSaving(true);
    setProjectPromptSaved(false);
    try {
      await api.saveProjectPrompts(selectedProjectId, projectPrompts as unknown as Record<string, string>);
      setProjectPromptSaved(true);
      toast.success('專案 Prompt 已儲存');
      setTimeout(() => setProjectPromptSaved(false), 2000);
    } catch {
      toast.error('儲存失敗');
    } finally {
      setProjectPromptSaving(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-canvas-bg">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas-bg flex">
      {/* Left sidebar */}
      <aside className="w-56 flex-shrink-0 bg-canvas-surface border-r border-canvas-border p-4 flex flex-col">
        <button
          onClick={() => go(-1)}
          className="btn-ghost p-1.5 mb-6 self-start"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        <nav className="space-y-1">
          <SidebarItem
            icon={<User className="w-4 h-4" />}
            label="基本資料"
            active={activeTab === 'profile'}
            onClick={() => setActiveTab('profile')}
          />
          <SidebarItem
            icon={<FolderKanban className="w-4 h-4" />}
            label="專案 Prompt"
            active={activeTab === 'projectPrompts'}
            onClick={() => setActiveTab('projectPrompts')}
          />
        </nav>

        <div className="mt-auto pt-4 border-t border-canvas-border">
          <p className="text-xs text-gray-600 truncate">{user?.email}</p>
        </div>
      </aside>

      {/* Right content */}
      <main className="flex-1 p-8 overflow-y-auto">
        {activeTab === 'profile' && (
          <ProfileTab email={user?.email || ''} />
        )}

        {activeTab === 'projectPrompts' && (
          <ProjectPromptsTab
            projects={projects}
            selectedProjectId={selectedProjectId}
            onSelectProject={setSelectedProjectId}
            prompts={projectPrompts}
            onChange={setProjectPrompts}
            onSave={saveProjectPrompts}
            saving={projectPromptSaving}
            saved={projectPromptSaved}
          />
        )}

      </main>
    </div>
  );
}

function SidebarItem({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
        active
          ? 'bg-indigo-500/20 text-indigo-300'
          : 'text-gray-400 hover:text-white hover:bg-white/5'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function ProfileTab({ email }: { email: string }) {
  return (
    <div className="max-w-xl">
      <h2 className="text-xl font-bold mb-6">基本資料</h2>
      <div className="glass-surface p-6 space-y-4">
        <div>
          <label className="block text-sm text-gray-400 mb-1">Email</label>
          <input
            type="text"
            value={email}
            readOnly
            className="input-field opacity-60 cursor-not-allowed"
          />
          <p className="text-xs text-gray-600 mt-1">
            帳號資訊由 Supabase Auth 管理
          </p>
        </div>
      </div>
    </div>
  );
}

function ProjectPromptsTab({
  projects,
  selectedProjectId,
  onSelectProject,
  prompts,
  onChange,
  onSave,
  saving,
  saved,
}: {
  projects: Project[];
  selectedProjectId: string;
  onSelectProject: (id: string) => void;
  prompts: PromptSettings;
  onChange: (p: PromptSettings) => void;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
}) {
  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold">專案 Prompt</h2>
          <p className="text-sm text-gray-500 mt-1">
            為個別專案設定專屬的節點延伸引導語，覆蓋全域設定
          </p>
        </div>
        <button
          onClick={onSave}
          disabled={saving || !selectedProjectId}
          className="btn-primary flex items-center gap-1.5 text-sm"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : saved ? (
            <Check className="w-4 h-4" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {saving ? '儲存中...' : saved ? '已儲存' : '儲存設定'}
        </button>
      </div>
      <div className="mb-6">
        <label className="block text-sm text-gray-400 mb-2">選擇專案</label>
        <select
          value={selectedProjectId}
          onChange={(e) => onSelectProject(e.target.value)}
          className="input-field text-sm"
        >
          <option value="">-- 選擇專案 --</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title || '未命名專案'}
            </option>
          ))}
        </select>
      </div>
      {!selectedProjectId && (
        <p className="text-gray-600 text-sm">請先選擇一個專案</p>
      )}
      {selectedProjectId && (
        <div className="space-y-4">
          {(Object.keys(DIRECTION_LABELS) as Array<keyof PromptSettings>).map(
            (dir) => {
              const { label, icon } = DIRECTION_LABELS[dir];
              return (
                <div key={dir} className="glass-surface p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center text-lg font-bold">
                      {icon}
                    </span>
                    <div>
                      <h3 className="text-sm font-semibold text-white">{label}</h3>
                      <p className="text-xs text-gray-500">
                        AI 向此方向延伸時會參考這段引導語（留空則使用全域設定）
                      </p>
                    </div>
                  </div>
                  <textarea
                    value={prompts[dir]}
                    onChange={(e) =>
                      onChange({ ...prompts, [dir]: e.target.value })
                    }
                    className="input-field text-sm h-20 resize-none font-mono"
                    placeholder={DEFAULT_PROMPTS[dir]}
                  />
                </div>
              );
            }
          )}
        </div>
      )}
    </div>
  );
}
