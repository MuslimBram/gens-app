import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Zap, ArrowRight, Code, Smartphone, Download, GitBranch, Sparkles, LayoutGrid } from 'lucide-react';

const features = [
  { icon: Sparkles, title: 'AI-Powered Generation', desc: 'Describe your app and AI builds it file-by-file' },
  { icon: Code, title: 'Multiple Stacks', desc: 'React, Next.js, Static HTML, Supabase and more' },
  { icon: LayoutGrid, title: '10+ Templates', desc: 'Start from landing pages, dashboards, CRM, and more' },
  { icon: Download, title: 'Export Anywhere', desc: 'ZIP, Desktop (Electron), Mobile (Capacitor), PWA' },
  { icon: GitBranch, title: 'GitHub Integration', desc: 'Push to repos, create branches, track commits' },
  { icon: Smartphone, title: 'Mobile Ready', desc: 'Generate Android and iOS apps with Capacitor' },
];

export default function Index() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container flex h-14 items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center">
              <Zap className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-foreground">Pulse AI App Builder</span>
          </div>
          <Link to="/app-builder">
            <Button size="sm">Launch Builder <ArrowRight className="w-4 h-4 ml-1" /></Button>
          </Link>
        </div>
      </header>

      <section className="container py-20 text-center">
        <div className="animate-slide-up max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
            <Sparkles className="w-4 h-4" /> AI App Builder
          </div>
          <h1 className="text-4xl md:text-6xl font-bold text-foreground mb-4 leading-tight">
            Build Apps from <span className="text-primary">Prompts</span>
          </h1>
          <p className="text-lg text-muted-foreground mb-8 max-w-xl mx-auto">
            Describe your app idea, choose a model and template, and let AI generate a complete project — ready to export, deploy, or push to GitHub.
          </p>
          <div className="flex justify-center gap-3">
            <Link to="/app-builder/create">
              <Button size="lg" className="gradient-primary text-primary-foreground gap-2">
                <Sparkles className="w-5 h-5" /> Start Building
              </Button>
            </Link>
            <Link to="/app-builder">
              <Button size="lg" variant="outline" className="gap-2">
                <LayoutGrid className="w-5 h-5" /> My Apps
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="container pb-20">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {features.map((f, i) => (
            <div key={i} className="p-6 rounded-xl border bg-card shadow-card animate-slide-up" style={{ animationDelay: `${i * 0.05}s` }}>
              <f.icon className="w-8 h-8 text-primary mb-3" />
              <h3 className="font-semibold text-foreground mb-1">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
