export const AI_MODELS = [
  { value: 'auto', label: 'Auto (Smart Routing)', description: 'Automatically selects the best model for the task' },
  { value: 'claude-opus-4.6', label: 'Claude Opus 4.6', description: 'Most capable, best for complex apps' },
  { value: 'claude-sonnet-4.6', label: 'Claude Sonnet 4.6', description: 'Fast and capable' },
  { value: 'claude-sonnet-4.5', label: 'Claude Sonnet 4.5', description: 'Balanced performance' },
  { value: 'claude-sonnet-4', label: 'Claude Sonnet 4', description: 'Reliable and efficient' },
  { value: 'deepseek-v3.2', label: 'DeepSeek-V3.2', description: 'Cost-effective coding' },
  { value: 'gemini-3.1-pro', label: 'Gemini 3.1 Pro Preview', description: 'Google next-gen reasoning' },
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', description: 'Strong multimodal reasoning' },
  { value: 'gemini-3.0-flash', label: 'Gemini 3.0 Flash Preview', description: 'Fast and efficient' },
  { value: 'gpt-5', label: 'GPT 5', description: 'OpenAI flagship model' },
  { value: 'qwen3-coder-plus', label: 'Qwen3 Coder Plus', description: 'Specialized for coding' },
  { value: 'glm-4.7', label: 'GLM-4.7', description: 'ZhipuAI general model' },
  { value: 'glm-5', label: 'GLM-5', description: 'ZhipuAI advanced model' },
] as const;

export const TEMPLATES = [
  { key: 'landing-page', name: 'Landing Page', description: 'Marketing landing page with hero, features, CTA', icon: '🌐', defaultPages: ['index', 'about', 'contact'], recommendedStack: 'react-vite' },
  { key: 'business-dashboard', name: 'Business Dashboard', description: 'Analytics dashboard with charts and tables', icon: '📊', defaultPages: ['dashboard', 'analytics', 'settings'], recommendedStack: 'react-supabase' },
  { key: 'lead-funnel', name: 'Lead Funnel', description: 'Multi-step lead capture funnel', icon: '🎯', defaultPages: ['landing', 'form', 'thank-you'], recommendedStack: 'react-vite' },
  { key: 'booking-app', name: 'Booking App', description: 'Appointment booking with calendar', icon: '📅', defaultPages: ['home', 'booking', 'confirmation', 'admin'], recommendedStack: 'react-supabase' },
  { key: 'ecommerce-starter', name: 'Ecommerce Starter', description: 'Product listing with cart and checkout', icon: '🛒', defaultPages: ['home', 'products', 'cart', 'checkout'], recommendedStack: 'react-supabase' },
  { key: 'crm-mini', name: 'CRM Mini App', description: 'Contact management with pipeline', icon: '👥', defaultPages: ['contacts', 'pipeline', 'deals', 'settings'], recommendedStack: 'react-supabase' },
  { key: 'knowledge-base', name: 'Knowledge Base', description: 'Documentation and help center', icon: '📚', defaultPages: ['home', 'articles', 'search', 'article-detail'], recommendedStack: 'react-vite' },
  { key: 'support-app', name: 'Customer Support App', description: 'Ticket system with live chat', icon: '🎧', defaultPages: ['tickets', 'new-ticket', 'ticket-detail', 'knowledge-base'], recommendedStack: 'react-supabase' },
  { key: 'portfolio', name: 'Portfolio Site', description: 'Personal portfolio with projects showcase', icon: '🎨', defaultPages: ['home', 'projects', 'about', 'contact'], recommendedStack: 'static-html' },
  { key: 'admin-panel', name: 'Admin Panel', description: 'Full admin panel with CRUD operations', icon: '⚙️', defaultPages: ['dashboard', 'users', 'content', 'settings'], recommendedStack: 'react-supabase' },
] as const;

export const STACKS = [
  { key: 'react-vite', name: 'React + Vite', description: 'Modern React with Vite bundler', icon: '⚡' },
  { key: 'react-supabase', name: 'React + Supabase', description: 'Full-stack with Supabase backend', icon: '🔥' },
  { key: 'static-html', name: 'Static HTML/CSS/JS', description: 'Simple static website', icon: '📄' },
  { key: 'nextjs', name: 'Next.js', description: 'React framework with SSR', icon: '▲' },
  { key: 'dashboard-starter', name: 'Dashboard Starter', description: 'Pre-built dashboard layout', icon: '📊' },
  { key: 'landing-starter', name: 'Landing Page Starter', description: 'Pre-built landing page layout', icon: '🚀' },
] as const;

export const APP_TYPES = [
  { value: 'web', label: 'Web Application' },
  { value: 'landing', label: 'Landing Page' },
  { value: 'dashboard', label: 'Dashboard' },
  { value: 'ecommerce', label: 'E-commerce' },
  { value: 'saas', label: 'SaaS App' },
  { value: 'portfolio', label: 'Portfolio' },
  { value: 'blog', label: 'Blog' },
  { value: 'api', label: 'API Service' },
] as const;

export const PROJECT_STATUSES: Record<string, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'bg-muted text-muted-foreground' },
  generating: { label: 'Generating...', color: 'bg-primary/10 text-primary' },
  generated: { label: 'Generated', color: 'bg-success/10 text-success' },
  reviewing: { label: 'Reviewing', color: 'bg-warning/10 text-warning' },
  validating: { label: 'Validating', color: 'bg-primary/10 text-primary' },
  preview_ready: { label: 'Preview Ready', color: 'bg-success/10 text-success' },
  export_ready: { label: 'Export Ready', color: 'bg-success/10 text-success' },
  github_ready: { label: 'GitHub Ready', color: 'bg-accent/10 text-accent' },
  failed: { label: 'Failed', color: 'bg-destructive/10 text-destructive' },
};
