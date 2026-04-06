import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { BarChart3, Sparkles, Download, GitBranch } from 'lucide-react';

export function UsagePage() {
  const { user } = useAuth();

  const { data: usage } = useQuery({
    queryKey: ['usage', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('usage_tracking')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const stats = {
    generations: usage?.filter(u => u.action_type === 'generation').length || 0,
    edits: usage?.filter(u => u.action_type === 'follow_up_edit').length || 0,
    exports: usage?.filter(u => u.action_type === 'export').length || 0,
    pushes: usage?.filter(u => u.action_type === 'github_push').length || 0,
    totalTokens: usage?.reduce((sum, u) => sum + (u.token_usage || 0), 0) || 0,
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold text-foreground">Usage & Billing</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="shadow-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-xs text-muted-foreground">Generations</span>
            </div>
            <div className="text-2xl font-bold text-foreground">{stats.generations}</div>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="w-4 h-4 text-accent" />
              <span className="text-xs text-muted-foreground">Follow-up Edits</span>
            </div>
            <div className="text-2xl font-bold text-foreground">{stats.edits}</div>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Download className="w-4 h-4 text-success" />
              <span className="text-xs text-muted-foreground">Exports</span>
            </div>
            <div className="text-2xl font-bold text-foreground">{stats.exports}</div>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <GitBranch className="w-4 h-4 text-warning" />
              <span className="text-xs text-muted-foreground">GitHub Pushes</span>
            </div>
            <div className="text-2xl font-bold text-foreground">{stats.pushes}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-card">
        <CardHeader><CardTitle>Plan</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 p-4 rounded-lg bg-muted">
            <div>
              <div className="font-semibold text-foreground">Free Plan</div>
              <div className="text-sm text-muted-foreground">Upgrade to unlock more generations and features</div>
            </div>
          </div>
          <div className="mt-4 text-sm text-muted-foreground">
            Total tokens used: <span className="font-medium text-foreground">{stats.totalTokens.toLocaleString()}</span>
          </div>
        </CardContent>
      </Card>

      {usage && usage.length > 0 && (
        <Card className="shadow-card">
          <CardHeader><CardTitle>Recent Activity</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {usage.slice(0, 20).map((u) => (
                <div key={u.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <div className="text-sm font-medium text-foreground capitalize">{u.action_type.replace(/_/g, ' ')}</div>
                    <div className="text-xs text-muted-foreground">
                      {u.model_used && `${u.model_used} • `}{new Date(u.created_at).toLocaleString()}
                    </div>
                  </div>
                  {u.token_usage > 0 && (
                    <span className="text-xs text-muted-foreground">{u.token_usage.toLocaleString()} tokens</span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
