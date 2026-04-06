import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { PLANS } from '@/lib/plan-constants';
import { Settings, Crown, Sparkles, Download, MessageSquare, Check } from 'lucide-react';
import { toast } from 'sonner';

export function SettingsPage() {
  const { user } = useAuth();

  const { data: userPlan } = useQuery({
    queryKey: ['user-plan', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_plans')
        .select('*')
        .eq('user_id', user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const currentPlan = PLANS.find(p => p.key === (userPlan?.plan_name || 'free')) || PLANS[0];
  const genPercent = userPlan ? (userPlan.generations_used / userPlan.generations_limit) * 100 : 0;
  const exportPercent = userPlan ? (userPlan.exports_used / userPlan.exports_limit) * 100 : 0;
  const followUpPercent = userPlan ? (userPlan.follow_ups_used / userPlan.follow_ups_limit) * 100 : 0;
  const periodEnd = userPlan?.period_end ? new Date(userPlan.period_end).toLocaleDateString() : '-';

  const handleUpgrade = (planKey: string) => {
    toast.info(`Plan upgrade to ${planKey} coming soon! Contact support for early access.`);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
        <Settings className="w-6 h-6" /> Settings & Plan
      </h1>

      {/* Current Usage */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-primary" />
            {currentPlan.name} Plan
            <Badge variant="outline">{currentPlan.price}{currentPlan.period}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground">Period resets: {periodEnd}</div>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="flex items-center gap-1"><Sparkles className="w-3.5 h-3.5" /> Generations</span>
                <span className="text-muted-foreground">{userPlan?.generations_used || 0} / {userPlan?.generations_limit || currentPlan.generations}</span>
              </div>
              <Progress value={genPercent} className="h-2" />
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="flex items-center gap-1"><MessageSquare className="w-3.5 h-3.5" /> Follow-up Edits</span>
                <span className="text-muted-foreground">{userPlan?.follow_ups_used || 0} / {userPlan?.follow_ups_limit || currentPlan.followUps}</span>
              </div>
              <Progress value={followUpPercent} className="h-2" />
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="flex items-center gap-1"><Download className="w-3.5 h-3.5" /> Exports</span>
                <span className="text-muted-foreground">{userPlan?.exports_used || 0} / {userPlan?.exports_limit || currentPlan.exports}</span>
              </div>
              <Progress value={exportPercent} className="h-2" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Plan Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {PLANS.map((plan) => {
          const isCurrent = plan.key === (userPlan?.plan_name || 'free');
          return (
            <Card key={plan.key} className={`shadow-card relative ${plan.highlighted ? 'border-primary ring-1 ring-primary' : ''}`}>
              {plan.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-primary text-primary-foreground">Most Popular</Badge>
                </div>
              )}
              <CardContent className="p-5 flex flex-col h-full">
                <div className="mb-4">
                  <h3 className="font-bold text-lg text-foreground">{plan.name}</h3>
                  <div className="text-2xl font-bold text-foreground mt-1">{plan.price}<span className="text-sm font-normal text-muted-foreground">{plan.period}</span></div>
                </div>
                <ul className="space-y-2 flex-1 mb-4">
                  {plan.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button
                  variant={isCurrent ? 'outline' : plan.highlighted ? 'default' : 'outline'}
                  className="w-full"
                  disabled={isCurrent}
                  onClick={() => handleUpgrade(plan.key)}
                >
                  {isCurrent ? 'Current Plan' : 'Upgrade'}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Account Info */}
      <Card className="shadow-card">
        <CardHeader><CardTitle className="text-sm">Account</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Email</span>
            <span className="text-foreground">{user?.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">User ID</span>
            <span className="text-foreground font-mono text-xs">{user?.id?.slice(0, 8)}...</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
