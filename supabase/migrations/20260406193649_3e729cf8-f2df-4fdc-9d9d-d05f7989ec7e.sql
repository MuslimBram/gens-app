-- Enums
CREATE TYPE public.app_project_status AS ENUM (
  'draft', 'generating', 'generated', 'reviewing', 'validating', 
  'preview_ready', 'export_ready', 'github_ready', 'failed'
);

CREATE TYPE public.generation_status AS ENUM (
  'pending', 'creating_spec', 'generating_files', 'reviewing', 
  'validating', 'completed', 'failed'
);

CREATE TYPE public.build_log_level AS ENUM ('info', 'warning', 'error', 'success');

CREATE TYPE public.export_type AS ENUM ('zip', 'desktop_mac', 'desktop_windows', 'mobile_android', 'mobile_ios', 'pwa', 'github');

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- 1. app_projects
CREATE TABLE public.app_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  app_type TEXT DEFAULT 'web',
  template_key TEXT,
  stack_key TEXT DEFAULT 'react-vite',
  selected_model TEXT DEFAULT 'auto',
  status public.app_project_status DEFAULT 'draft',
  github_connected BOOLEAN DEFAULT false,
  github_repo_url TEXT,
  options JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.app_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own projects" ON public.app_projects FOR SELECT USING (auth.uid() = created_by);
CREATE POLICY "Users can create projects" ON public.app_projects FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Users can update own projects" ON public.app_projects FOR UPDATE USING (auth.uid() = created_by);
CREATE POLICY "Users can delete own projects" ON public.app_projects FOR DELETE USING (auth.uid() = created_by);

CREATE TRIGGER update_app_projects_updated_at BEFORE UPDATE ON public.app_projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. app_generations
CREATE TABLE public.app_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.app_projects(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  model_name TEXT NOT NULL DEFAULT 'auto',
  generation_mode TEXT DEFAULT 'initial',
  status public.generation_status DEFAULT 'pending',
  spec_json JSONB,
  build_status TEXT DEFAULT 'pending',
  build_log TEXT,
  token_usage INTEGER DEFAULT 0,
  estimated_cost NUMERIC(10,4) DEFAULT 0,
  current_stage TEXT DEFAULT 'pending',
  progress INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.app_generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own generations" ON public.app_generations FOR SELECT 
  USING (EXISTS (SELECT 1 FROM public.app_projects WHERE id = project_id AND created_by = auth.uid()));
CREATE POLICY "Users can create generations" ON public.app_generations FOR INSERT 
  WITH CHECK (EXISTS (SELECT 1 FROM public.app_projects WHERE id = project_id AND created_by = auth.uid()));
CREATE POLICY "Users can update own generations" ON public.app_generations FOR UPDATE 
  USING (EXISTS (SELECT 1 FROM public.app_projects WHERE id = project_id AND created_by = auth.uid()));

-- 3. app_revisions
CREATE TABLE public.app_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.app_projects(id) ON DELETE CASCADE,
  generation_id UUID REFERENCES public.app_generations(id) ON DELETE SET NULL,
  revision_number INTEGER NOT NULL DEFAULT 1,
  change_summary TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.app_revisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own revisions" ON public.app_revisions FOR SELECT 
  USING (EXISTS (SELECT 1 FROM public.app_projects WHERE id = project_id AND created_by = auth.uid()));
CREATE POLICY "Users can create revisions" ON public.app_revisions FOR INSERT 
  WITH CHECK (auth.uid() = created_by);

-- 4. app_files
CREATE TABLE public.app_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.app_projects(id) ON DELETE CASCADE,
  generation_id UUID REFERENCES public.app_generations(id) ON DELETE SET NULL,
  revision_id UUID REFERENCES public.app_revisions(id) ON DELETE SET NULL,
  path TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  file_type TEXT DEFAULT 'source',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.app_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own files" ON public.app_files FOR SELECT 
  USING (EXISTS (SELECT 1 FROM public.app_projects WHERE id = project_id AND created_by = auth.uid()));
CREATE POLICY "Users can create files" ON public.app_files FOR INSERT 
  WITH CHECK (EXISTS (SELECT 1 FROM public.app_projects WHERE id = project_id AND created_by = auth.uid()));
CREATE POLICY "Users can update own files" ON public.app_files FOR UPDATE 
  USING (EXISTS (SELECT 1 FROM public.app_projects WHERE id = project_id AND created_by = auth.uid()));
CREATE POLICY "Users can delete own files" ON public.app_files FOR DELETE 
  USING (EXISTS (SELECT 1 FROM public.app_projects WHERE id = project_id AND created_by = auth.uid()));

CREATE TRIGGER update_app_files_updated_at BEFORE UPDATE ON public.app_files FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. github_connections
CREATE TABLE public.github_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  provider TEXT NOT NULL DEFAULT 'github',
  account_name TEXT,
  encrypted_token_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.github_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own github connections" ON public.github_connections FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create github connections" ON public.github_connections FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own github connections" ON public.github_connections FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own github connections" ON public.github_connections FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_github_connections_updated_at BEFORE UPDATE ON public.github_connections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. build_logs
CREATE TABLE public.build_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.app_projects(id) ON DELETE CASCADE,
  generation_id UUID REFERENCES public.app_generations(id) ON DELETE SET NULL,
  log_type TEXT DEFAULT 'general',
  message TEXT NOT NULL,
  level public.build_log_level DEFAULT 'info',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.build_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own build logs" ON public.build_logs FOR SELECT 
  USING (EXISTS (SELECT 1 FROM public.app_projects WHERE id = project_id AND created_by = auth.uid()));
CREATE POLICY "Users can create build logs" ON public.build_logs FOR INSERT 
  WITH CHECK (EXISTS (SELECT 1 FROM public.app_projects WHERE id = project_id AND created_by = auth.uid()));

-- 7. app_exports
CREATE TABLE public.app_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.app_projects(id) ON DELETE CASCADE,
  export_type public.export_type DEFAULT 'zip',
  file_url TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.app_exports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own exports" ON public.app_exports FOR SELECT 
  USING (EXISTS (SELECT 1 FROM public.app_projects WHERE id = project_id AND created_by = auth.uid()));
CREATE POLICY "Users can create exports" ON public.app_exports FOR INSERT 
  WITH CHECK (EXISTS (SELECT 1 FROM public.app_projects WHERE id = project_id AND created_by = auth.uid()));

-- 8. usage_tracking
CREATE TABLE public.usage_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  action_type TEXT NOT NULL,
  project_id UUID REFERENCES public.app_projects(id) ON DELETE SET NULL,
  model_used TEXT,
  token_usage INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.usage_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own usage" ON public.usage_tracking FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can track own usage" ON public.usage_tracking FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_app_projects_created_by ON public.app_projects(created_by);
CREATE INDEX idx_app_projects_status ON public.app_projects(status);
CREATE INDEX idx_app_generations_project_id ON public.app_generations(project_id);
CREATE INDEX idx_app_files_project_id ON public.app_files(project_id);
CREATE INDEX idx_app_files_revision_id ON public.app_files(revision_id);
CREATE INDEX idx_app_revisions_project_id ON public.app_revisions(project_id);
CREATE INDEX idx_build_logs_project_id ON public.build_logs(project_id);
CREATE INDEX idx_usage_tracking_user_id ON public.usage_tracking(user_id);