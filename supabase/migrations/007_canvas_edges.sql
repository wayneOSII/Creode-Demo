-- Manual edges between canvas nodes (cross-task connections)
CREATE TABLE IF NOT EXISTS public.canvas_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source_node_id UUID NOT NULL REFERENCES public.canvas_nodes(id) ON DELETE CASCADE,
  target_node_id UUID NOT NULL REFERENCES public.canvas_nodes(id) ON DELETE CASCADE,
  edge_type TEXT NOT NULL DEFAULT 'manual' CHECK (edge_type IN ('manual', 'cross-task')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_canvas_edges_project ON public.canvas_edges(project_id);

ALTER TABLE public.canvas_edges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own edges"
  ON public.canvas_edges FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
