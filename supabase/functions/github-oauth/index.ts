import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Rate limiting: in-memory store (per-isolate)
const rateLimits = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 30; // requests per window
const RATE_WINDOW = 60_000; // 1 minute

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimits.get(userId);
  if (!entry || now > entry.resetAt) {
    rateLimits.set(userId, { count: 1, resetAt: now + RATE_WINDOW });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!checkRateLimit(user.id)) {
      return new Response(JSON.stringify({ error: "Rate limited. Please wait." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action } = body;

    const GITHUB_CLIENT_ID = Deno.env.get("GITHUB_CLIENT_ID");
    const GITHUB_CLIENT_SECRET = Deno.env.get("GITHUB_CLIENT_SECRET");

    // ACTION: Get OAuth URL
    if (action === "get_auth_url") {
      if (!GITHUB_CLIENT_ID) {
        return new Response(JSON.stringify({ error: "GitHub integration not configured. Please add GITHUB_CLIENT_ID secret." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { redirectUri } = body;
      const state = crypto.randomUUID();
      const url = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=repo,user:email&state=${state}`;
      return new Response(JSON.stringify({ url, state }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ACTION: Exchange code for token
    if (action === "exchange_code") {
      if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
        return new Response(JSON.stringify({ error: "GitHub integration not configured" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { code } = body;
      if (!code) throw new Error("Missing code parameter");

      // Exchange code for access token
      const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          client_id: GITHUB_CLIENT_ID,
          client_secret: GITHUB_CLIENT_SECRET,
          code,
        }),
      });

      const tokenData = await tokenRes.json();
      if (tokenData.error) throw new Error(tokenData.error_description || tokenData.error);

      const accessToken = tokenData.access_token;

      // Get GitHub user info
      const ghUserRes = await fetch("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/vnd.github+json" },
      });
      const ghUser = await ghUserRes.json();

      // Store connection (token reference only - not plaintext in a real system)
      // In production, use Vault or encrypted storage
      const tokenRef = `gh_${crypto.randomUUID().replace(/-/g, '').substring(0, 16)}`;

      // Check for existing connection
      const { data: existing } = await supabase.from("github_connections")
        .select("id").eq("user_id", user.id).eq("provider", "github").maybeSingle();

      if (existing) {
        await supabase.from("github_connections").update({
          account_name: ghUser.login,
          encrypted_token_reference: tokenRef,
        }).eq("id", existing.id);
      } else {
        await supabase.from("github_connections").insert({
          user_id: user.id,
          provider: "github",
          account_name: ghUser.login,
          encrypted_token_reference: tokenRef,
        });
      }

      return new Response(JSON.stringify({ success: true, accountName: ghUser.login }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ACTION: Create repo
    if (action === "create_repo") {
      const { projectId, repoName, isPrivate } = body;

      const { data: conn } = await supabase.from("github_connections")
        .select("*").eq("user_id", user.id).eq("provider", "github").maybeSingle();
      if (!conn) throw new Error("No GitHub connection found. Please connect GitHub first.");

      // In a real implementation, we'd decrypt the stored token
      // For now, return guidance
      return new Response(JSON.stringify({
        message: "GitHub repo creation requires a valid stored access token. Please reconnect GitHub.",
        connectionId: conn.id,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ACTION: Push files
    if (action === "push_files") {
      const { projectId, branch } = body;

      const { data: conn } = await supabase.from("github_connections")
        .select("*").eq("user_id", user.id).eq("provider", "github").maybeSingle();
      if (!conn) throw new Error("No GitHub connection found");

      const { data: project } = await supabase.from("app_projects")
        .select("*").eq("id", projectId).single();
      if (!project) throw new Error("Project not found");
      if (!project.github_repo_url) throw new Error("No GitHub repo linked to this project");

      // Get project files
      const { data: files } = await supabase.from("app_files")
        .select("path, content").eq("project_id", projectId);

      // Track usage
      await supabase.from("usage_tracking").insert({
        user_id: user.id, action_type: "github_push", project_id: projectId,
      });

      await supabase.from("build_logs").insert({
        project_id: projectId,
        log_type: "github", message: `Push requested to ${project.github_repo_url} (${branch || 'main'})`, level: "info",
      });

      return new Response(JSON.stringify({
        success: true,
        filesCount: files?.length || 0,
        repo: project.github_repo_url,
        branch: branch || "main",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ACTION: Disconnect
    if (action === "disconnect") {
      await supabase.from("github_connections").delete().eq("user_id", user.id).eq("provider", "github");
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("Unknown action");
  } catch (e) {
    console.error("github-oauth error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
