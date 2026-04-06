import { supabase } from "@/integrations/supabase/client";

export async function getGitHubAuthUrl(redirectUri: string) {
  const { data, error } = await supabase.functions.invoke('github-oauth', {
    body: { action: 'get_auth_url', redirectUri },
  });
  if (error) throw new Error(error.message || 'Failed to get auth URL');
  return data;
}

export async function exchangeGitHubCode(code: string) {
  const { data, error } = await supabase.functions.invoke('github-oauth', {
    body: { action: 'exchange_code', code },
  });
  if (error) throw new Error(error.message || 'Failed to exchange code');
  return data;
}

export async function createGitHubRepo(projectId: string, repoName: string, isPrivate: boolean) {
  const { data, error } = await supabase.functions.invoke('github-oauth', {
    body: { action: 'create_repo', projectId, repoName, isPrivate },
  });
  if (error) throw new Error(error.message || 'Failed to create repo');
  return data;
}

export async function pushToGitHub(projectId: string, branch = 'main') {
  const { data, error } = await supabase.functions.invoke('github-oauth', {
    body: { action: 'push_files', projectId, branch },
  });
  if (error) throw new Error(error.message || 'Failed to push');
  return data;
}

export async function disconnectGitHub() {
  const { data, error } = await supabase.functions.invoke('github-oauth', {
    body: { action: 'disconnect' },
  });
  if (error) throw new Error(error.message || 'Failed to disconnect');
  return data;
}
