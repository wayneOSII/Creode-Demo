import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import {
  generateTasks,
  generateNode,
  rerollNode,
  synthesize,
  getErrorMessage,
} from '../services/ai.service';
import OpenAI from 'openai';
import { getSupabaseAdmin } from '../lib/supabase';
import type { AppContext } from '../index';
import type {
  GenerateTasksRequest,
  GenerateNodeRequest,
  RerollNodeRequest,
  SynthesizeRequest,
} from '../types';

async function logUsage(
  env: AppContext['Bindings'],
  userId: string,
  endpoint: string,
  model: string,
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
) {
  const supabase = getSupabaseAdmin(env);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('api_usage')
    .insert({
      user_id: userId,
      endpoint,
      model,
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      total_tokens: usage.total_tokens,
    })
    .then(({ error }: { error: Error | null }) => {
      if (error) console.error('Failed to log usage:', error);
    });
}

export const aiRoutes = new Hono<AppContext>();

// ──── Admin: GET /api/ai/admin-usage (no auth, uses key) ────
aiRoutes.get('/admin-usage', async (c) => {
  const adminKey = c.req.query('key') || '';
  if (!adminKey || adminKey !== c.env.SUPABASE_SERVICE_ROLE_KEY) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const days = parseInt(c.req.query('days') || '30', 10);
  const supabase = getSupabaseAdmin(c.env);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: usage, error: usageErr } = await (supabase as any)
    .from('api_usage')
    .select('*, profiles(email)')
    .gte('created_at', new Date(Date.now() - days * 86400000).toISOString())
    .order('created_at', { ascending: false });

  if (usageErr) {
    return c.json({ error: 'Failed to fetch usage' }, 500);
  }

  return c.json({ usage: usage || [] });
});

// ──── POST /api/ai/generate-project-prompts ────
aiRoutes.post('/generate-project-prompts', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<{ goal: string; project_id: string }>();

  if (!body.goal || !body.project_id) {
    return c.json({ error: 'goal and project_id are required' }, 400);
  }

  try {
    const openai = new OpenAI({
      apiKey: c.env.OPENAI_API_KEY,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': 'https://creode.pages.dev',
        'X-Title': 'Creode',
      },
    });

    const completion = await openai.chat.completions.create({
      model: 'openai/gpt-4o-mini',
      temperature: 0.9,
      messages: [
        {
          role: 'system',
          content: `你是一位創意引導專家。你需要為一個創作專案生成四個不同人格視角的引導語，用於畫布節點的四個延伸方向（up/down/left/right）。

規則：
1. 為每個方向分配一個獨特的人格類型，用該人格的語氣和思維方式寫引導語
2. 引導語應該引導 AI 從該人格的角度去發想內容
3. 每段引導語 30-60 字，用繁體中文
4. 人格類型要有創意且與專案目標相關
5. 只輸出 JSON：
{ "prompts": { "up": "人格與引導語...", "down": "人格與引導語...", "left": "人格與引導語...", "right": "人格與引導語..." } }`,
        },
        {
          role: 'user',
          content: `專案目標：${body.goal}\n\n請為這個專案生成四個方向的人格引導語。`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content || '{}';
    const cleaned = raw
      .replace(/^```(?:json)?\s*\n?/i, '')
      .replace(/\n?```\s*$/i, '')
      .trim();
    const parsed = JSON.parse(cleaned);

    // Save to project
    const supabase = getSupabaseAdmin(c.env);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('projects')
      .update({ node_prompts: parsed.prompts })
      .eq('id', body.project_id);

    return c.json({ prompts: parsed.prompts });
  } catch (err) {
    const message = getErrorMessage(err);
    console.error('generate-project-prompts error:', message);
    return c.json(
      { error: `Failed to generate project prompts: ${message}` },
      500
    );
  }
});

// All AI routes require auth (must come after admin-usage)
aiRoutes.use('*', requireAuth);

// ──── POST /api/ai/generate-tasks ────
aiRoutes.post('/generate-tasks', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<GenerateTasksRequest>();

  if (!body.goal || body.goal.trim().length === 0) {
    return c.json({ error: 'goal is required' }, 400);
  }

  try {
    const { result, usage } = await generateTasks(
      c.env.OPENAI_API_KEY,
      body.goal,
      body.task_count || 5
    );

    c.executionCtx.waitUntil(
      logUsage(c.env, userId, 'generate-tasks', 'openai/gpt-4o-mini', usage)
    );

    return c.json(result);
  } catch (err) {
    const message = getErrorMessage(err);
    console.error('generate-tasks error:', message);
    return c.json(
      { error: `Failed to generate tasks: ${message}` },
      500
    );
  }
});

// ──── POST /api/ai/generate-node ────
aiRoutes.post('/generate-node', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<GenerateNodeRequest>();

  if (!body.task_id || !body.direction) {
    return c.json({ error: 'task_id and direction are required' }, 400);
  }

  const validDirections = ['up', 'down', 'left', 'right'];
  if (!validDirections.includes(body.direction)) {
    return c.json({ error: 'direction must be up/down/left/right' }, 400);
  }

  try {
    // Fetch project custom prompts
    const supabase = getSupabaseAdmin(c.env);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: projectData } = await (supabase as any)
      .from('projects')
      .select('node_prompts')
      .eq('id', body.project_id)
      .single();

    const customPrompts = projectData?.node_prompts || {};

    const { result, usage } = await generateNode(
      c.env.OPENAI_API_KEY,
      body,
      customPrompts
    );

    c.executionCtx.waitUntil(
      logUsage(c.env, userId, 'generate-node', 'openai/gpt-4o-mini', usage)
    );

    return c.json(result);
  } catch (err) {
    const message = getErrorMessage(err);
    console.error('generate-node error:', message);
    return c.json(
      { error: `Failed to generate node: ${message}` },
      500
    );
  }
});

// ──── POST /api/ai/reroll-node ────
aiRoutes.post('/reroll-node', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<RerollNodeRequest>();

  if (!body.direction) {
    return c.json({ error: 'direction is required' }, 400);
  }

  try {
    const supabase = getSupabaseAdmin(c.env);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile } = await (supabase as any)
      .from('profiles')
      .select('settings')
      .eq('id', userId)
      .single();
    const customPrompts = profile?.settings?.nodePrompts || undefined;

    const { result, usage } = await rerollNode(
      c.env.OPENAI_API_KEY,
      body,
      customPrompts
    );

    c.executionCtx.waitUntil(
      logUsage(c.env, userId, 'reroll-node', 'openai/gpt-4o-mini', usage)
    );

    return c.json({
      title: result.title,
      content: result.content,
      version: result.version,
    });
  } catch (err) {
    const message = getErrorMessage(err);
    console.error('reroll-node error:', message);
    return c.json(
      { error: `Failed to reroll node: ${message}` },
      500
    );
  }
});

// ──── POST /api/ai/synthesize ────
aiRoutes.post('/synthesize', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<SynthesizeRequest>();

  if (!body.project_id || !body.nodes || body.nodes.length === 0) {
    return c.json(
      { error: 'project_id and nodes are required' },
      400
    );
  }

  try {
    const { result, usage } = await synthesize(c.env.OPENAI_API_KEY, body);

    c.executionCtx.waitUntil(
      logUsage(c.env, userId, 'synthesize', 'openai/gpt-4o-mini', usage)
    );

    return c.json(result);
  } catch (err) {
    const message = getErrorMessage(err);
    console.error('synthesize error:', message);
    return c.json(
      { error: `Failed to synthesize: ${message}` },
      500
    );
  }
});

// ──── POST /api/ai/generate-node-only ────
aiRoutes.post('/generate-node-only', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<GenerateNodeRequest>();

  if (!body.task_id || !body.direction) {
    return c.json({ error: 'task_id and direction are required' }, 400);
  }

  try {
    const supabase = getSupabaseAdmin(c.env);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile } = await (supabase as any)
      .from('profiles')
      .select('settings')
      .eq('id', userId)
      .single();
    const customPrompts = profile?.settings?.nodePrompts || undefined;

    const { result, usage } = await generateNode(
      c.env.OPENAI_API_KEY,
      body,
      customPrompts
    );

    c.executionCtx.waitUntil(
      logUsage(c.env, userId, 'generate-node-only', 'openai/gpt-4o-mini', usage)
    );

    return c.json(result);
  } catch (err) {
    const message = getErrorMessage(err);
    console.error('generate-node-only error:', message);
    return c.json(
      { error: `Failed to generate node: ${message}` },
      500
    );
  }
});

// ──── GET /api/ai/usage?days=30 (current user) ────
aiRoutes.get('/usage', async (c) => {
  const userId = c.get('userId');
  const days = parseInt(c.req.query('days') || '30', 10);

  const supabase = getSupabaseAdmin(c.env);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('api_usage')
    .select('*')
    .eq('user_id', userId)
    .gte(
      'created_at',
      new Date(Date.now() - days * 86400000).toISOString()
    )
    .order('created_at', { ascending: false });

  if (error) {
    return c.json({ error: 'Failed to fetch usage' }, 500);
  }

  return c.json({ usage: data || [] });
});

// ──── POST /api/ai/optimizer ────
aiRoutes.post('/optimizer', async (c) => {
  const body = await c.req.json<{
    prompt: string;
    nodes: Array<{ title: string; content: string }>;
  }>();
  if (!body.nodes?.length) return c.json({ error: 'nodes are required' }, 400);

  const promptMap: Record<string, string> = {
    summarize: '請將以下多個節點的內容整合成一個精簡的摘要（50 字以內），保留核心觀點。',
    expand: '請基於以下多個節點的內容，深入發展出一個新的觀點或方向（50 字以內）。',
    synthesize: '請將以下多個節點的內容融合，產出一個全新的創意概念（50 字以內）。',
    contrast: '請比較以下多個節點的異同，生成一個對比分析（50 字以內）。',
    connect: '請找出以下多個節點之間的關聯，並推演出一個新的結論（50 字以內）。',
  };

  try {
    const openai = new OpenAI({
      apiKey: c.env.OPENAI_API_KEY,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: { 'HTTP-Referer': 'https://creode.pages.dev', 'X-Title': 'Creode' },
    });

    const nodeText = body.nodes.map((n) => `【${n.title}】${n.content}`).join('\n');

    const completion = await openai.chat.completions.create({
      model: 'openai/gpt-4o-mini',
      temperature: 0.7,
      messages: [
        {
          role: 'system',
          content: `你是一位內容整合專家。${promptMap[body.prompt] || promptMap.summarize}
只輸出 JSON：{ "title": "生成標題", "content": "生成內容" }`,
        },
        { role: 'user', content: nodeText },
      ],
    });

    const raw = completion.choices[0]?.message?.content || '{}';
    const cleaned = raw.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
    return c.json(JSON.parse(cleaned));
  } catch (err) {
    const message = getErrorMessage(err);
    return c.json({ error: `Failed: ${message}` }, 500);
  }
});

// ──── POST /api/ai/optimize-node ────
aiRoutes.post('/optimize-node', async (c) => {
  const body = await c.req.json<{ title: string; content: string; instruction?: string }>();
  if (!body.content) return c.json({ error: 'content is required' }, 400);

  try {
    const openai = new OpenAI({
      apiKey: c.env.OPENAI_API_KEY,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: { 'HTTP-Referer': 'https://creode.pages.dev', 'X-Title': 'Creode' },
    });

    const completion = await openai.chat.completions.create({
      model: 'openai/gpt-4o-mini',
      temperature: 0.6,
      messages: [
        {
          role: 'system',
          content: `你是一位內容優化專家。請優化使用者提供的節點內容，保持原意但讓表達更清晰、更有條理、更具創意。
${body.instruction ? `使用者指示：${body.instruction}` : ''}
只輸出 JSON：{ "title": "優化後標題", "content": "優化後內容" }`,
        },
        { role: 'user', content: `標題：${body.title}\n內容：${body.content}` },
      ],
    });

    const raw = completion.choices[0]?.message?.content || '{}';
    const cleaned = raw.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
    return c.json(JSON.parse(cleaned));
  } catch (err) {
    const message = getErrorMessage(err);
    console.error('optimize-node error:', message);
    return c.json({ error: `Failed: ${message}` }, 500);
  }
});

// ──── POST /api/ai/outputs ────
aiRoutes.post('/outputs', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<{ project_id: string; content: string; node_count: number }>();

  if (!body.project_id || !body.content) {
    return c.json({ error: 'project_id and content are required' }, 400);
  }

  const supabase = getSupabaseAdmin(c.env);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('project_outputs')
    .insert({
      project_id: body.project_id,
      user_id: userId,
      content: body.content,
      node_count: body.node_count || 0,
    })
    .select()
    .single();

  if (error) {
    return c.json({ error: 'Failed to save output' }, 500);
  }

  return c.json({ output: data });
});

// ──── GET /api/ai/outputs/:projectId ────
aiRoutes.get('/outputs/:projectId', async (c) => {
  const projectId = c.req.param('projectId');
  const supabase = getSupabaseAdmin(c.env);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('project_outputs')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });

  if (error) {
    return c.json({ error: 'Failed to fetch outputs' }, 500);
  }

  return c.json({ outputs: data || [] });
});

// ──── DELETE /api/ai/outputs/:id ────
aiRoutes.delete('/outputs/:id', async (c) => {
  const outputId = c.req.param('id');
  const supabase = getSupabaseAdmin(c.env);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('project_outputs')
    .delete()
    .eq('id', outputId);

  if (error) {
    return c.json({ error: 'Failed to delete output' }, 500);
  }

  return c.json({ ok: true });
});
