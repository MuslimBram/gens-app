import { supabase } from "@/integrations/supabase/client";

export interface GenerateSpecRequest {
  projectId: string;
  prompt: string;
  model: string;
  template: string;
  stack: string;
  appType: string;
  options: Record<string, boolean>;
}

export interface GenerateFilesRequest {
  projectId: string;
  generationId: string;
  spec: Record<string, unknown>;
  model: string;
  stack: string;
}

export async function generateSpec(req: GenerateSpecRequest): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke('generate-app', {
    body: { action: 'create_spec', ...req },
  });
  if (error) throw new Error(error.message || 'Failed to generate spec');
  return data;
}

export async function generateFiles(req: GenerateFilesRequest): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke('generate-app', {
    body: { action: 'generate_files', ...req },
  });
  if (error) throw new Error(error.message || 'Failed to generate files');
  return data;
}

export async function reviewFiles(projectId: string, generationId: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke('generate-app', {
    body: { action: 'review_files', projectId, generationId },
  });
  if (error) throw new Error(error.message || 'Failed to review files');
  return data;
}

export async function validateProject(projectId: string, generationId: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke('generate-app', {
    body: { action: 'validate_project', projectId, generationId },
  });
  if (error) throw new Error(error.message || 'Failed to validate project');
  return data;
}

export async function followUpEdit(projectId: string, generationId: string, prompt: string, model: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke('generate-app', {
    body: { action: 'follow_up_edit', projectId, generationId, prompt, model },
  });
  if (error) throw new Error(error.message || 'Failed to edit project');
  return data;
}

export async function resumeGeneration(projectId: string, generationId: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke('generate-app', {
    body: { action: 'resume_generation', projectId, generationId },
  });
  if (error) throw new Error(error.message || 'Failed to resume generation');
  return data;
}

export async function exportZip(projectId: string): Promise<Blob> {
  const { data, error } = await supabase.functions.invoke('export-app', {
    body: { projectId, exportType: 'zip' },
  });
  if (error) throw new Error(error.message || 'Failed to export');
  const binaryStr = atob(data.zipBase64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return new Blob([bytes], { type: 'application/zip' });
}

export async function exportDesktop(projectId: string, platform: 'mac' | 'windows'): Promise<Blob> {
  const { data, error } = await supabase.functions.invoke('export-app', {
    body: { projectId, exportType: `desktop_${platform}` },
  });
  if (error) throw new Error(error.message || 'Failed to export desktop app');
  const binaryStr = atob(data.zipBase64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return new Blob([bytes], { type: 'application/zip' });
}

export async function exportMobile(projectId: string, platform: 'android' | 'ios'): Promise<Blob> {
  const { data, error } = await supabase.functions.invoke('export-app', {
    body: { projectId, exportType: `mobile_${platform}` },
  });
  if (error) throw new Error(error.message || 'Failed to export mobile app');
  const binaryStr = atob(data.zipBase64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return new Blob([bytes], { type: 'application/zip' });
}

export async function exportPWA(projectId: string): Promise<Blob> {
  const { data, error } = await supabase.functions.invoke('export-app', {
    body: { projectId, exportType: 'pwa' },
  });
  if (error) throw new Error(error.message || 'Failed to export PWA');
  const binaryStr = atob(data.zipBase64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return new Blob([bytes], { type: 'application/zip' });
}
