-- Store optimizer nodes on the project
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS optimizers JSONB DEFAULT '[]'::jsonb;
