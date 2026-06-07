-- Saved synthesis outputs
CREATE TABLE IF NOT EXISTS public.project_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  node_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_project_outputs_project ON public.project_outputs(project_id, created_at DESC);

ALTER TABLE public.project_outputs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own outputs"
  ON public.project_outputs FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
