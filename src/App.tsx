import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { AuthForm } from "@/components/AuthForm";
import { AppLayout } from "@/components/AppLayout";
import { MyAppsPage } from "@/components/MyAppsPage";
import { CreateAppForm } from "@/components/CreateAppForm";
import { AppDetailsPage } from "@/components/AppDetailsPage";
import { GitHubPage } from "@/components/GitHubPage";
import { UsagePage } from "@/components/UsagePage";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function AuthenticatedRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <AuthForm />;
  }

  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<MyAppsPage />} />
        <Route path="/create" element={<CreateAppForm />} />
        <Route path="/:id" element={<AppDetailsPage />} />
        <Route path="/github" element={<GitHubPage />} />
        <Route path="/usage" element={<UsagePage />} />
      </Routes>
    </AppLayout>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/app-builder/*" element={<AuthenticatedRoutes />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
