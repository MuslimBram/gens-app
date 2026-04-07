import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// In-memory token cache (per isolate, short-lived)
const tokenCache = new Map<string, string>();

const rateLimits = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 30;
const RATE_WINDOW = 60_000;

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

async function getGitHubToken(supabase: any, userId: string): Promise<string> {
  // Check in-memory cache first
  const cached = tokenCache.get(userId);
  if (cached) return cached;

  const { data: conn } = await supabase.from("github_connections")
    .select("*").eq("user_id", userId).eq("provider", "github").maybeSingle();
  if (!conn?.encrypted_token_reference) throw new Error("No GitHub connection found. Please connect GitHub first.");

  // The token reference IS the token (stored securely in DB with RLS)
  // In production you'd use Vault. Here we use the reference directly.
  const token = conn.encrypted_token_reference;
  tokenCache.set(userId, token);
  return token;
}

async function githubAPI(path: string, token: string, options: RequestInit = {}): Promise<any> {
  const res = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = `GitHub API error ${res.status}`;
    try { msg = JSON.parse(text).message || msg; } catch {}
    throw new Error(msg);
  }
  return text ? JSON.parse(text) : null;
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

    // ─── GET AUTH URL ───
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

    // ─── EXCHANGE CODE ───
    if (action === "exchange_code") {
      if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
        return new Response(JSON.stringify({ error: "GitHub integration not configured" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { code } = body;
      if (!code) throw new Error("Missing code parameter");

      const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ client_id: GITHUB_CLIENT_ID, client_secret: GITHUB_CLIENT_SECRET, code }),
      });
      const tokenData = await tokenRes.json();
      if (tokenData.error) throw new Error(tokenData.error_description || tokenData.error);

      const accessToken = tokenData.access_token;

      // Get GitHub user info
      const ghUser = await githubAPI("/user", accessToken);

      // Store real access token as the reference (RLS protects it)
      const { data: existing } = await supabase.from("github_connections")
        .select("id").eq("user_id", user.id).eq("provider", "github").maybeSingle();

      if (existing) {
        await supabase.from("github_connections").update({
          account_name: ghUser.login,
          encrypted_token_reference: accessToken,
        }).eq("id", existing.id);
      } else {
        await supabase.from("github_connections").insert({
          user_id: user.id, provider: "github",
          account_name: ghUser.login,
          encrypted_token_reference: accessToken,
        });
      }

      // Cache token
      tokenCache.set(user.id, accessToken);

      return new Response(JSON.stringify({ success: true, accountName: ghUser.login }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── CREATE REPO (REAL) ───
    if (action === "create_repo") {
      const { projectId, repoName, isPrivate } = body;
      const ghToken = await getGitHubToken(supabase, user.id);

      // Create repo via GitHub API
      const repo = await githubAPI("/user/repos", ghToken, {
        method: "POST",
        body: JSON.stringify({
          name: repoName,
          private: isPrivate ?? true,
          auto_init: true,
          description: "Generated by Pulse AI App Builder",
        }),
      });

      // Update project with repo URL
      await supabase.from("app_projects").update({
        github_connected: true,
        github_repo_url: repo.html_url,
      }).eq("id", projectId);

      // Log
      await supabase.from("build_logs").insert({
        project_id: projectId,
        log_type: "github",
        message: `Created GitHub repo: ${repo.full_name} (${isPrivate ? 'private' : 'public'})`,
        level: "success",
      });

      await supabase.from("usage_tracking").insert({
        user_id: user.id, action_type: "github_create_repo", project_id: projectId,
      });

      return new Response(JSON.stringify({
        success: true, repoUrl: repo.html_url, repoFullName: repo.full_name,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── PUSH FILES (REAL) ───
    if (action === "push_files") {
      const { projectId, branch = "main" } = body;
      const ghToken = await getGitHubToken(supabase, user.id);

      // Get project
      const { data: project } = await supabase.from("app_projects")
        .select("*").eq("id", projectId).single();
      if (!project) throw new Error("Project not found");
      if (!project.github_repo_url) throw new Error("No GitHub repo linked to this project");

      // Extract owner/repo from URL
      const repoMatch = project.github_repo_url.match(/github\.com\/([^/]+)\/([^/]+)/);
      if (!repoMatch) throw new Error("Invalid GitHub repo URL");
      const [, owner, repo] = repoMatch;

      // Get project files
      const { data: files } = await supabase.from("app_files")
        .select("path, content").eq("project_id", projectId);
      if (!files?.length) throw new Error("No files to push");

      // Get current default branch SHA
      let baseSha: string;
      try {
        const ref = await githubAPI(`/repos/${owner}/${repo}/git/ref/heads/${branch}`, ghToken);
        baseSha = ref.object.sha;
      } catch {
        // Branch doesn't exist, get default branch
        const repoInfo = await githubAPI(`/repos/${owner}/${repo}`, ghToken);
        const defaultBranch = repoInfo.default_branch || "main";
        const ref = await githubAPI(`/repos/${owner}/${repo}/git/ref/heads/${defaultBranch}`, ghToken);
        baseSha = ref.object.sha;

        // Create branch if different from default
        if (branch !== defaultBranch) {
          await githubAPI(`/repos/${owner}/${repo}/git/refs`, ghToken, {
            method: "POST",
            body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseSha }),
          });
        }
      }

      // Create blobs for each file
      const treeItems: any[] = [];
      for (const file of files) {
        const blob = await githubAPI(`/repos/${owner}/${repo}/git/blobs`, ghToken, {
          method: "POST",
          body: JSON.stringify({ content: file.content, encoding: "utf-8" }),
        });
        treeItems.push({
          path: file.path,
          mode: "100644",
          type: "blob",
          sha: blob.sha,
        });
      }

      // Create tree
      const tree = await githubAPI(`/repos/${owner}/${repo}/git/trees`, ghToken, {
        method: "POST",
        body: JSON.stringify({ base_tree: baseSha, tree: treeItems }),
      });

      // Create commit
      const commit = await githubAPI(`/repos/${owner}/${repo}/git/commits`, ghToken, {
        method: "POST",
        body: JSON.stringify({
          message: `Update from Pulse AI App Builder (${files.length} files)`,
          tree: tree.sha,
          parents: [baseSha],
        }),
      });

      // Update branch ref
      await githubAPI(`/repos/${owner}/${repo}/git/refs/heads/${branch}`, ghToken, {
        method: "PATCH",
        body: JSON.stringify({ sha: commit.sha }),
      });

      // Log and track
      await supabase.from("build_logs").insert({
        project_id: projectId, log_type: "github",
        message: `Pushed ${files.length} files to ${owner}/${repo}@${branch} (commit: ${commit.sha.substring(0, 7)})`,
        level: "success",
      });

      await supabase.from("usage_tracking").insert({
        user_id: user.id, action_type: "github_push", project_id: projectId,
        metadata: { repo: `${owner}/${repo}`, branch, commitSha: commit.sha },
      });

      return new Response(JSON.stringify({
        success: true, filesCount: files.length, repo: `${owner}/${repo}`,
        branch, commitSha: commit.sha,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── CREATE BRANCH ───
    if (action === "create_branch") {
      const { projectId, branchName } = body;
      const ghToken = await getGitHubToken(supabase, user.id);

      const { data: project } = await supabase.from("app_projects")
        .select("github_repo_url").eq("id", projectId).single();
      if (!project?.github_repo_url) throw new Error("No GitHub repo linked");

      const repoMatch = project.github_repo_url.match(/github\.com\/([^/]+)\/([^/]+)/);
      if (!repoMatch) throw new Error("Invalid repo URL");
      const [, owner, repo] = repoMatch;

      // Get default branch SHA
      const repoInfo = await githubAPI(`/repos/${owner}/${repo}`, ghToken);
      const ref = await githubAPI(`/repos/${owner}/${repo}/git/ref/heads/${repoInfo.default_branch}`, ghToken);

      // Create new branch
      await githubAPI(`/repos/${owner}/${repo}/git/refs`, ghToken, {
        method: "POST",
        body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: ref.object.sha }),
      });

      await supabase.from("build_logs").insert({
        project_id: projectId, log_type: "github",
        message: `Created branch: ${branchName}`, level: "success",
      });

      return new Response(JSON.stringify({ success: true, branch: branchName }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── DISCONNECT ───
    if (action === "disconnect") {
      tokenCache.delete(user.id);
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
