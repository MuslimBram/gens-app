import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { GitBranch, Plus, ExternalLink, Loader2, Unlink } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getGitHubAuthUrl, exchangeGitHubCode, disconnectGitHub } from '@/lib/github-service';
import { toast } from 'sonner';

export function GitHubPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const { data: connections, isLoading } = useQuery({
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

  // Handle OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) {
      window.history.replaceState({}, '', window.location.pathname);
      exchangeGitHubCode(code)
        .then((result) => {
          toast.success(`Connected to GitHub as ${result.accountName}`);
          queryClient.invalidateQueries({ queryKey: ['github-connections'] });
        })
        .catch((err) => toast.error(err.message));
    }
  }, [queryClient]);

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const redirectUri = `${window.location.origin}/app-builder/github`;
      const { url } = await getGitHubAuthUrl(redirectUri);
      window.location.href = url;
    } catch (err: any) {
      toast.error(err.message);
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    try {
      await disconnectGitHub();
      toast.success('GitHub disconnected');
      queryClient.invalidateQueries({ queryKey: ['github-connections'] });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsDisconnecting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">GitHub Integration</h1>
        {(!connections || connections.length === 0) && (
          <Button className="gap-2" onClick={handleConnect} disabled={isConnecting}>
            {isConnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Connect GitHub
          </Button>
        )}
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
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleDisconnect} disabled={isDisconnecting}>
                    <Unlink className="w-4 h-4" />
                  </Button>
                </div>
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
            <Button className="gap-2" onClick={handleConnect} disabled={isConnecting}>
              {isConnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitBranch className="w-4 h-4" />}
              Connect GitHub Account
            </Button>
          </CardContent>
        </Card>
      )}

      <Card className="shadow-card">
        <CardHeader><CardTitle className="text-sm">Setup Instructions</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>To enable GitHub integration, you need to configure a GitHub OAuth App:</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Go to GitHub → Settings → Developer settings → OAuth Apps</li>
            <li>Create a new OAuth App with callback URL: <code className="bg-muted px-1 rounded">{window.location.origin}/app-builder/github</code></li>
            <li>Add <code className="bg-muted px-1 rounded">GITHUB_CLIENT_ID</code> and <code className="bg-muted px-1 rounded">GITHUB_CLIENT_SECRET</code> as backend secrets</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
