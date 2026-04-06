import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export function useProjects() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['projects', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_projects')
        .select('*')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });
}

export function useProject(id: string | undefined) {
  return useQuery({
    queryKey: ['project', id],
    queryFn: async () => {
      if (!id) throw new Error('No project ID');
      const { data, error } = await supabase
        .from('app_projects')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });
}

export function useProjectFiles(projectId: string | undefined) {
  return useQuery({
    queryKey: ['project-files', projectId],
    queryFn: async () => {
      if (!projectId) throw new Error('No project ID');
      const { data, error } = await supabase
        .from('app_files')
        .select('*')
        .eq('project_id', projectId)
        .order('path');
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });
}

export function useProjectGenerations(projectId: string | undefined) {
  return useQuery({
    queryKey: ['project-generations', projectId],
    queryFn: async () => {
      if (!projectId) throw new Error('No project ID');
      const { data, error } = await supabase
        .from('app_generations')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });
}

export function useProjectRevisions(projectId: string | undefined) {
  return useQuery({
    queryKey: ['project-revisions', projectId],
    queryFn: async () => {
      if (!projectId) throw new Error('No project ID');
      const { data, error } = await supabase
        .from('app_revisions')
        .select('*')
        .eq('project_id', projectId)
        .order('revision_number', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });
}

export function useBuildLogs(projectId: string | undefined) {
  return useQuery({
    queryKey: ['build-logs', projectId],
    queryFn: async () => {
      if (!projectId) throw new Error('No project ID');
      const { data, error } = await supabase
        .from('build_logs')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (project: {
      name: string;
      description: string;
      app_type: string;
      template_key: string;
      stack_key: string;
      selected_model: string;
      options: Record<string, boolean>;
    }) => {
      if (!user) throw new Error('Not authenticated');
      const slug = project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const { data, error } = await supabase
        .from('app_projects')
        .insert({
          ...project,
          slug,
          created_by: user.id,
          options: project.options as any,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Project created successfully');
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; [key: string]: any }) => {
      const { data, error } = await supabase
        .from('app_projects')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['project', data.id] });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('app_projects').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Project deleted');
    },
  });
}
