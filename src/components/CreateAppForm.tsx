import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreateProject } from '@/hooks/useProjects';
import { AI_MODELS, TEMPLATES, STACKS, APP_TYPES } from '@/lib/constants';
import { generateSpec, generateFiles, reviewFiles, validateProject } from '@/lib/ai-service';
import { moderatePrompt } from '@/lib/plan-constants';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Loader2, Sparkles, ChevronRight, Check } from 'lucide-react';

const STEPS = ['Configure', 'Template & Stack', 'Options', 'Generate'];

export function CreateAppForm() {
  const navigate = useNavigate();
  const createProject = useCreateProject();
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [genStage, setGenStage] = useState('');
  const [genProgress, setGenProgress] = useState(0);

  const [form, setForm] = useState({
    name: '',
    description: '',
    app_type: 'web',
    template_key: 'landing-page',
    stack_key: 'react-vite',
    selected_model: 'auto',
    github: false,
    supabase: false,
    auth: false,
    adminPanel: false,
    payments: false,
    pulseAi: false,
  });

  const updateForm = (key: string, value: any) => setForm((f) => ({ ...f, [key]: value }));

  const handleGenerate = async () => {
    if (!form.name.trim() || !form.description.trim()) {
      toast.error('Please provide app name and description');
      return;
    }
    if (!user) {
      toast.error('Please sign in first');
      return;
    }

    const modResult = moderatePrompt(form.description);
    if (!modResult.safe) {
      toast.error(modResult.reason || 'Invalid prompt');
      return;
    }

    setGenerating(true);
    try {
      // Step 1: Create project
      setGenStage('Creating project...');
      setGenProgress(5);
      const project = await createProject.mutateAsync({
        name: form.name,
        description: form.description,
        app_type: form.app_type,
        template_key: form.template_key,
        stack_key: form.stack_key,
        selected_model: form.selected_model,
        options: {
          github: form.github,
          supabase: form.supabase,
          auth: form.auth,
          adminPanel: form.adminPanel,
          payments: form.payments,
          pulseAi: form.pulseAi,
        },
      });

      // Step 2: Generate spec
      setGenStage('Generating project specification...');
      setGenProgress(20);
      const specResult = await generateSpec({
        projectId: project.id,
        prompt: form.description,
        model: form.selected_model,
        template: form.template_key,
        stack: form.stack_key,
        appType: form.app_type,
        options: {
          github: form.github,
          supabase: form.supabase,
          auth: form.auth,
          adminPanel: form.adminPanel,
          payments: form.payments,
          pulseAi: form.pulseAi,
        },
      });

      // Step 3: Generate files
      setGenStage('Generating project files...');
      setGenProgress(50);
      await generateFiles({
        projectId: project.id,
        generationId: specResult.generationId as string,
        spec: specResult.spec as Record<string, unknown>,
        model: form.selected_model,
        stack: form.stack_key,
      });

      // Step 4: Review
      setGenStage('Reviewing generated code...');
      setGenProgress(75);
      await reviewFiles(project.id, specResult.generationId as string);

      // Step 5: Validate
      setGenStage('Validating project...');
      setGenProgress(90);
      await validateProject(project.id, specResult.generationId as string);

      setGenProgress(100);
      setGenStage('Complete!');
      toast.success('App generated successfully!');

      setTimeout(() => navigate(`/app-builder/${project.id}`), 1000);
    } catch (err: any) {
      toast.error(err.message || 'Generation failed');
      setGenStage('Failed');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto animate-slide-up">
      {/* Progress steps */}
      <div className="flex items-center gap-2 mb-8">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <button
              onClick={() => !generating && setStep(i)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                i === step ? 'bg-primary text-primary-foreground' : i < step ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'
              }`}
            >
              {i < step ? <Check className="w-3.5 h-3.5" /> : <span>{i + 1}</span>}
              <span className="hidden sm:inline">{s}</span>
            </button>
            {i < STEPS.length - 1 && <ChevronRight className="w-4 h-4 text-muted-foreground" />}
          </div>
        ))}
      </div>

      {/* Step 1: Configure */}
      {step === 0 && (
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              Describe Your App
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>App Name</Label>
              <Input value={form.name} onChange={(e) => updateForm('name', e.target.value)} placeholder="My Awesome App" />
            </div>
            <div className="space-y-2">
              <Label>App Description / Prompt</Label>
              <Textarea
                value={form.description}
                onChange={(e) => updateForm('description', e.target.value)}
                placeholder="Describe what your app should do. Be as detailed as possible..."
                className="min-h-[120px]"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>App Type</Label>
                <Select value={form.app_type} onValueChange={(v) => updateForm('app_type', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {APP_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>AI Model</Label>
                <Select value={form.selected_model} onValueChange={(v) => updateForm('selected_model', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {AI_MODELS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        <div className="flex flex-col">
                          <span>{m.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => setStep(1)} disabled={!form.name || !form.description}>
                Next <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Template & Stack */}
      {step === 1 && (
        <Card className="shadow-card">
          <CardHeader><CardTitle>Choose Template & Stack</CardTitle></CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label className="mb-3 block">Template</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {TEMPLATES.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => updateForm('template_key', t.key)}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      form.template_key === t.key ? 'border-primary bg-primary/5 ring-2 ring-primary/20' : 'hover:border-primary/50'
                    }`}
                  >
                    <div className="text-2xl mb-1">{t.icon}</div>
                    <div className="font-medium text-sm text-foreground">{t.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{t.description}</div>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label className="mb-3 block">Stack</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {STACKS.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => updateForm('stack_key', s.key)}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      form.stack_key === s.key ? 'border-primary bg-primary/5 ring-2 ring-primary/20' : 'hover:border-primary/50'
                    }`}
                  >
                    <div className="text-2xl mb-1">{s.icon}</div>
                    <div className="font-medium text-sm text-foreground">{s.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{s.description}</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(0)}>Back</Button>
              <Button onClick={() => setStep(2)}>Next <ChevronRight className="w-4 h-4 ml-1" /></Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Options */}
      {step === 2 && (
        <Card className="shadow-card">
          <CardHeader><CardTitle>Additional Options</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {[
              { key: 'supabase', label: 'Add Supabase Backend', desc: 'Database, auth, and API' },
              { key: 'auth', label: 'Add Authentication', desc: 'Login/signup system' },
              { key: 'adminPanel', label: 'Add Admin Panel', desc: 'Admin dashboard for managing data' },
              { key: 'payments', label: 'Add Payments', desc: 'Stripe or payment integration' },
              { key: 'github', label: 'Push to GitHub', desc: 'Create repo and push code' },
              { key: 'pulseAi', label: 'Pulse AI Integration', desc: 'Connect to Pulse AI ecosystem' },
            ].map((opt) => (
              <div key={opt.key} className="flex items-center justify-between p-3 rounded-lg border">
                <div>
                  <div className="font-medium text-sm text-foreground">{opt.label}</div>
                  <div className="text-xs text-muted-foreground">{opt.desc}</div>
                </div>
                <Switch
                  checked={form[opt.key as keyof typeof form] as boolean}
                  onCheckedChange={(v) => updateForm(opt.key, v)}
                />
              </div>
            ))}
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
              <Button onClick={() => setStep(3)}>
                Review & Generate <Sparkles className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Review & Generate */}
      {step === 3 && (
        <Card className="shadow-card">
          <CardHeader><CardTitle>Review & Generate</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-muted-foreground">Name:</span> <span className="font-medium text-foreground">{form.name}</span></div>
              <div><span className="text-muted-foreground">Type:</span> <span className="font-medium text-foreground">{form.app_type}</span></div>
              <div><span className="text-muted-foreground">Template:</span> <span className="font-medium text-foreground">{TEMPLATES.find(t => t.key === form.template_key)?.name}</span></div>
              <div><span className="text-muted-foreground">Stack:</span> <span className="font-medium text-foreground">{STACKS.find(s => s.key === form.stack_key)?.name}</span></div>
              <div><span className="text-muted-foreground">Model:</span> <span className="font-medium text-foreground">{AI_MODELS.find(m => m.value === form.selected_model)?.label}</span></div>
            </div>
            <div className="p-3 rounded-lg bg-muted">
              <div className="text-xs text-muted-foreground mb-1">Prompt</div>
              <div className="text-sm text-foreground">{form.description}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              {form.supabase && <Badge variant="secondary">Supabase</Badge>}
              {form.auth && <Badge variant="secondary">Auth</Badge>}
              {form.adminPanel && <Badge variant="secondary">Admin Panel</Badge>}
              {form.payments && <Badge variant="secondary">Payments</Badge>}
              {form.github && <Badge variant="secondary">GitHub</Badge>}
              {form.pulseAi && <Badge variant="secondary">Pulse AI</Badge>}
            </div>

            {generating && (
              <div className="space-y-3 p-4 rounded-lg border bg-primary/5">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  <span className="text-sm font-medium text-foreground">{genStage}</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all duration-500"
                    style={{ width: `${genProgress}%` }}
                  />
                </div>
                <div className="text-xs text-muted-foreground">{genProgress}% complete</div>
              </div>
            )}

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)} disabled={generating}>Back</Button>
              <Button onClick={handleGenerate} disabled={generating} className="gradient-primary text-primary-foreground">
                {generating ? (
                  <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Generating...</>
                ) : (
                  <><Sparkles className="w-4 h-4 mr-2" /> Generate App</>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
