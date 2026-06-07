-- Add project-level node prompts for direction customization
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS node_prompts JSONB DEFAULT '{}'::jsonb;
