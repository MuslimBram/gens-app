import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { GitBranch, Plus, ExternalLink } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function GitHubPage() {
  const { user } = useAuth();

  const { data: connections } = useQuery({
    queryKey: ['github-connections', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('github_connections')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">GitHub Integration</h1>
        <Button className="gap-2">
          <Plus className="w-4 h-4" /> Connect GitHub
        </Button>
      </div>

      {connections && connections.length > 0 ? (
        <div className="space-y-3">
          {connections.map((conn) => (
            <Card key={conn.id} className="shadow-card">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <GitBranch className="w-5 h-5 text-foreground" />
                  <div>
                    <div className="font-medium text-foreground">{conn.account_name || 'GitHub Account'}</div>
                    <div className="text-xs text-muted-foreground">Connected {new Date(conn.created_at).toLocaleDateString()}</div>
                  </div>
                </div>
                <Button variant="outline" size="sm"><ExternalLink className="w-4 h-4" /></Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="shadow-card">
          <CardContent className="p-12 text-center">
            <GitBranch className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">No GitHub Connections</h2>
            <p className="text-muted-foreground mb-6">Connect your GitHub account to push generated apps to repositories</p>
            <Button className="gap-2">
              <GitBranch className="w-4 h-4" /> Connect GitHub Account
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
