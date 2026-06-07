-- Cleanup: drop unused optimizers JSONB column (now stored in canvas_nodes)
ALTER TABLE public.projects DROP COLUMN IF EXISTS optimizers;
