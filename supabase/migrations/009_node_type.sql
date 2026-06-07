-- Add node_type column to canvas_nodes
ALTER TABLE public.canvas_nodes ADD COLUMN IF NOT EXISTS node_type TEXT NOT NULL DEFAULT 'node';
