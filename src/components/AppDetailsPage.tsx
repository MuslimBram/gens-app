import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useProject, useProjectFiles, useProjectGenerations, useProjectRevisions, useBuildLogs, useUpdateProject, useDeleteProject } from '@/hooks/useProjects';
import { followUpEdit, exportZip, exportDesktop, exportMobile, exportPWA, resumeGeneration } from '@/lib/ai-service';
import { pushToGitHub, createGitHubRepo, createGitHubBranch } from '@/lib/github-service';
import { PROJECT_STATUSES, TEMPLATES, STACKS, AI_MODELS } from '@/lib/constants';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import {
  FileCode, FolderTree, GitBranch, History, Terminal, Eye, Download,
  Loader2, Send, ArrowLeft, Trash2, Monitor, Smartphone, Globe,
  ChevronRight, File, Folder, RotateCcw, ArrowLeftRight, Plus, RefreshCw
} from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { formatDistanceToNow } from 'date-fns';

// ─── Live Preview: builds an HTML document from generated files ───
function buildPreviewHtml(files: { path: string; content: string }[]): string {
  const indexHtml = files.find(f => f.path === 'index.html');
  if (indexHtml) {
    let html = indexHtml.content;
    const cssFiles = files.filter(f => f.path.endsWith('.css'));
    const jsFiles = files.filter(f => f.path.endsWith('.js') && f.path !== 'electron/main.cjs');
    const inlineCSS = cssFiles.map(f => `<style>/* ${f.path} */\n${f.content}</style>`).join('\n');
    const inlineJS = jsFiles.map(f => `<script>/* ${f.path} */\n${f.content}<\/script>`).join('\n');
    html = html.replace('</head>', `${inlineCSS}\n</head>`);
    html = html.replace('</body>', `${inlineJS}\n</body>`);
    return html;
  }

  // For React/TSX projects: render a rich interactive preview
  const cssFiles = files.filter(f => f.path.endsWith('.css'));
  const allFiles = files.filter(f => !f.path.endsWith('.md') && f.path !== '.env.example');
  const pageFiles = files.filter(f => f.path.includes('pages/') || f.path.includes('views/'));
  const componentFiles = files.filter(f => f.path.match(/\.(tsx|jsx)$/) && !f.path.includes('pages/'));
  const configFiles = files.filter(f => f.path.match(/(package\.json|tsconfig|vite\.config|tailwind)/));

  // Extract route info from code
  const routes: { path: string; component: string }[] = [];
  for (const file of files) {
    const routeMatches = file.content.matchAll(/path\s*[:=]\s*["']([^"']+)["']/g);
    for (const m of routeMatches) {
      if (m[1] && !routes.find(r => r.path === m[1])) {
        routes.push({ path: m[1], component: file.path });
      }
    }
  }

  // Extract component names and their props
  const components: { name: string; file: string; hasProps: boolean; linesOfCode: number }[] = [];
  for (const file of [...pageFiles, ...componentFiles]) {
    const fnMatch = file.content.match(/(?:export\s+(?:default\s+)?function|const)\s+(\w+)/);
    const name = fnMatch?.[1] || file.path.split('/').pop()?.replace(/\.\w+$/, '') || 'Unknown';
    const hasProps = file.content.includes('Props') || file.content.includes('props:');
    components.push({ name, file: file.path, hasProps, linesOfCode: file.content.split('\n').length });
  }

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background:#0f172a; color:#e2e8f0; }
  .header { padding:16px 24px; border-bottom:1px solid #1e293b; display:flex; align-items:center; gap:12px; }
  .header h1 { font-size:18px; color:#60a5fa; }
  .header .badge { background:#1e3a5f; color:#60a5fa; padding:2px 8px; border-radius:12px; font-size:11px; }
  .tabs { display:flex; border-bottom:1px solid #1e293b; padding:0 24px; }
  .tab { padding:10px 16px; font-size:13px; color:#64748b; cursor:pointer; border-bottom:2px solid transparent; }
  .tab.active { color:#60a5fa; border-color:#60a5fa; }
  .content { padding:24px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:16px; }
  .card { background:#1e293b; border-radius:12px; padding:16px; border:1px solid #334155; transition:border-color 0.2s; }
  .card:hover { border-color:#60a5fa; }
  .card h3 { font-size:14px; color:#f1f5f9; margin-bottom:6px; display:flex; align-items:center; gap:8px; }
  .card p { font-size:12px; color:#64748b; }
  .card .meta { display:flex; gap:12px; margin-top:8px; }
  .card .meta span { font-size:11px; color:#475569; }
  .stats { display:flex; gap:16px; margin-bottom:24px; flex-wrap:wrap; }
  .stat { background:linear-gradient(135deg,#1e293b,#0f172a); border-radius:12px; padding:16px 20px; border:1px solid #334155; min-width:120px; }
  .stat .num { font-size:28px; font-weight:bold; color:#60a5fa; }
  .stat .label { font-size:11px; color:#64748b; margin-top:2px; }
  .section-title { font-size:12px; color:#94a3b8; text-transform:uppercase; letter-spacing:1.5px; margin:20px 0 12px; }
  .route-list { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:20px; }
  .route { background:#1e293b; border:1px solid #334155; padding:6px 12px; border-radius:8px; font-size:12px; font-family:monospace; color:#34d399; }
  .file-preview { background:#0d1117; border-radius:8px; padding:12px; font-family:monospace; font-size:11px; color:#8b949e; max-height:120px; overflow:hidden; position:relative; line-height:1.6; }
  .file-preview::after { content:''; position:absolute; bottom:0; left:0; right:0; height:40px; background:linear-gradient(transparent,#1e293b); }
  .tag { background:#1e3a5f; color:#60a5fa; padding:2px 6px; border-radius:4px; font-size:10px; }
  ${cssFiles.map(f => f.content).join('\n')}
</style></head><body>
  <div class="header">
    <span style="font-size:24px">⚡</span>
    <h1>Project Preview</h1>
    <span class="badge">React</span>
    <span class="badge">${allFiles.length} files</span>
  </div>
  <div class="tabs">
    <div class="tab active" onclick="showTab('overview')">Overview</div>
    <div class="tab" onclick="showTab('components')">Components</div>
    <div class="tab" onclick="showTab('code')">Code Preview</div>
  </div>
  <div class="content" id="tab-overview">
    <div class="stats">
      <div class="stat"><div class="num">${allFiles.length}</div><div class="label">Total Files</div></div>
      <div class="stat"><div class="num">${pageFiles.length}</div><div class="label">Pages</div></div>
      <div class="stat"><div class="num">${componentFiles.length}</div><div class="label">Components</div></div>
      <div class="stat"><div class="num">${routes.length}</div><div class="label">Routes</div></div>
      <div class="stat"><div class="num">${allFiles.reduce((s,f) => s + f.content.split('\\n').length, 0).toLocaleString()}</div><div class="label">Lines of Code</div></div>
    </div>
    ${routes.length ? `<div class="section-title">🗺️ Routes</div><div class="route-list">${routes.map(r => `<div class="route">${r.path}</div>`).join('')}</div>` : ''}
    ${pageFiles.length ? `<div class="section-title">📄 Pages</div><div class="grid">${pageFiles.map(f => {
      const comp = components.find(c => c.file === f.path);
      return `<div class="card"><h3>${comp?.name || f.path.split('/').pop()?.replace(/\.\w+$/,'')}<span class="tag">page</span></h3><p>${f.path}</p><div class="meta"><span>${f.content.split('\\n').length} lines</span>${comp?.hasProps ? '<span>Has props</span>' : ''}</div></div>`;
    }).join('')}</div>` : ''}
  </div>
  <div class="content" id="tab-components" style="display:none">
    <div class="grid">${components.map(c => `<div class="card"><h3>${c.name}<span class="tag">${c.file.includes('pages/') ? 'page' : 'component'}</span></h3><p>${c.file}</p><div class="meta"><span>${c.linesOfCode} lines</span>${c.hasProps ? '<span>Accepts props</span>' : ''}</div></div>`).join('')}</div>
  </div>
  <div class="content" id="tab-code" style="display:none">
    <div class="grid">${allFiles.slice(0, 8).map(f => `<div class="card"><h3>${f.path.split('/').pop()}</h3><p>${f.path}</p><div class="file-preview">${f.content.substring(0, 300).replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div></div>`).join('')}</div>
  </div>
  <script>
    function showTab(name) {
      document.querySelectorAll('[id^=tab-]').forEach(el => el.style.display = 'none');
      document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
      document.getElementById('tab-' + name).style.display = 'block';
      event.target.classList.add('active');
    }
  <\/script>
</body></html>`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function AppDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: project, isLoading } = useProject(id);
  const { data: files } = useProjectFiles(id);
  const { data: generations } = useProjectGenerations(id);
  const { data: revisions } = useProjectRevisions(id);
  const { data: logs } = useBuildLogs(id);
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();

  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [followUpPrompt, setFollowUpPrompt] = useState('');
  const [followUpModel, setFollowUpModel] = useState('auto');
  const [isEditing, setIsEditing] = useState(false);
  const [isExporting, setIsExporting] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [compareFiles, setCompareFiles] = useState<{ a: any[]; b: any[] } | null>(null);

  // GitHub state
  const [newRepoName, setNewRepoName] = useState('');
  const [isRepoPrivate, setIsRepoPrivate] = useState(true);
  const [isCreatingRepo, setIsCreatingRepo] = useState(false);
  const [pushBranch, setPushBranch] = useState('main');
  const [isPushing, setIsPushing] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [isCreatingBranch, setIsCreatingBranch] = useState(false);

  // Build preview HTML
  const previewHtml = useMemo(() => {
    if (!files?.length) return null;
    return buildPreviewHtml(files.map(f => ({ path: f.path, content: f.content })));
  }, [files]);

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64" /></div>;
  }

  if (!project) {
    return (
      <div className="text-center py-20">
        <h2 className="text-xl font-semibold text-foreground">Project not found</h2>
        <Button variant="link" onClick={() => navigate('/app-builder')}>Back to My Apps</Button>
      </div>
    );
  }

  const status = PROJECT_STATUSES[project.status] || PROJECT_STATUSES.draft;
  const template = TEMPLATES.find((t) => t.key === project.template_key);
  const stack = STACKS.find((s) => s.key === project.stack_key);
  const selectedFileData = files?.find((f) => f.path === selectedFile);
  const fileTree = buildFileTree(files || []);
  const latestGen = generations?.[0];
  const canResume = latestGen?.status === 'failed';

  const handleFollowUp = async () => {
    if (!followUpPrompt.trim() || !id) return;
    setIsEditing(true);
    try {
      const lastGen = generations?.[0];
      if (!lastGen) throw new Error('No generation found');
      await followUpEdit(id, lastGen.id, followUpPrompt, followUpModel);
      toast.success('Project updated!');
      setFollowUpPrompt('');
      queryClient.invalidateQueries({ queryKey: ['project-files', id] });
      queryClient.invalidateQueries({ queryKey: ['project-revisions', id] });
      queryClient.invalidateQueries({ queryKey: ['project-generations', id] });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsEditing(false);
    }
  };

  const handleResume = async () => {
    if (!id || !latestGen) return;
    try {
      await resumeGeneration(id, latestGen.id);
      toast.success('Generation resumed');
      queryClient.invalidateQueries({ queryKey: ['project-generations', id] });
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleExport = async (type: string) => {
    if (!id) return;
    setIsExporting(type);
    try {
      let blob: Blob;
      let filename: string;
      const slug = project.slug || project.name;
      switch (type) {
        case 'zip':
          blob = await exportZip(id);
          filename = `${slug}.zip`;
          break;
        case 'desktop_mac':
          blob = await exportDesktop(id, 'mac');
          filename = `${slug}-mac.zip`;
          break;
        case 'desktop_windows':
          blob = await exportDesktop(id, 'windows');
          filename = `${slug}-windows.zip`;
          break;
        case 'mobile_android':
          blob = await exportMobile(id, 'android');
          filename = `${slug}-android.zip`;
          break;
        case 'mobile_ios':
          blob = await exportMobile(id, 'ios');
          filename = `${slug}-ios.zip`;
          break;
        case 'pwa':
          blob = await exportPWA(id);
          filename = `${slug}-pwa.zip`;
          break;
        default:
          throw new Error('Unknown export type');
      }
      downloadBlob(blob, filename);
      toast.success(`${type} exported!`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsExporting(null);
    }
  };

  const handleDelete = async () => {
    await deleteProject.mutateAsync(project.id);
    navigate('/app-builder');
  };

  const handleRestoreRevision = async (revisionId: string, revisionNumber: number) => {
    if (!id) return;
    setIsRestoring(true);
    try {
      const { data: revFiles, error } = await supabase
        .from('app_files').select('path, content, file_type')
        .eq('project_id', id).eq('revision_id', revisionId);
      if (error) throw error;
      if (!revFiles?.length) { toast.error('No files found for this revision'); return; }

      const { count } = await supabase.from('app_revisions')
        .select('*', { count: 'exact', head: true }).eq('project_id', id);

      await supabase.from('app_revisions').insert({
        project_id: id, revision_number: (count || 0) + 1,
        change_summary: `Restored to revision #${revisionNumber}`,
        created_by: (await supabase.auth.getUser()).data.user!.id,
      });

      for (const file of revFiles) {
        await supabase.from('app_files').update({ content: file.content })
          .eq('project_id', id).eq('path', file.path);
      }

      toast.success(`Restored to revision #${revisionNumber}`);
      queryClient.invalidateQueries({ queryKey: ['project-files', id] });
      queryClient.invalidateQueries({ queryKey: ['project-revisions', id] });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsRestoring(false);
    }
  };

  const handleCompareRevisions = async (revAId: string, revBId: string) => {
    try {
      const [{ data: filesA }, { data: filesB }] = await Promise.all([
        supabase.from('app_files').select('path, content').eq('project_id', id!).eq('revision_id', revAId),
        supabase.from('app_files').select('path, content').eq('project_id', id!).eq('revision_id', revBId),
      ]);
      setCompareFiles({ a: filesA || [], b: filesB || [] });
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleCreateRepo = async () => {
    if (!id || !newRepoName.trim()) return;
    setIsCreatingRepo(true);
    try {
      const result = await createGitHubRepo(id, newRepoName.trim(), isRepoPrivate);
      toast.success(`Created repo: ${result.repoFullName}`);
      setNewRepoName('');
      queryClient.invalidateQueries({ queryKey: ['project', id] });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsCreatingRepo(false);
    }
  };

  const handlePushGitHub = async () => {
    if (!id) return;
    setIsPushing(true);
    try {
      const result = await pushToGitHub(id, pushBranch);
      toast.success(`Pushed ${result.filesCount} files to ${result.repo}@${result.branch} (${result.commitSha?.substring(0, 7)})`);
      queryClient.invalidateQueries({ queryKey: ['build-logs', id] });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsPushing(false);
    }
  };

  const handleCreateBranch = async () => {
    if (!id || !newBranchName.trim()) return;
    setIsCreatingBranch(true);
    try {
      await createGitHubBranch(id, newBranchName.trim());
      toast.success(`Created branch: ${newBranchName}`);
      setNewBranchName('');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsCreatingBranch(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/app-builder')}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">{template?.icon || '📱'}</span>
              <h1 className="text-2xl font-bold text-foreground">{project.name}</h1>
              <Badge className={status.color}>{status.label}</Badge>
              {canResume && (
                <Button variant="outline" size="sm" onClick={handleResume} className="gap-1">
                  <RefreshCw className="w-3 h-3" /> Resume
                </Button>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1">{project.description}</p>
            <div className="flex gap-2 mt-2 text-xs text-muted-foreground">
              <span>{stack?.name}</span>
              <span>•</span>
              <span>{AI_MODELS.find(m => m.value === project.selected_model)?.label || project.selected_model}</span>
              <span>•</span>
              <span>Updated {formatDistanceToNow(new Date(project.updated_at), { addSuffix: true })}</span>
              {latestGen?.token_usage ? (
                <>
                  <span>•</span>
                  <span>{latestGen.token_usage.toLocaleString()} tokens</span>
                </>
              ) : null}
            </div>
          </div>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm"><Trash2 className="w-4 h-4 text-destructive" /></Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete project?</AlertDialogTitle>
              <AlertDialogDescription>This will permanently delete {project.name} and all its files.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Main tabs */}
      <Tabs defaultValue="files">
        <TabsList>
          <TabsTrigger value="files" className="gap-1"><FolderTree className="w-4 h-4" />Files</TabsTrigger>
          <TabsTrigger value="preview" className="gap-1"><Eye className="w-4 h-4" />Preview</TabsTrigger>
          <TabsTrigger value="revisions" className="gap-1"><History className="w-4 h-4" />Revisions</TabsTrigger>
          <TabsTrigger value="logs" className="gap-1"><Terminal className="w-4 h-4" />Build Logs</TabsTrigger>
          <TabsTrigger value="export" className="gap-1"><Download className="w-4 h-4" />Export</TabsTrigger>
          <TabsTrigger value="github" className="gap-1"><GitBranch className="w-4 h-4" />GitHub</TabsTrigger>
        </TabsList>

        {/* Files Tab */}
        <TabsContent value="files">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="shadow-card">
              <CardHeader className="py-3 px-4"><CardTitle className="text-sm">File Tree</CardTitle></CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[500px]">
                  {files && files.length > 0 ? (
                    <FileTreeView tree={fileTree} selectedFile={selectedFile} onSelect={setSelectedFile} />
                  ) : (
                    <div className="p-4 text-sm text-muted-foreground text-center">No files generated yet</div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
            <Card className="lg:col-span-2 shadow-card">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <FileCode className="w-4 h-4" />
                  {selectedFile || 'Select a file'}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[500px]">
                  {selectedFileData ? (
                    <pre className="p-4 text-xs font-mono text-foreground whitespace-pre-wrap break-words">
                      {selectedFileData.content}
                    </pre>
                  ) : (
                    <div className="p-4 text-sm text-muted-foreground text-center">
                      {files && files.length > 0 ? 'Select a file to view its code' : 'Generate your app to see files here'}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
          <Card className="shadow-card mt-4">
            <CardContent className="p-4">
              <div className="flex gap-3">
                <div className="flex-1">
                  <Textarea value={followUpPrompt} onChange={(e) => setFollowUpPrompt(e.target.value)}
                    placeholder="Describe changes: add login, redesign dashboard, fix bugs..." className="min-h-[60px]" />
                </div>
                <div className="flex flex-col gap-2">
                  <Select value={followUpModel} onValueChange={setFollowUpModel}>
                    <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {AI_MODELS.slice(0, 6).map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button onClick={handleFollowUp} disabled={isEditing || !followUpPrompt.trim()}>
                    {isEditing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Preview Tab — LIVE IFRAME */}
        <TabsContent value="preview">
          <Card className="shadow-card">
            <CardContent className="p-0">
              {previewHtml ? (
                <iframe
                  srcDoc={previewHtml}
                  className="w-full border-0 rounded-lg"
                  style={{ height: '600px' }}
                  sandbox="allow-scripts allow-same-origin"
                  title="App Preview"
                />
              ) : (
                <div className="text-center py-12 px-6">
                  <Eye className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">Generate your app to see the live preview</p>
                </div>
              )}
            </CardContent>
          </Card>
          {files && files.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
              <Card className="shadow-card p-3">
                <div className="text-2xl font-bold text-foreground">{files.length}</div>
                <div className="text-xs text-muted-foreground">Files</div>
              </Card>
              <Card className="shadow-card p-3">
                <div className="text-2xl font-bold text-foreground">{revisions?.length || 0}</div>
                <div className="text-xs text-muted-foreground">Revisions</div>
              </Card>
              <Card className="shadow-card p-3">
                <div className="text-2xl font-bold text-foreground">{generations?.length || 0}</div>
                <div className="text-xs text-muted-foreground">Generations</div>
              </Card>
              <Card className="shadow-card p-3">
                <div className="text-2xl font-bold text-foreground">{latestGen?.token_usage?.toLocaleString() || '0'}</div>
                <div className="text-xs text-muted-foreground">Tokens Used</div>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* Revisions Tab */}
        <TabsContent value="revisions">
          {compareFiles ? (
            <Card className="shadow-card">
              <CardHeader className="py-3 px-4 flex flex-row items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ArrowLeftRight className="w-4 h-4" /> Revision Comparison
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setCompareFiles(null)}>Close</Button>
              </CardHeader>
              <CardContent className="p-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground mb-2">Older ({compareFiles.a.length} files)</h4>
                    <div className="space-y-1 max-h-[400px] overflow-auto">
                      {compareFiles.a.map((f, i) => {
                        const matchB = compareFiles.b.find((fb: any) => fb.path === f.path);
                        const changed = matchB && matchB.content !== f.content;
                        const removed = !matchB;
                        return (
                          <div key={i} className={`text-xs p-1.5 rounded font-mono ${removed ? 'bg-destructive/10 text-destructive' : changed ? 'bg-yellow-500/10 text-yellow-500' : 'text-muted-foreground'}`}>
                            {f.path} {removed ? '(removed)' : changed ? '(changed)' : ''}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground mb-2">Newer ({compareFiles.b.length} files)</h4>
                    <div className="space-y-1 max-h-[400px] overflow-auto">
                      {compareFiles.b.map((f, i) => {
                        const matchA = compareFiles.a.find((fa: any) => fa.path === f.path);
                        const isNew = !matchA;
                        const changed = matchA && matchA.content !== f.content;
                        return (
                          <div key={i} className={`text-xs p-1.5 rounded font-mono ${isNew ? 'bg-green-500/10 text-green-500' : changed ? 'bg-yellow-500/10 text-yellow-500' : 'text-muted-foreground'}`}>
                            {f.path} {isNew ? '(new)' : changed ? '(changed)' : ''}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="shadow-card">
              <CardContent className="p-4">
                {revisions && revisions.length > 0 ? (
                  <div className="space-y-3">
                    {revisions.map((rev, idx) => (
                      <div key={rev.id} className="flex items-center justify-between p-3 rounded-lg border">
                        <div>
                          <div className="font-medium text-sm text-foreground">Revision #{rev.revision_number}</div>
                          <div className="text-xs text-muted-foreground">{rev.change_summary || 'No summary'}</div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {formatDistanceToNow(new Date(rev.created_at), { addSuffix: true })}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {idx < revisions.length - 1 && (
                            <Button variant="outline" size="sm" onClick={() => handleCompareRevisions(revisions[idx + 1].id, rev.id)}>
                              <ArrowLeftRight className="w-3 h-3 mr-1" /> Compare
                            </Button>
                          )}
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="outline" size="sm" disabled={isRestoring}>
                                <RotateCcw className="w-3 h-3 mr-1" /> Restore
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Restore revision #{rev.revision_number}?</AlertDialogTitle>
                                <AlertDialogDescription>This will restore files and create a new revision.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleRestoreRevision(rev.id, rev.revision_number)}>Restore</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <History className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                    <p className="text-muted-foreground">No revisions yet</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Build Logs Tab */}
        <TabsContent value="logs">
          <Card className="shadow-card">
            <CardContent className="p-4">
              {logs && logs.length > 0 ? (
                <ScrollArea className="h-[500px]">
                  <div className="space-y-1 font-mono text-xs">
                    {logs.map((log) => (
                      <div key={log.id} className={`p-2 rounded flex gap-2 ${
                        log.level === 'error' ? 'bg-destructive/10 text-destructive' :
                        log.level === 'warning' ? 'bg-yellow-500/10 text-yellow-500' :
                        log.level === 'success' ? 'bg-green-500/10 text-green-500' :
                        'text-muted-foreground'
                      }`}>
                        <span className="opacity-50">[{new Date(log.created_at).toLocaleTimeString()}]</span>
                        <span className="uppercase font-bold w-16">{log.level}</span>
                        <span>{log.message}</span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <div className="text-center py-12">
                  <Terminal className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">No build logs yet</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Export Tab */}
        <TabsContent value="export">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { type: 'zip', icon: Download, title: 'Web App (ZIP)', desc: 'Download source code as ZIP' },
              { type: 'desktop_mac', icon: Monitor, title: 'macOS Desktop', desc: 'Electron wrapper for macOS' },
              { type: 'desktop_windows', icon: Monitor, title: 'Windows Desktop', desc: 'Electron wrapper for Windows' },
              { type: 'mobile_android', icon: Smartphone, title: 'Android App', desc: 'Capacitor wrapper for Android' },
              { type: 'mobile_ios', icon: Smartphone, title: 'iOS App', desc: 'Capacitor wrapper for iOS' },
              { type: 'pwa', icon: Globe, title: 'Progressive Web App', desc: 'Service worker & manifest' },
            ].map(({ type, icon: Icon, title, desc }) => (
              <Card key={type} className="shadow-card">
                <CardContent className="p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <Icon className="w-6 h-6 text-primary" />
                    <div>
                      <h3 className="font-semibold text-foreground">{title}</h3>
                      <p className="text-xs text-muted-foreground">{desc}</p>
                    </div>
                  </div>
                  <Button onClick={() => handleExport(type)} disabled={!!isExporting || !files?.length} className="w-full">
                    {isExporting === type ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Download className="w-4 h-4 mr-2" />}
                    Download
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* GitHub Tab — REAL */}
        <TabsContent value="github">
          <div className="space-y-4">
            {project.github_connected && project.github_repo_url ? (
              <>
                <Card className="shadow-card">
                  <CardContent className="p-6 space-y-4">
                    <div className="flex items-center gap-2">
                      <GitBranch className="w-5 h-5 text-green-500" />
                      <span className="font-medium text-foreground">Connected to GitHub</span>
                    </div>
                    <a href={project.github_repo_url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline block">
                      {project.github_repo_url}
                    </a>

                    {/* Push */}
                    <div className="flex gap-2 items-end">
                      <div className="flex-1">
                        <Label className="text-xs text-muted-foreground">Branch</Label>
                        <Input value={pushBranch} onChange={e => setPushBranch(e.target.value)} placeholder="main" />
                      </div>
                      <Button onClick={handlePushGitHub} disabled={isPushing}>
                        {isPushing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <GitBranch className="w-4 h-4 mr-2" />}
                        Push Changes
                      </Button>
                    </div>

                    {/* Create branch */}
                    <div className="flex gap-2 items-end">
                      <div className="flex-1">
                        <Label className="text-xs text-muted-foreground">New Branch Name</Label>
                        <Input value={newBranchName} onChange={e => setNewBranchName(e.target.value)} placeholder="feature/my-feature" />
                      </div>
                      <Button variant="outline" onClick={handleCreateBranch} disabled={isCreatingBranch || !newBranchName.trim()}>
                        {isCreatingBranch ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                        Create Branch
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card className="shadow-card">
                <CardContent className="p-6 space-y-4">
                  <div className="text-center mb-4">
                    <GitBranch className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                    <h3 className="font-semibold text-foreground mb-1">Create a GitHub Repository</h3>
                    <p className="text-sm text-muted-foreground">Push your generated code to GitHub</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Repository Name</Label>
                    <Input value={newRepoName} onChange={e => setNewRepoName(e.target.value)}
                      placeholder={project.slug || 'my-app'} />
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={isRepoPrivate} onCheckedChange={setIsRepoPrivate} id="private-repo" />
                    <Label htmlFor="private-repo" className="text-sm">Private repository</Label>
                  </div>
                  <Button onClick={handleCreateRepo} disabled={isCreatingRepo || !newRepoName.trim()} className="w-full">
                    {isCreatingRepo ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                    Create Repository & Push
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">
                    Make sure you've connected GitHub in the <button onClick={() => navigate('/app-builder/github')} className="text-primary hover:underline">GitHub Settings</button> page first.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── File tree helpers ───
interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: TreeNode[];
}

function buildFileTree(files: { path: string }[]): TreeNode[] {
  const root: TreeNode[] = [];
  for (const file of files) {
    const parts = file.path.split('/');
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const isFile = i === parts.length - 1;
      const path = parts.slice(0, i + 1).join('/');
      let existing = current.find((n) => n.name === name);
      if (!existing) {
        existing = { name, path, type: isFile ? 'file' : 'folder', children: isFile ? undefined : [] };
        current.push(existing);
      }
      if (!isFile && existing.children) {
        current = existing.children;
      }
    }
  }
  return sortTree(root);
}

function sortTree(nodes: TreeNode[]): TreeNode[] {
  return nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name);
  }).map(n => n.children ? { ...n, children: sortTree(n.children) } : n);
}

function FileTreeView({ tree, selectedFile, onSelect, depth = 0 }: {
  tree: TreeNode[];
  selectedFile: string | null;
  onSelect: (path: string) => void;
  depth?: number;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (path: string) => setExpanded(prev => {
    const next = new Set(prev);
    next.has(path) ? next.delete(path) : next.add(path);
    return next;
  });

  return (
    <div>
      {tree.map((node) => (
        <div key={node.path}>
          <button
            onClick={() => node.type === 'folder' ? toggle(node.path) : onSelect(node.path)}
            className={`flex items-center gap-1.5 w-full text-left px-3 py-1.5 text-sm hover:bg-muted transition-colors ${
              selectedFile === node.path ? 'bg-primary/10 text-primary' : 'text-foreground'
            }`}
            style={{ paddingLeft: `${12 + depth * 16}px` }}
          >
            {node.type === 'folder' ? (
              <>
                <ChevronRight className={`w-3 h-3 transition-transform ${expanded.has(node.path) ? 'rotate-90' : ''}`} />
                <Folder className="w-3.5 h-3.5 text-primary" />
              </>
            ) : (
              <>
                <span className="w-3" />
                <File className="w-3.5 h-3.5 text-muted-foreground" />
              </>
            )}
            <span className="truncate">{node.name}</span>
          </button>
          {node.type === 'folder' && expanded.has(node.path) && node.children && (
            <FileTreeView tree={node.children} selectedFile={selectedFile} onSelect={onSelect} depth={depth + 1} />
          )}
        </div>
      ))}
    </div>
  );
}
