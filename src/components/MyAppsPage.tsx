import { Link } from 'react-router-dom';
import { useProjects } from '@/hooks/useProjects';
import { PROJECT_STATUSES, TEMPLATES, STACKS } from '@/lib/constants';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { PlusCircle, Search, FolderOpen, Clock } from 'lucide-react';
import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';

export function MyAppsPage() {
  const { data: projects, isLoading } = useProjects();
  const [search, setSearch] = useState('');

  const filtered = projects?.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.description?.toLowerCase().includes(search.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-48 rounded-lg" />)}
        </div>
      </div>
    );
  }

  if (!projects || projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
        <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
          <FolderOpen className="w-8 h-8 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-semibold text-foreground mb-2">No apps yet</h2>
        <p className="text-muted-foreground mb-6">Create your first app with AI in minutes</p>
        <Link to="/app-builder/create">
          <Button className="gradient-primary text-primary-foreground gap-2">
            <PlusCircle className="w-4 h-4" /> Create Your First App
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">My Apps</h1>
        <Link to="/app-builder/create">
          <Button className="gap-2">
            <PlusCircle className="w-4 h-4" /> New App
          </Button>
        </Link>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search apps..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered?.map((project) => {
          const status = PROJECT_STATUSES[project.status] || PROJECT_STATUSES.draft;
          const template = TEMPLATES.find((t) => t.key === project.template_key);
          const stack = STACKS.find((s) => s.key === project.stack_key);

          return (
            <Link key={project.id} to={`/app-builder/${project.id}`}>
              <Card className="hover:shadow-card-hover transition-all duration-200 cursor-pointer group">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="text-2xl">{template?.icon || '📱'}</div>
                    <Badge className={status.color}>{status.label}</Badge>
                  </div>
                  <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors mb-1">
                    {project.name}
                  </h3>
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                    {project.description || 'No description'}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{stack?.name || project.stack_key}</span>
                    <span>•</span>
                    <Clock className="w-3 h-3" />
                    <span>{formatDistanceToNow(new Date(project.updated_at), { addSuffix: true })}</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
