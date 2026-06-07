-- Make task_id nullable for optimizer nodes
-- Optimizer nodes don't belong to a specific task — they aggregate across tasks
ALTER TABLE public.canvas_nodes ALTER COLUMN task_id DROP NOT NULL;
