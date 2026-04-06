import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useProject, useProjectFiles, useProjectGenerations, useProjectRevisions, useBuildLogs, useUpdateProject, useDeleteProject } from '@/hooks/useProjects';
import { followUpEdit, exportZip, exportDesktop, exportMobile, exportPWA } from '@/lib/ai-service';
import { pushToGitHub } from '@/lib/github-service';
import { PROJECT_STATUSES, TEMPLATES, STACKS, AI_MODELS } from '@/lib/constants';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import {
  FileCode, FolderTree, GitBranch, History, Terminal, Eye, Download,
  Loader2, Send, ArrowLeft, Trash2, Monitor, Smartphone, Globe,
  ChevronRight, File, Folder, RotateCcw, ArrowLeftRight
} from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { formatDistanceToNow } from 'date-fns';

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
  const [isExporting, setIsExporting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [compareRevisions, setCompareRevisions] = useState<{ a: string; b: string } | null>(null);
  const [compareFiles, setCompareFiles] = useState<{ a: any[]; b: any[] } | null>(null);

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
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsEditing(false);
    }
  };

  const handleExportZip = async () => {
    if (!id) return;
    setIsExporting(true);
    try {
      const blob = await exportZip(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project.slug || project.name}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('ZIP downloaded!');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsExporting(false);
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
      // Get files for this revision
      const { data: revFiles, error } = await supabase
        .from('app_files')
        .select('path, content, file_type')
        .eq('project_id', id)
        .eq('revision_id', revisionId);

      if (error) throw error;
      if (!revFiles || revFiles.length === 0) {
        toast.error('No files found for this revision');
        return;
      }

      // Create a new revision for the restore
      const { count } = await supabase.from('app_revisions')
        .select('*', { count: 'exact', head: true }).eq('project_id', id);

      await supabase.from('app_revisions').insert({
        project_id: id,
        revision_number: (count || 0) + 1,
        change_summary: `Restored to revision #${revisionNumber}`,
        created_by: (await supabase.auth.getUser()).data.user!.id,
      });

      // Update current files with revision's files
      for (const file of revFiles) {
        await supabase.from('app_files')
          .update({ content: file.content })
          .eq('project_id', id)
          .eq('path', file.path);
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
      setCompareRevisions({ a: revAId, b: revBId });
      setCompareFiles({ a: filesA || [], b: filesB || [] });
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handlePushGitHub = async () => {
    if (!id) return;
    try {
      const result = await pushToGitHub(id);
      toast.success(`Pushed ${result.filesCount} files to ${result.repo}`);
    } catch (err: any) {
      toast.error(err.message);
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
            </div>
            <p className="text-sm text-muted-foreground mt-1">{project.description}</p>
            <div className="flex gap-2 mt-2 text-xs text-muted-foreground">
              <span>{stack?.name}</span>
              <span>•</span>
              <span>{AI_MODELS.find(m => m.value === project.selected_model)?.label || project.selected_model}</span>
              <span>•</span>
              <span>Updated {formatDistanceToNow(new Date(project.updated_at), { addSuffix: true })}</span>
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

        {/* Preview Tab */}
        <TabsContent value="preview">
          <Card className="shadow-card">
            <CardContent className="p-6">
              {files && files.length > 0 ? (
                <div className="space-y-4">
                  <h3 className="font-semibold text-foreground">Project Summary</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-3 rounded-lg bg-muted">
                      <div className="text-2xl font-bold text-foreground">{files.length}</div>
                      <div className="text-xs text-muted-foreground">Files</div>
                    </div>
                    <div className="p-3 rounded-lg bg-muted">
                      <div className="text-2xl font-bold text-foreground">{revisions?.length || 0}</div>
                      <div className="text-xs text-muted-foreground">Revisions</div>
                    </div>
                    <div className="p-3 rounded-lg bg-muted">
                      <div className="text-2xl font-bold text-foreground">{generations?.length || 0}</div>
                      <div className="text-xs text-muted-foreground">Generations</div>
                    </div>
                    <div className="p-3 rounded-lg bg-muted">
                      <div className="text-2xl font-bold text-foreground">{stack?.name || '-'}</div>
                      <div className="text-xs text-muted-foreground">Stack</div>
                    </div>
                  </div>
                  <h3 className="font-semibold text-foreground mt-4">Generated Pages</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {files.filter(f => f.path.includes('pages/') || f.path.endsWith('.html')).map(f => (
                      <button key={f.id} onClick={() => setSelectedFile(f.path)}
                        className="p-3 rounded-lg border text-left hover:border-primary/50 transition-colors">
                        <div className="text-sm font-medium text-foreground">{f.path.split('/').pop()}</div>
                        <div className="text-xs text-muted-foreground">{f.path}</div>
                      </button>
                    ))}
                  </div>
                  {generations?.[0]?.spec_json && (
                    <div className="mt-4">
                      <h3 className="font-semibold text-foreground mb-2">Project Spec</h3>
                      <pre className="p-4 rounded-lg bg-muted text-xs font-mono text-foreground overflow-auto max-h-[300px]">
                        {JSON.stringify(generations[0].spec_json, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Eye className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">Generate your app to see the preview</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Revisions Tab */}
        <TabsContent value="revisions">
          {compareFiles ? (
            <Card className="shadow-card">
              <CardHeader className="py-3 px-4 flex flex-row items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ArrowLeftRight className="w-4 h-4" /> Revision Comparison
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={() => { setCompareFiles(null); setCompareRevisions(null); }}>
                  Close
                </Button>
              </CardHeader>
              <CardContent className="p-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground mb-2">Older ({compareFiles.a.length} files)</h4>
                    <div className="space-y-1 max-h-[400px] overflow-auto">
                      {compareFiles.a.map((f, i) => {
                        const matchB = compareFiles.b.find(fb => fb.path === f.path);
                        const changed = matchB && matchB.content !== f.content;
                        const removed = !matchB;
                        return (
                          <div key={i} className={`text-xs p-1.5 rounded font-mono ${removed ? 'bg-destructive/10 text-destructive' : changed ? 'bg-warning/10 text-warning' : 'text-muted-foreground'}`}>
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
                        const matchA = compareFiles.a.find(fa => fa.path === f.path);
                        const isNew = !matchA;
                        const changed = matchA && matchA.content !== f.content;
                        return (
                          <div key={i} className={`text-xs p-1.5 rounded font-mono ${isNew ? 'bg-success/10 text-success' : changed ? 'bg-warning/10 text-warning' : 'text-muted-foreground'}`}>
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
                                <AlertDialogDescription>This will restore all files to this revision's state and create a new revision.</AlertDialogDescription>
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
                        log.level === 'warning' ? 'bg-warning/10 text-warning' :
                        log.level === 'success' ? 'bg-success/10 text-success' :
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
            <Card className="shadow-card">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <Download className="w-6 h-6 text-primary" />
                  <div>
                    <h3 className="font-semibold text-foreground">Web App (ZIP)</h3>
                    <p className="text-xs text-muted-foreground">Download source code as ZIP</p>
                  </div>
                </div>
                <Button onClick={handleExportZip} disabled={isExporting || !files?.length} className="w-full">
                  {isExporting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Download className="w-4 h-4 mr-2" />}
                  Download ZIP
                </Button>
              </CardContent>
            </Card>
            <Card className="shadow-card">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <Monitor className="w-6 h-6 text-primary" />
                  <div>
                    <h3 className="font-semibold text-foreground">Desktop App</h3>
                    <p className="text-xs text-muted-foreground">Export with Electron wrapper</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => exportDesktop(id!, 'mac').then(() => toast.success('Desktop export ready')).catch(e => toast.error(e.message))} disabled={!files?.length}>macOS</Button>
                  <Button variant="outline" className="flex-1" onClick={() => exportDesktop(id!, 'windows').then(() => toast.success('Desktop export ready')).catch(e => toast.error(e.message))} disabled={!files?.length}>Windows</Button>
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-card">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <Smartphone className="w-6 h-6 text-primary" />
                  <div>
                    <h3 className="font-semibold text-foreground">Mobile App</h3>
                    <p className="text-xs text-muted-foreground">Export with Capacitor wrapper</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => exportMobile(id!, 'android').then(() => toast.success('Mobile export ready')).catch(e => toast.error(e.message))} disabled={!files?.length}>Android</Button>
                  <Button variant="outline" className="flex-1" onClick={() => exportMobile(id!, 'ios').then(() => toast.success('Mobile export ready')).catch(e => toast.error(e.message))} disabled={!files?.length}>iOS</Button>
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-card">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <Globe className="w-6 h-6 text-primary" />
                  <div>
                    <h3 className="font-semibold text-foreground">Progressive Web App</h3>
                    <p className="text-xs text-muted-foreground">Add service worker & manifest</p>
                  </div>
                </div>
                <Button variant="outline" className="w-full" onClick={() => exportPWA(id!).then(() => toast.success('PWA config added')).catch(e => toast.error(e.message))} disabled={!files?.length}>
                  Generate PWA
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* GitHub Tab */}
        <TabsContent value="github">
          <Card className="shadow-card">
            <CardContent className="p-6">
              {project.github_connected ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <GitBranch className="w-5 h-5 text-success" />
                    <span className="font-medium text-foreground">Connected to GitHub</span>
                  </div>
                  {project.github_repo_url && (
                    <a href={project.github_repo_url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">
                      {project.github_repo_url}
                    </a>
                  )}
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={handlePushGitHub}>Push Changes</Button>
                    <Button variant="outline">Create Branch</Button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <GitBranch className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <h3 className="font-semibold text-foreground mb-2">Connect to GitHub</h3>
                  <p className="text-sm text-muted-foreground mb-4">Push your generated code to a GitHub repository</p>
                  <Button className="gap-2" onClick={() => navigate('/app-builder/github')}>
                    <GitBranch className="w-4 h-4" /> Go to GitHub Settings
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// File tree helpers
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
