// ──── Shared domain types for Creode ────

/** Directional expansion from a node */
export type Direction = 'up' | 'down' | 'left' | 'right';

/** Status of a task */
export type TaskStatus = 'pending' | 'in_progress' | 'completed';

/** Status of a canvas node */
export type NodeStatus = 'draft' | 'locked' | 'deleted';

/** A task generated from AI prompt breakdown */
export interface Task {
  id: string;
  project_id: string;
  user_id: string;
  title: string;
  description: string;
  order_index: number;
  status: TaskStatus;
  color: string;
  created_at: string;
  updated_at: string;
}

/** A canvas node */
export interface CanvasNode {
  id: string;
  project_id: string;
  task_id: string | null;
  user_id: string;
  parent_node_id: string | null;
  direction_from_parent: Direction | null;
  title: string;
  content: string;
  status: NodeStatus;
  /** Position on the canvas */
  position_x: number;
  position_y: number;
  /** Generation version — incremented on re-roll */
  version: number;
  created_at: string;
  updated_at: string;
}

/** A project */
export interface Project {
  id: string;
  user_id: string;
  title: string;
  goal: string;
  status: 'active' | 'completed' | 'archived';
  created_at: string;
  updated_at: string;
}

/** User profile (mirrors Supabase auth) */
export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  subscription_tier: 'free' | 'pro' | 'enterprise';
  subscription_status: 'active' | 'past_due' | 'canceled' | 'none';
  created_at: string;
  updated_at: string;
}

// ──── API request/response types ────

/** POST /api/ai/generate-tasks */
export interface GenerateTasksRequest {
  goal: string;
  task_count?: number;
}

export interface GenerateTasksResponse {
  tasks: Array<{
    title: string;
    description: string;
    order_index: number;
  }>;
}

/** POST /api/ai/generate-node */
export interface GenerateNodeRequest {
  project_id: string;
  task_id: string;
  task_title: string;
  task_description: string;
  parent_node_content?: string;
  parent_node_title?: string;
  direction: Direction;
  /** Previous sibling nodes for context */
  context_nodes?: Array<{
    title: string;
    content: string;
    direction: Direction;
  }>;
}

export interface GenerateNodeResponse {
  title: string;
  content: string;
}

/** POST /api/ai/reroll-node */
export interface RerollNodeRequest {
  task_title: string;
  task_description: string;
  parent_node_content?: string;
  parent_node_title?: string;
  direction: Direction;
  previous_generation: {
    title: string;
    content: string;
  };
}

export interface RerollNodeResponse {
  title: string;
  content: string;
  version: number;
}

/** POST /api/ai/synthesize */
export interface SynthesizeRequest {
  project_id: string;
  project_goal: string;
  tasks: Array<{
    id: string;
    title: string;
    order_index: number;
  }>;
  nodes: Array<{
    task_id: string;
    title: string;
    content: string;
    position_x: number;
    position_y: number;
    parent_node_id: string | null;
  }>;
  format: 'markdown' | 'json' | 'text';
}

export interface SynthesizeResponse {
  content: string;
}

/** Paddle webhook event */
export interface PaddleWebhookEvent {
  event_type: string;
  data: {
    id: string;
    customer_id: string;
    subscription_id: string;
    status: string;
    custom_data?: {
      user_id?: string;
    };
    items?: Array<{
      price: {
        id: string;
      };
      quantity: number;
    }>;
  };
}
