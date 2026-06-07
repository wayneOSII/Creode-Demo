import type {
  GenerateTasksRequest,
  GenerateTasksResponse,
  GenerateNodeRequest,
  GenerateNodeResponse,
  RerollNodeRequest,
  RerollNodeResponse,
  SynthesizeRequest,
  SynthesizeResponse,
} from '@/types';
import { supabase } from '@/lib/supabase';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `API error: ${res.status}`);
  }

  return res.json();
}

export const api = {
  /** Get current user API usage */
  getUsage(days: number = 30) {
    return request<{ usage: Array<{
      id: string;
      user_id: string;
      endpoint: string;
      model: string;
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
      created_at: string;
    }> }>(`/ai/usage?days=${days}`);
  },

  /** Get ALL users usage (requires admin key) */
  getAdminUsage(days: number = 30, key: string) {
    return request<{ usage: Array<{
      id: string;
      user_id: string;
      endpoint: string;
      model: string;
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
      created_at: string;
      profiles?: { email: string } | null;
    }> }>(`/ai/admin-usage?days=${days}&key=${encodeURIComponent(key)}`);
  },

  /** Optimize node content */
  optimizeNode(data: { title: string; content: string; instruction?: string }) {
    return request<{ title: string; content: string }>('/ai/optimize-node', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /** Run optimizer on multiple nodes */
  runOptimizer(data: { prompt: string; nodes: Array<{ title: string; content: string }> }) {
    return request<{ title: string; content: string }>('/ai/optimizer', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /** Generate personality-based project prompts */
  generateProjectPrompts(goal: string, projectId: string) {
    return request<{ prompts: Record<string, string> }>(
      '/ai/generate-project-prompts',
      {
        method: 'POST',
        body: JSON.stringify({ goal, project_id: projectId }),
      }
    );
  },

  /** Get user settings */
  getSettings() {
    return request<{ settings: Record<string, unknown> }>('/settings');
  },

  /** Save user settings */
  saveSettings(settings: Record<string, unknown>) {
    return request<{ ok: boolean }>('/settings', {
      method: 'PUT',
      body: JSON.stringify({ settings }),
    });
  },

  /** Get project prompts */
  getProjectPrompts(projectId: string) {
    return request<{ node_prompts: Record<string, string> }>(
      `/settings/project/${projectId}`
    );
  },

  /** Save project prompts */
  saveProjectPrompts(projectId: string, nodePrompts: Record<string, string>) {
    return request<{ ok: boolean }>(`/settings/project/${projectId}`, {
      method: 'PUT',
      body: JSON.stringify({ node_prompts: nodePrompts }),
    });
  },

  generateTasks(data: GenerateTasksRequest) {
    return request<GenerateTasksResponse>('/ai/generate-tasks', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  generateNode(data: GenerateNodeRequest) {
    return request<GenerateNodeResponse>('/ai/generate-node', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  rerollNode(data: RerollNodeRequest) {
    return request<RerollNodeResponse>('/ai/reroll-node', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  synthesize(data: SynthesizeRequest) {
    return request<SynthesizeResponse>('/ai/synthesize', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /** Save a synthesis output */
  saveOutput(data: { project_id: string; content: string; node_count: number }) {
    return request<{ output: { id: string; project_id: string; content: string; node_count: number; created_at: string } }>(
      '/ai/outputs',
      { method: 'POST', body: JSON.stringify(data) }
    );
  },

  /** Get all saved outputs for a project */
  getOutputs(projectId: string) {
    return request<{ outputs: Array<{ id: string; project_id: string; content: string; node_count: number; created_at: string }> }>(
      `/ai/outputs/${projectId}`
    );
  },

  /** Delete a saved output */
  deleteOutput(outputId: string) {
    return request<{ ok: boolean }>(`/ai/outputs/${outputId}`, { method: 'DELETE' });
  },
};
