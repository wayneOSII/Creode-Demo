import { useState, useEffect, useMemo } from 'react';
import { api } from '@/lib/api';
import {
  Loader2,
  BarChart3,
  Zap,
  Hash,
  TrendingUp,
  LogOut,
  Users,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';

interface UsageEntry {
  id: string;
  user_id: string;
  endpoint: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  created_at: string;
  profiles?: { email: string } | null;
}

const ADMIN_PASSWORD = 'creode-admin';

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState('');
  const [pwError, setPwError] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === ADMIN_PASSWORD) {
      setAuthed(true);
      setPwError(false);
    } else {
      setPwError(true);
    }
  };

  if (!authed) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-canvas-bg p-4">
        <form
          onSubmit={handleLogin}
          className="glass-surface p-8 w-full max-w-sm space-y-4"
        >
          <div className="text-center">
            <BarChart3 className="w-10 h-10 text-indigo-400 mx-auto mb-2" />
            <h1 className="text-xl font-bold">後台管理</h1>
            <p className="text-sm text-gray-500 mt-1">請輸入管理密碼</p>
          </div>
          <input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setPwError(false);
            }}
            className="input-field"
            placeholder="管理密碼"
            autoFocus
          />
          {pwError && (
            <p className="text-red-400 text-sm text-center">密碼錯誤</p>
          )}
          <button type="submit" className="btn-primary w-full">
            登入
          </button>
        </form>
      </div>
    );
  }

  return <UsageDashboard onLogout={() => setAuthed(false)} />;
}

function UsageDashboard({ onLogout }: { onLogout: () => void }) {
  const [usage, setUsage] = useState<UsageEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [adminKey, setAdminKey] = useState(
    () => sessionStorage.getItem('creode_admin_key') || ''
  );
  const [keyInput, setKeyInput] = useState('');
  const [showKeyInput, setShowKeyInput] = useState(false);

  const saveKey = () => {
    sessionStorage.setItem('creode_admin_key', keyInput);
    setAdminKey(keyInput);
    setShowKeyInput(false);
  };

  useEffect(() => {
    if (!adminKey) {
      setShowKeyInput(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    api
      .getAdminUsage(days, adminKey)
      .then((data) => setUsage(data.usage || []))
      .catch(() => {
        sessionStorage.removeItem('creode_admin_key');
        setAdminKey('');
        setShowKeyInput(true);
      })
      .finally(() => setLoading(false));
  }, [days, adminKey]);

  // Group by user
  const userGroups = useMemo(() => {
    const map = new Map<string, { email: string; entries: UsageEntry[] }>();
    usage.forEach((u) => {
      const group = map.get(u.user_id) || {
        email: u.profiles?.email || '未知使用者',
        entries: [],
      };
      group.entries.push(u);
      map.set(u.user_id, group);
    });
    return Array.from(map.entries()).map(([userId, data]) => ({
      userId,
      ...data,
      totalTokens: data.entries.reduce((s, e) => s + e.total_tokens, 0),
      totalRequests: data.entries.length,
    }));
  }, [usage]);

  const totals = useMemo(() => {
    return usage.reduce(
      (acc, u) => ({
        requests: acc.requests + 1,
        prompt: acc.prompt + u.prompt_tokens,
        completion: acc.completion + u.completion_tokens,
        total: acc.total + u.total_tokens,
      }),
      { requests: 0, prompt: 0, completion: 0, total: 0 }
    );
  }, [usage]);

  const fmt = (n: number) => n.toLocaleString();

  return (
    <div className="min-h-screen bg-canvas-bg p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BarChart3 className="w-6 h-6 text-indigo-400" />
              後台管理
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              {userGroups.length} 位使用者 · 總請求 {fmt(totals.requests)} 次
            </p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="input-field w-auto text-sm py-1.5"
            >
              <option value="7">最近 7 天</option>
              <option value="14">最近 14 天</option>
              <option value="30">最近 30 天</option>
              <option value="90">最近 90 天</option>
            </select>
            <button
              onClick={() => {
                sessionStorage.removeItem('creode_admin_key');
                setAdminKey('');
                setShowKeyInput(true);
              }}
              className="btn-ghost p-2 text-xs"
              title="更換管理金鑰"
            >
              🔑
            </button>
            <button onClick={onLogout} className="btn-ghost p-2">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Key input modal */}
        {showKeyInput && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="glass-surface p-6 w-full max-w-sm space-y-4">
              <h2 className="text-lg font-semibold">輸入管理金鑰</h2>
              <p className="text-sm text-gray-400">
                請輸入 Supabase Service Role Key 以查看所有使用者資料
              </p>
              <input
                type="password"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                className="input-field"
                placeholder="sb_secret_..."
                autoFocus
              />
              <button onClick={saveKey} className="btn-primary w-full">
                確認
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <StatCard
                icon={<Users className="w-5 h-5" />}
                label="使用人數"
                value={fmt(userGroups.length)}
                color="indigo"
              />
              <StatCard
                icon={<Hash className="w-5 h-5" />}
                label="總請求數"
                value={fmt(totals.requests)}
                color="purple"
              />
              <StatCard
                icon={<Zap className="w-5 h-5" />}
                label="總 Token 數"
                value={fmt(totals.total)}
                color="green"
              />
              <StatCard
                icon={<TrendingUp className="w-5 h-5" />}
                label="Completion Tokens"
                value={fmt(totals.completion)}
                color="orange"
              />
            </div>

            {/* Per-user breakdown */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-400">
                各使用者用量
              </h3>
              {userGroups
                .sort((a, b) => b.totalTokens - a.totalTokens)
                .map((user) => (
                  <UserUsageCard
                    key={user.userId}
                    userId={user.userId}
                    email={user.email}
                    totalTokens={user.totalTokens}
                    totalRequests={user.totalRequests}
                    entries={user.entries}
                    fmt={fmt}
                  />
                ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function UserUsageCard({
  userId,
  email,
  totalTokens,
  totalRequests,
  entries,
  fmt,
}: {
  userId: string;
  email: string;
  totalTokens: number;
  totalRequests: number;
  entries: UsageEntry[];
  fmt: (n: number) => string;
}) {
  const [expanded, setExpanded] = useState(false);

  // Per-endpoint breakdown for this user
  const endpoints = useMemo(() => {
    const map = new Map<string, { count: number; tokens: number }>();
    entries.forEach((e) => {
      const d = map.get(e.endpoint) || { count: 0, tokens: 0 };
      d.count++;
      d.tokens += e.total_tokens;
      map.set(e.endpoint, d);
    });
    return Array.from(map.entries());
  }, [entries]);

  return (
    <div className="glass-surface overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center gap-3 hover:bg-white/5 transition-colors text-left"
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-gray-500 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-500 flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">{email}</p>
          <p className="text-xs text-gray-600 truncate">{userId}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-sm text-white font-medium">
            {fmt(totalTokens)}{' '}
            <span className="text-gray-500 text-xs">tokens</span>
          </p>
          <p className="text-xs text-gray-600">
            {totalRequests} 次請求
          </p>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-canvas-border px-4 py-3 space-y-3 bg-canvas-bg/30">
          {/* Endpoint breakdown */}
          <div className="grid grid-cols-2 gap-2">
            {endpoints.map(([ep, data]) => (
              <div
                key={ep}
                className="flex justify-between text-xs bg-canvas-bg rounded px-2 py-1.5"
              >
                <span className="text-gray-400">
                  {endpointNames[ep] || ep}
                </span>
                <span className="text-gray-300">
                  {data.count} 次 · {fmt(data.tokens)} tokens
                </span>
              </div>
            ))}
          </div>

          {/* Recent requests */}
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-600">
                <th className="pb-1 pr-2">時間</th>
                <th className="pb-1 pr-2">端點</th>
                <th className="pb-1 pr-2 text-right">Prompt</th>
                <th className="pb-1 pr-2 text-right">Comp.</th>
                <th className="pb-1 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="text-gray-400">
              {entries.slice(0, 20).map((u) => (
                <tr key={u.id}>
                  <td className="py-0.5 pr-2 whitespace-nowrap">
                    {new Date(u.created_at).toLocaleString('zh-TW', {
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="py-0.5 pr-2">
                    {endpointNames[u.endpoint] || u.endpoint}
                  </td>
                  <td className="py-0.5 pr-2 text-right">
                    {fmt(u.prompt_tokens)}
                  </td>
                  <td className="py-0.5 pr-2 text-right">
                    {fmt(u.completion_tokens)}
                  </td>
                  <td className="py-0.5 text-right text-white">
                    {fmt(u.total_tokens)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: 'indigo' | 'purple' | 'green' | 'orange';
}) {
  const colors = {
    indigo: 'text-indigo-400 bg-indigo-500/10',
    purple: 'text-purple-400 bg-purple-500/10',
    green: 'text-green-400 bg-green-500/10',
    orange: 'text-orange-400 bg-orange-500/10',
  };

  return (
    <div className="glass-surface p-4">
      <div
        className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${colors[color]}`}
      >
        {icon}
      </div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-xl font-bold text-white mt-0.5">{value}</p>
    </div>
  );
}

const endpointNames: Record<string, string> = {
  'generate-tasks': '任務拆解',
  'generate-node': '節點生成',
  'reroll-node': '重骰節點',
  synthesize: '內容合成',
  'generate-node-only': '節點預覽',
};
