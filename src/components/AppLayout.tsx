import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Zap, LayoutGrid, PlusCircle, GitBranch, BarChart3, LogOut } from 'lucide-react';

const navItems = [
  { to: '/app-builder', label: 'My Apps', icon: LayoutGrid },
  { to: '/app-builder/create', label: 'Create App', icon: PlusCircle },
  { to: '/app-builder/github', label: 'GitHub', icon: GitBranch },
  { to: '/app-builder/usage', label: 'Usage', icon: BarChart3 },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background">
      {/* Top nav */}
      <header className="sticky top-0 z-50 border-b bg-card/80 backdrop-blur-sm">
        <div className="container flex h-14 items-center justify-between">
          <Link to="/app-builder" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center">
              <Zap className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-foreground">Pulse AI Builder</span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const isActive = location.pathname === item.to;
              return (
                <Link key={item.to} to={item.to}>
                  <Button
                    variant={isActive ? 'secondary' : 'ghost'}
                    size="sm"
                    className="gap-2"
                  >
                    <item.icon className="w-4 h-4" />
                    {item.label}
                  </Button>
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground hidden sm:inline">
              {user?.email}
            </span>
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Mobile nav */}
      <div className="md:hidden border-b bg-card">
        <div className="flex overflow-x-auto px-4 py-2 gap-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.to;
            return (
              <Link key={item.to} to={item.to}>
                <Button variant={isActive ? 'secondary' : 'ghost'} size="sm" className="gap-1 whitespace-nowrap text-xs">
                  <item.icon className="w-3.5 h-3.5" />
                  {item.label}
                </Button>
              </Link>
            );
          })}
        </div>
      </div>

      <main className="container py-6">
        {children}
      </main>
    </div>
  );
}
