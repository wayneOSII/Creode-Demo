-- Add color column to tasks table for task-based node coloring
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS color TEXT NOT NULL DEFAULT '#6366f1';
