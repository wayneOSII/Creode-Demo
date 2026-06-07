-- Enable realtime for tasks and canvas_nodes tables
-- Run this in Supabase SQL Editor if you want instant live updates

ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.canvas_nodes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.projects;
