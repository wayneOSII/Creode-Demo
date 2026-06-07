import OpenAI from 'openai';
import type {
  GenerateTasksResponse,
  GenerateNodeRequest,
  GenerateNodeResponse,
  RerollNodeRequest,
  RerollNodeResponse,
  SynthesizeRequest,
  SynthesizeResponse,
  Direction,
} from '../types';

// ──── Model configuration ────
// OpenRouter model IDs. Change these to switch models.
// See https://openrouter.ai/models for options.
const MODELS = {
  /** Fast, cheap model for task breakdown & synthesis */
  default: 'openai/gpt-oss-120b:free',
  /** Creative model for node generation (higher temperature) */
  creative: 'openai/gpt-oss-120b:free',
  /** Stronger model for final synthesis */
  synthesis: 'openai/gpt-oss-120b:free',
};

/** Creates an OpenAI-compatible client pointed at OpenRouter */
function getClient(apiKey: string) {
  return new OpenAI({
    apiKey,
    baseURL: 'https://openrouter.ai/api/v1',
    defaultHeaders: {
      'HTTP-Referer': 'https://creode.pages.dev',
      'X-Title': 'Creode',
    },
  });
}

// ──── System prompts ────

const SYSTEM_PROMPTS = {
  taskBreakdown: `你是一位專業的專案管理與頂尖的跨領域創意顧問。你的任務是將使用者的創作目標拆解為具體、可執行的任務步驟。

規則：
1. 每個任務必須具體、可執行，而非抽象概念
2. 任務之間應有邏輯先後順序
3. 任務標題簡潔（8 字以內），描述清楚（30-80 字）
4. 必須涵蓋從起始到完成的全流程
5. 只輸出有效的 JSON，不要有任何其他文字。格式如下：
{ "tasks": [
  { "title": "任務標題", "description": "任務描述", "order_index": 0 }
]}`,

  nodeGenerationRoot: `你是一位頂尖的跨領域創意顧問與系統思考專家。使用者正在進行一個創作任務，你需要為這個任務發想一個有創意且方向明確的初始核心概念。

規則：
1. 只根據「當前任務」的標題與描述去發想，不需要參考其他節點。
2. 腦力激盪多個可能的方向，最終選出「一個最具創意且方向明確的結果」作為這個任務的核心出發點。
3. title：用一句話總結你選出的核心概念，10 字以內，作為節點的概要標題。
4. content：簡短說明這個核心概念是什麼、為何選擇它作為出發點，控制在 50 字以內。
5. 只輸出有效的 JSON，不要有任何其他文字。格式如下：
{ "title": "核心概念標題", "content": "簡短說明..." }`,

  nodeGeneration: `你是一位頂尖的跨領域創意顧問與系統思考專家。你正在協助使用者在一個畫布上進行創作。使用者已經選擇了一個任務方向，你需要根據上下文生成一個最合適的延伸節點。

規則：
1. 先根據「當前任務」、「父節點內容」與「延伸方向」腦力激盪多個可能的方向，但最終只選出「一個最合適的結果」。
2. 延伸方向由使用者指定（up/down/left/right），請你根據上下文自行判斷這個方向代表的意義，並生成符合該方向的內容。
3. 內容必須與「當前任務」及「父節點內容」保持邏輯連貫
4. title：用一句話總結你選出的最佳結果，10 字以內，直接作為節點的概要標題
5. content：簡短說明這個結果是什麼、為何選擇它，控制在 50 字以內
6. 只輸出有效的 JSON，不要有任何其他文字。格式如下：
{ "title": "最佳結果標題", "content": "簡短說明..." }`,

  synthesis: `你是一位專業的文件編輯與排版專家。你需要根據使用者提供的節點內容，整合成一份完整、流暢的最終文件。

規則：
1. 依照任務順序組織內容結構，每個任務作為一個 ## 二級標題
2. 消除重複內容，填補邏輯斷層
3. 保持使用者的原始創意與語調
4. 使用標準 Markdown 語法輸出：
   - 用 ## 表示任務標題
   - 用 ### 表示子主題
   - 用 **粗體** 強調關鍵概念
   - 用 - 或 1. 建立列表
   - 用 > 表示引用或重要摘錄
5. 最終輸出必須是完整的 Markdown 文件，可以直接渲染使用`,
};

// ──── Helpers ────

/** Token usage data from LLM response */
export interface UsageData {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

/** Extract a useful error message from any thrown value (OpenAI SDK, network, etc.) */
export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    // OpenAI APIError has status, headers, error.code, error.message
    const apiErr = err as Error & {
      status?: number;
      error?: { code?: string; message?: string; type?: string };
    };
    if (apiErr.error?.message) {
      return `[${apiErr.status ?? '?'}] ${apiErr.error.type ?? 'APIError'}: ${apiErr.error.message}`;
    }
    return err.message;
  }
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

/** Parse JSON from LLM response, handling ```json fences */
function parseJson(raw: string): Record<string, unknown> {
  // Strip markdown code fences if present
  const cleaned = raw
    .replace(/^```(?:json)?\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    throw new Error(
      `Failed to parse LLM response as JSON. Raw response:\n${cleaned.slice(0, 500)}`
    );
  }
}

// ──── Service functions ────

/** Generate task breakdown from a user goal */
export async function generateTasks(
  apiKey: string,
  goal: string,
  taskCount: number = 5
): Promise<{ result: GenerateTasksResponse; usage: UsageData }> {
  const openai = getClient(apiKey);

  const completion = await openai.chat.completions.create({
    model: MODELS.default,
    temperature: 0.7,
    messages: [
      { role: 'system', content: SYSTEM_PROMPTS.taskBreakdown },
      {
        role: 'user',
        content: `請將以下創作目標拆解為至少 ${taskCount} 項具體任務：\n\n「${goal}」`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content || '{}';
  const parsed = parseJson(raw);

  const tasks = Array.isArray(parsed) ? parsed : (parsed.tasks as GenerateTasksResponse['tasks']) || [];
  return {
    result: { tasks },
    usage: {
      prompt_tokens: completion.usage?.prompt_tokens || 0,
      completion_tokens: completion.usage?.completion_tokens || 0,
      total_tokens: completion.usage?.total_tokens || 0,
    },
  };
}

/** Build context prompt from node request */
function buildNodeContext(req: GenerateNodeRequest): string {
  let context = `## 當前任務\n標題：${req.task_title}\n描述：${req.task_description}\n`;

  if (req.parent_node_title || req.parent_node_content) {
    context += `\n## 父節點\n標題：${req.parent_node_title || '無'}\n內容：${req.parent_node_content || '無'}\n`;
  }

  if (req.context_nodes && req.context_nodes.length > 0) {
    context += `\n## 同層節點（已生成）\n`;
    req.context_nodes.forEach((n) => {
      context += `- [${n.direction}] ${n.title}: ${n.content}\n`;
    });
  }

  return context;
}

/** Generate a single canvas node */
export async function generateNode(
  apiKey: string,
  req: GenerateNodeRequest,
  customPrompts?: Partial<Record<Direction, string>>
): Promise<{ result: GenerateNodeResponse; usage: UsageData }> {
  const openai = getClient(apiKey);
  const context = buildNodeContext(req);

  const isRoot = !req.parent_node_title && !req.parent_node_content;

  const completion = await openai.chat.completions.create({
    model: MODELS.creative,
    temperature: 0.8,
    messages: [
      {
        role: 'system',
        content: isRoot
          ? SYSTEM_PROMPTS.nodeGenerationRoot
          : SYSTEM_PROMPTS.nodeGeneration,
      },
      {
        role: 'user',
        content: isRoot
          ? `${context}\n\n請根據當前任務發想一個有創意且方向明確的核心概念，作為這個任務的出發點。`
          : `${context}\n## 延伸方向：${req.direction}\n${customPrompts?.[req.direction] || ''}\n\n請根據以上上下文以及延伸方向，腦力激盪後挑選一個最合適的延伸結果。`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content || '{}';
  return {
    result: parseJson(raw) as unknown as GenerateNodeResponse,
    usage: {
      prompt_tokens: completion.usage?.prompt_tokens || 0,
      completion_tokens: completion.usage?.completion_tokens || 0,
      total_tokens: completion.usage?.total_tokens || 0,
    },
  };
}

/** Re-roll a node — same context, higher temperature for variety */
export async function rerollNode(
  apiKey: string,
  req: RerollNodeRequest,
  customPrompts?: Partial<Record<Direction, string>>
): Promise<{ result: RerollNodeResponse; usage: UsageData }> {
  const openai = getClient(apiKey);

  const defaults: Record<Direction, string> = {
    up: '請從「宏觀/抽象/高層次」的角度延伸',
    down: '請從「微觀/具體/深層細節」的角度延伸',
    left: '請從「背景脈絡/前置條件/過去相關」的角度延伸',
    right: '請從「後續發展/未來展望/延伸應用」的角度延伸',
  };

  const directionMeanings: Record<Direction, string> = {
    up: customPrompts?.up || defaults.up,
    down: customPrompts?.down || defaults.down,
    left: customPrompts?.left || defaults.left,
    right: customPrompts?.right || defaults.right,
  };

  const completion = await openai.chat.completions.create({
    model: MODELS.creative,
    temperature: 1.1, // Higher temperature for variety
    messages: [
      { role: 'system', content: SYSTEM_PROMPTS.nodeGeneration },
      {
        role: 'user',
        content: `## 當前任務\n標題：${req.task_title}\n描述：${req.task_description}\n
## 父節點\n標題：${req.parent_node_title || '無'}\n內容：${req.parent_node_content || '無'}\n
## 延伸方向：${req.direction}\n${directionMeanings[req.direction]}\n
## 上一版生成（請給出不同方向的內容）\n標題：${req.previous_generation.title}\n內容：${req.previous_generation.content}\n
請腦力激盪後挑選一個與上一版不同、但同樣合適的結果。只輸出 JSON。`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content || '{}';
  const result = parseJson(raw) as unknown as GenerateNodeResponse;
  return {
    result: { ...result, version: 1 },
    usage: {
      prompt_tokens: completion.usage?.prompt_tokens || 0,
      completion_tokens: completion.usage?.completion_tokens || 0,
      total_tokens: completion.usage?.total_tokens || 0,
    },
  };
}

/** Synthesize all nodes into a final document */
export async function synthesize(
  apiKey: string,
  req: SynthesizeRequest
): Promise<{ result: SynthesizeResponse; usage: UsageData }> {
  const openai = getClient(apiKey);

  // Sort nodes by task, then by position (topological-ish)
  const taskNodeMap = new Map<string, typeof req.nodes>();
  req.nodes.forEach((n) => {
    const list = taskNodeMap.get(n.task_id) || [];
    list.push(n);
    taskNodeMap.set(n.task_id, list);
  });

  let nodeContent = '';
  req.tasks
    .sort((a, b) => a.order_index - b.order_index)
    .forEach((task) => {
      const nodes = taskNodeMap.get(task.id) || [];
      nodeContent += `\n## ${task.title}\n`;
      nodes.forEach((n) => {
        nodeContent += `### ${n.title}\n${n.content}\n\n`;
      });
    });

  const completion = await openai.chat.completions.create({
    model: MODELS.synthesis,
    temperature: 0.5,
    messages: [
      { role: 'system', content: SYSTEM_PROMPTS.synthesis },
      {
        role: 'user',
        content: `## 專案目標\n${req.project_goal}\n\n## 所有節點內容\n${nodeContent}\n\n請將以上內容整合為一份完整的${req.format === 'markdown' ? 'Markdown' : req.format === 'json' ? 'JSON' : '純文字'}文件。`,
      },
    ],
  });

  return {
    result: { content: completion.choices[0]?.message?.content || '' },
    usage: {
      prompt_tokens: completion.usage?.prompt_tokens || 0,
      completion_tokens: completion.usage?.completion_tokens || 0,
      total_tokens: completion.usage?.total_tokens || 0,
    },
  };
}
