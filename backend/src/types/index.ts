// ──── Shared domain types for Creode (backend copy) ────

export type Direction = 'up' | 'down' | 'left' | 'right';
export type TaskStatus = 'pending' | 'in_progress' | 'completed';
export type NodeStatus = 'draft' | 'locked' | 'deleted';

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
  position_x: number;
  position_y: number;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  user_id: string;
  title: string;
  goal: string;
  status: 'active' | 'completed' | 'archived';
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  subscription_tier: 'free' | 'pro' | 'enterprise';
  subscription_status: 'active' | 'past_due' | 'canceled' | 'none';
  created_at: string;
  updated_at: string;
}

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

export interface GenerateNodeRequest {
  project_id: string;
  task_id: string;
  task_title: string;
  task_description: string;
  parent_node_content?: string;
  parent_node_title?: string;
  direction: Direction;
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
