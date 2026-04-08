import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MODEL_MAP: Record<string, string> = {
  'auto': 'google/gemini-3-flash-preview',
  'claude-opus-4.6': 'google/gemini-2.5-pro',
  'claude-sonnet-4.6': 'google/gemini-2.5-flash',
  'claude-sonnet-4.5': 'google/gemini-2.5-flash',
  'claude-sonnet-4': 'google/gemini-2.5-flash',
  'deepseek-v3.2': 'google/gemini-2.5-flash',
  'gemini-3.1-pro': 'google/gemini-3.1-pro-preview',
  'gemini-2.5-pro': 'google/gemini-2.5-pro',
  'gemini-3.0-flash': 'google/gemini-3-flash-preview',
  'gpt-5': 'openai/gpt-5',
  'qwen3-coder-plus': 'google/gemini-2.5-flash',
  'glm-4.7': 'google/gemini-2.5-flash',
  'glm-5': 'google/gemini-2.5-flash',
};

function resolveModel(model: string): string {
  return MODEL_MAP[model] || 'google/gemini-3-flash-preview';
}

interface AIResponse {
  content: string;
  tokenUsage: number;
}

async function callAI(prompt: string, systemPrompt: string, model: string): Promise<AIResponse> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: resolveModel(model),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    if (response.status === 429) throw new Error("Rate limited. Please try again later.");
    if (response.status === 402) throw new Error("Credits exhausted. Please add funds.");
    throw new Error(`AI error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "";
  const tokenUsage = (data.usage?.prompt_tokens || 0) + (data.usage?.completion_tokens || 0);
  return { content, tokenUsage };
}

async function callAIJSON(prompt: string, systemPrompt: string, model: string): Promise<{ result: any; tokenUsage: number }> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: resolveModel(model),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      tools: [{
        type: "function",
        function: {
          name: "output_spec",
          description: "Output the project specification as structured JSON",
          parameters: {
            type: "object",
            properties: {
              app_name: { type: "string" },
              goal: { type: "string" },
              target_users: { type: "string" },
              pages: { type: "array", items: { type: "object", properties: { name: { type: "string" }, description: { type: "string" }, route: { type: "string" } }, required: ["name", "description", "route"] } },
              features: { type: "array", items: { type: "string" } },
              stack: { type: "string" },
              file_tree: { type: "array", items: { type: "string" } },
              dependencies: { type: "array", items: { type: "string" } },
              env_vars: { type: "array", items: { type: "string" } },
              integrations: { type: "array", items: { type: "string" } },
            },
            required: ["app_name", "goal", "pages", "features", "stack", "file_tree", "dependencies"],
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "output_spec" } },
    }),
  });

  if (!response.ok) {
    if (response.status === 429) throw new Error("Rate limited. Please try again later.");
    if (response.status === 402) throw new Error("Credits exhausted. Please add funds.");
    throw new Error(`AI error: ${response.status}`);
  }

  const data = await response.json();
  const tokenUsage = (data.usage?.prompt_tokens || 0) + (data.usage?.completion_tokens || 0);
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (toolCall?.function?.arguments) {
    return { result: JSON.parse(toolCall.function.arguments), tokenUsage };
  }
  throw new Error("Failed to get structured output");
}

// Retry wrapper with exponential backoff
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3, label = "operation"): Promise<T> {
  let lastError: Error = new Error("Unknown");
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      // Don't retry on non-transient errors
      if (lastError.message.includes("Credits exhausted") || lastError.message.includes("usage policy")) throw lastError;
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
        await new Promise(r => setTimeout(r, delay));
        console.log(`Retrying ${label} (attempt ${attempt + 2}/${maxRetries + 1})...`);
      }
    }
  }
  throw lastError;
}

// Rate limiting
const genRateLimits = new Map<string, { count: number; resetAt: number }>();
const GEN_RATE_LIMIT = 20;
const GEN_RATE_WINDOW = 60_000;

function checkGenRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = genRateLimits.get(userId);
  if (!entry || now > entry.resetAt) {
    genRateLimits.set(userId, { count: 1, resetAt: now + GEN_RATE_WINDOW });
    return true;
  }
  if (entry.count >= GEN_RATE_LIMIT) return false;
  entry.count++;
  return true;
}

// Helper to update generation with failure state
async function failGeneration(supabase: any, genId: string, projectId: string, stage: string, error: string) {
  await supabase.from("app_generations").update({
    status: "failed", current_stage: stage, error_message: error,
  }).eq("id", genId);
  await supabase.from("app_projects").update({ status: "failed" }).eq("id", projectId);
  await supabase.from("build_logs").insert({
    project_id: projectId, generation_id: genId,
    log_type: stage, message: `Failed: ${error}`, level: "error",
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!checkGenRateLimit(user.id)) {
      return new Response(JSON.stringify({ error: "Rate limited. Max 20 requests per minute." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action } = body;

    // Prompt moderation
    if (action === "create_spec" || action === "follow_up_edit") {
      const prompt = body.prompt || "";
      const blockedPatterns = [
        /\b(hack|exploit|malware|trojan|virus|keylog|phish|ransomware)\b/i,
        /\b(steal|scrape\s+personal|harvest\s+email|ddos|brute\s*force)\b/i,
        /\b(credit\s*card\s*skim|password\s*steal|identity\s*theft)\b/i,
        /\b(deepfake|revenge\s*porn|child\s*exploit)\b/i,
      ];
      for (const pattern of blockedPatterns) {
        if (pattern.test(prompt)) {
          return new Response(JSON.stringify({ error: "Your prompt violates our usage policy. Please rephrase." }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
      if (prompt.trim().length < 3) {
        return new Response(JSON.stringify({ error: "Prompt is too short (min 3 characters)." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Quota enforcement
    if (action === "create_spec" || action === "follow_up_edit" || action === "export") {
      const quotaType = action === "create_spec" ? "generation" : action === "follow_up_edit" ? "follow_up" : "export";
      const { data: allowed } = await supabase.rpc("check_and_increment_quota", {
        p_user_id: user.id, p_action_type: quotaType,
      });
      if (allowed === false) {
        return new Response(JSON.stringify({ error: `Quota exceeded for ${quotaType}. Upgrade your plan for more.` }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ─── CREATE SPEC ───
    if (action === "create_spec") {
      const { projectId, prompt, model, template, stack, appType, options } = body;

      const { data: gen, error: genErr } = await supabase.from("app_generations").insert({
        project_id: projectId, prompt, model_name: model,
        generation_mode: "initial", status: "creating_spec",
        current_stage: "creating_spec", progress: 10,
      }).select().single();
      if (genErr) throw genErr;

      await supabase.from("app_projects").update({ status: "generating" }).eq("id", projectId);

      await supabase.from("build_logs").insert({
        project_id: projectId, generation_id: gen.id,
        log_type: "spec", message: "Starting spec generation...", level: "info",
      });

      // Build enhanced prompt with Pulse AI integration
      const integrationHints: string[] = [];
      if (options?.addSupabase) integrationHints.push("Include Supabase integration with client setup and environment variables.");
      if (options?.addAuth) integrationHints.push("Include authentication (login, signup, protected routes).");
      if (options?.addAdmin) integrationHints.push("Include admin panel with role-based access.");
      if (options?.addPayments) integrationHints.push("Include payment integration placeholder (Stripe-ready).");
      if (options?.addPulseAI) integrationHints.push("Include Pulse AI integration: lead capture forms, CRM-ready contact forms, campaign landing page sections, analytics tracking hooks.");

      const specPrompt = `Create a detailed project specification for: "${prompt}"
App Type: ${appType}, Template: ${template}, Stack: ${stack}
Options: ${JSON.stringify(options)}
${integrationHints.length ? "Integration requirements:\n" + integrationHints.join("\n") : ""}
Generate a comprehensive spec with pages, features, file tree, and dependencies.`;

      try {
        const { result: spec, tokenUsage } = await withRetry(
          () => callAIJSON(specPrompt,
            "You are a senior software architect. Create detailed project specifications for web applications. Be specific about pages, routes, features, and file structure. Include realistic file paths and proper dependency lists.",
            model),
          2, "spec_generation"
        );

        await supabase.from("app_generations").update({
          spec_json: spec, status: "generating_files", current_stage: "generating_files",
          progress: 30, token_usage: tokenUsage,
        }).eq("id", gen.id);

        await supabase.from("build_logs").insert({
          project_id: projectId, generation_id: gen.id,
          log_type: "spec",
          message: `Spec generated: ${spec.pages?.length || 0} pages, ${spec.features?.length || 0} features (${tokenUsage} tokens)`,
          level: "success",
        });

        await supabase.from("usage_tracking").insert({
          user_id: user.id, action_type: "generation", project_id: projectId,
          model_used: model, token_usage: tokenUsage,
        });

        return new Response(JSON.stringify({ generationId: gen.id, spec }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (e) {
        await failGeneration(supabase, gen.id, projectId, "creating_spec", e instanceof Error ? e.message : "Unknown error");
        throw e;
      }
    }

    // ─── GENERATE FILES ───
    if (action === "generate_files") {
      const { projectId, generationId, spec, model, stack } = body;

      await supabase.from("build_logs").insert({
        project_id: projectId, generation_id: generationId,
        log_type: "generation", message: "Starting file generation...", level: "info",
      });

      const fileTree = spec.file_tree || [];
      const generatedFiles: { path: string; content: string }[] = [];
      let totalTokens = 0;
      const failedFiles: string[] = [];

      for (let i = 0; i < fileTree.length; i++) {
        const filePath = fileTree[i];
        const progress = 30 + Math.round((i / fileTree.length) * 40);

        await supabase.from("app_generations").update({
          progress, current_stage: `generating: ${filePath}`,
        }).eq("id", generationId);

        const filePrompt = `Generate the complete code for file: ${filePath}
Project spec: ${JSON.stringify(spec)}
Stack: ${stack}
Already generated files: ${generatedFiles.map(f => f.path).join(", ")}
Generate production-ready code with proper imports, types, and structure. Return ONLY the file content, no markdown.`;

        try {
          const { content, tokenUsage } = await withRetry(
            () => callAI(filePrompt,
              "You are an expert developer. Generate clean, production-ready code for the specified file. Return only the code content without any markdown formatting or code blocks. Ensure imports reference other files in the project correctly.",
              model),
            2, `file:${filePath}`
          );

          totalTokens += tokenUsage;
          const cleanContent = content.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim();
          generatedFiles.push({ path: filePath, content: cleanContent });

          await supabase.from("build_logs").insert({
            project_id: projectId, generation_id: generationId,
            log_type: "generation", message: `Generated: ${filePath} (${tokenUsage} tokens)`, level: "info",
          });
        } catch (err: any) {
          failedFiles.push(filePath);
          await supabase.from("build_logs").insert({
            project_id: projectId, generation_id: generationId,
            log_type: "generation", message: `Failed to generate: ${filePath} - ${err.message}`, level: "error",
          });
        }
      }

      // Always generate README and env.example
      const readmeContent = `# ${spec.app_name || "Generated App"}\n\n${spec.goal || ""}\n\n## Setup\n\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\`\n\n## Stack\n${stack}\n\n## Features\n${(spec.features || []).map((f: string) => `- ${f}`).join("\n")}`;
      generatedFiles.push({ path: "README.md", content: readmeContent });

      if (spec.env_vars?.length) {
        generatedFiles.push({ path: ".env.example", content: spec.env_vars.map((v: string) => `${v}=`).join("\n") });
      }

      // Create revision
      const { data: revision } = await supabase.from("app_revisions").insert({
        project_id: projectId, generation_id: generationId,
        revision_number: 1, change_summary: "Initial generation",
        created_by: user.id,
      }).select().single();

      // Save files to DB
      for (const file of generatedFiles) {
        await supabase.from("app_files").insert({
          project_id: projectId, generation_id: generationId,
          revision_id: revision?.id, path: file.path, content: file.content,
          file_type: file.path.split('.').pop() || 'txt',
        });
      }

      // Update generation with token usage
      const status = failedFiles.length === 0 ? "reviewing" :
                     failedFiles.length < fileTree.length ? "reviewing" : "failed";
      
      await supabase.from("app_generations").update({
        status, current_stage: status === "failed" ? "failed" : "reviewing",
        progress: status === "failed" ? 0 : 70,
        token_usage: totalTokens,
        error_message: failedFiles.length ? `Failed files: ${failedFiles.join(", ")}` : null,
      }).eq("id", generationId);

      await supabase.from("build_logs").insert({
        project_id: projectId, generation_id: generationId,
        log_type: "generation",
        message: `Generated ${generatedFiles.length} files, ${failedFiles.length} failed (${totalTokens} total tokens)`,
        level: failedFiles.length ? "warning" : "success",
      });

      return new Response(JSON.stringify({
        files: generatedFiles.length, failedFiles, revisionId: revision?.id, totalTokens,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── REVIEW FILES ───
    if (action === "review_files") {
      const { projectId, generationId } = body;

      const { data: files } = await supabase.from("app_files")
        .select("path, content").eq("project_id", projectId).eq("generation_id", generationId);

      if (!files?.length) throw new Error("No files to review");

      const fileList = files.map(f => `${f.path}: ${f.content.substring(0, 200)}...`).join("\n");
      const reviewPrompt = `Review these project files for issues:\n${fileList}\n\nCheck for: missing imports, broken references, env vars, syntax issues, missing dependencies.`;

      const { content: reviewResult, tokenUsage } = await withRetry(
        () => callAI(reviewPrompt,
          "You are a code reviewer. Check for missing imports, broken file references, syntax issues, and missing dependencies. Be specific about each issue found.",
          "auto"),
        1, "review"
      );

      await supabase.from("build_logs").insert({
        project_id: projectId, generation_id: generationId,
        log_type: "review", message: `Code review (${tokenUsage} tokens): ${reviewResult.substring(0, 500)}`, level: "info",
      });

      await supabase.from("app_generations").update({
        status: "validating", current_stage: "validating", progress: 85,
        token_usage: (await supabase.from("app_generations").select("token_usage").eq("id", generationId).single()).data?.token_usage + tokenUsage,
      }).eq("id", generationId);

      return new Response(JSON.stringify({ review: reviewResult, tokenUsage }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── VALIDATE PROJECT ───
    if (action === "validate_project") {
      const { projectId, generationId } = body;

      const { data: files } = await supabase.from("app_files")
        .select("path, content").eq("project_id", projectId);

      const issues: string[] = [];

      const pkgJson = files?.find(f => f.path === "package.json");
      if (!pkgJson) issues.push("Missing package.json");

      const readme = files?.find(f => f.path === "README.md");
      if (!readme) issues.push("Missing README.md");

      // Check imports
      const filePaths = new Set(files?.map(f => f.path) || []);
      for (const file of files || []) {
        const imports = file.content.match(/from\s+['"]\.\/([^'"]+)['"]/g) || [];
        for (const imp of imports) {
          const match = imp.match(/from\s+['"]\.\/([^'"]+)['"]/);
          if (match) {
            const importPath = match[1];
            const possiblePaths = [importPath, `${importPath}.tsx`, `${importPath}.ts`, `${importPath}.js`, `${importPath}/index.tsx`];
            if (!possiblePaths.some(p => filePaths.has(p))) {
              issues.push(`Broken import in ${file.path}: ${importPath}`);
            }
          }
        }
      }

      const buildStatus = issues.length === 0 ? "passed" : "warnings";

      for (const issue of issues) {
        await supabase.from("build_logs").insert({
          project_id: projectId, generation_id: generationId,
          log_type: "validation", message: issue, level: "warning",
        });
      }

      await supabase.from("build_logs").insert({
        project_id: projectId, generation_id: generationId,
        log_type: "validation",
        message: issues.length === 0 ? "Validation passed - no issues found" : `Validation completed with ${issues.length} warning(s)`,
        level: issues.length === 0 ? "success" : "warning",
      });

      await supabase.from("app_generations").update({
        status: "completed", build_status: buildStatus,
        current_stage: "completed", progress: 100,
      }).eq("id", generationId);

      await supabase.from("app_projects").update({ status: "preview_ready" }).eq("id", projectId);

      return new Response(JSON.stringify({ buildStatus, issues }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── FOLLOW-UP EDIT ───
    if (action === "follow_up_edit") {
      const { projectId, generationId, prompt, model } = body;

      const { data: existingFiles } = await supabase.from("app_files")
        .select("path, content").eq("project_id", projectId);

      const fileList = existingFiles?.map(f => `${f.path}:\n${f.content}`).join("\n---\n") || "";

      const { data: newGen } = await supabase.from("app_generations").insert({
        project_id: projectId, prompt, model_name: model,
        generation_mode: "follow_up", status: "generating_files",
        current_stage: "generating_files", progress: 20,
      }).select().single();

      await supabase.from("app_projects").update({ status: "generating" }).eq("id", projectId);

      try {
        const editPrompt = `Current project files:\n${fileList}\n\nUser request: "${prompt}"\n\nDetermine which files need to be modified or created. For each file, provide the complete updated content. Return a JSON array of objects with "path" and "content" fields.`;

        const { content: editResult, tokenUsage } = await withRetry(
          () => callAI(editPrompt,
            "You are an expert developer. Given existing project files and an edit request, determine which files need changes. Return ONLY a JSON array of {\"path\": \"...\", \"content\": \"...\"} objects. No markdown, no explanation.",
            model),
          2, "follow_up_edit"
        );

        let modifiedFiles: { path: string; content: string }[] = [];
        try {
          const cleaned = editResult.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim();
          modifiedFiles = JSON.parse(cleaned);
        } catch {
          modifiedFiles = [{ path: "EDIT_LOG.md", content: editResult }];
        }

        const { count } = await supabase.from("app_revisions")
          .select("*", { count: "exact", head: true }).eq("project_id", projectId);

        const { data: revision } = await supabase.from("app_revisions").insert({
          project_id: projectId, generation_id: newGen?.id,
          revision_number: (count || 0) + 1, change_summary: prompt,
          created_by: user.id,
        }).select().single();

        for (const file of modifiedFiles) {
          const existing = existingFiles?.find(f => f.path === file.path);
          if (existing) {
            await supabase.from("app_files").update({
              content: file.content, revision_id: revision?.id, generation_id: newGen?.id,
            }).eq("project_id", projectId).eq("path", file.path);
          } else {
            await supabase.from("app_files").insert({
              project_id: projectId, generation_id: newGen?.id,
              revision_id: revision?.id, path: file.path, content: file.content,
              file_type: file.path.split('.').pop() || 'txt',
            });
          }
        }

        await supabase.from("app_generations").update({
          status: "completed", current_stage: "completed", progress: 100, token_usage: tokenUsage,
        }).eq("id", newGen?.id);

        await supabase.from("app_projects").update({ status: "preview_ready" }).eq("id", projectId);

        await supabase.from("usage_tracking").insert({
          user_id: user.id, action_type: "follow_up_edit", project_id: projectId,
          model_used: model, token_usage: tokenUsage,
        });

        await supabase.from("build_logs").insert({
          project_id: projectId, generation_id: newGen?.id,
          log_type: "edit",
          message: `Follow-up edit: modified ${modifiedFiles.length} file(s) (${tokenUsage} tokens)`,
          level: "success",
        });

        return new Response(JSON.stringify({ files: modifiedFiles.length, revisionId: revision?.id, tokenUsage }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (e) {
        if (newGen?.id) {
          await failGeneration(supabase, newGen.id, projectId, "follow_up_edit", e instanceof Error ? e.message : "Unknown");
        }
        throw e;
      }
    }

    // ─── RESUME GENERATION ───
    if (action === "resume_generation") {
      const { projectId, generationId } = body;

      const { data: gen } = await supabase.from("app_generations")
        .select("*").eq("id", generationId).single();
      if (!gen) throw new Error("Generation not found");
      if (gen.status !== "failed") throw new Error("Only failed generations can be resumed");

      await supabase.from("app_projects").update({ status: "generating" }).eq("id", projectId);
      await supabase.from("build_logs").insert({
        project_id: projectId, generation_id: generationId,
        log_type: "resume", message: `Resuming from stage: ${gen.current_stage}`, level: "info",
      });

      const failedStage = gen.current_stage || "creating_spec";

      try {
        if (failedStage === "creating_spec") {
          // Re-run spec generation
          await supabase.from("app_generations").update({
            status: "creating_spec", error_message: null, progress: 10,
          }).eq("id", generationId);

          const { result: spec, tokenUsage } = await withRetry(
            () => callAIJSON(gen.prompt,
              "You are a senior software architect. Create detailed project specifications for web applications. Be specific about pages, routes, features, and file structure.",
              gen.model_name),
            2, "resume_spec"
          );

          await supabase.from("app_generations").update({
            spec_json: spec, status: "generating_files", current_stage: "generating_files",
            progress: 30, token_usage: (gen.token_usage || 0) + tokenUsage, error_message: null,
          }).eq("id", generationId);

          await supabase.from("build_logs").insert({
            project_id: projectId, generation_id: generationId,
            log_type: "spec", message: `Spec regenerated (${tokenUsage} tokens)`, level: "success",
          });

          return new Response(JSON.stringify({ resumed: true, stage: "creating_spec", spec }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (failedStage === "generating_files" || failedStage.startsWith("generating:")) {
          // Re-run file generation from where it left off
          const spec = gen.spec_json as any;
          if (!spec?.file_tree) throw new Error("No spec found. Please regenerate from scratch.");

          await supabase.from("app_generations").update({
            status: "generating_files", error_message: null, progress: 30,
          }).eq("id", generationId);

          // Check which files already exist
          const { data: existingFiles } = await supabase.from("app_files")
            .select("path").eq("project_id", projectId).eq("generation_id", generationId);
          const existingPaths = new Set(existingFiles?.map(f => f.path) || []);

          const fileTree: string[] = spec.file_tree;
          const missingFiles = fileTree.filter(p => !existingPaths.has(p));
          let totalTokens = 0;

          for (let i = 0; i < missingFiles.length; i++) {
            const filePath = missingFiles[i];
            const progress = 30 + Math.round(((existingPaths.size + i) / fileTree.length) * 40);
            await supabase.from("app_generations").update({
              progress, current_stage: `generating: ${filePath}`,
            }).eq("id", generationId);

            const filePrompt = `Generate the complete code for file: ${filePath}\nProject spec: ${JSON.stringify(spec)}\nStack: ${spec.stack || "react-vite"}\nReturn ONLY the file content, no markdown.`;

            const { content, tokenUsage } = await withRetry(
              () => callAI(filePrompt,
                "You are an expert developer. Generate clean, production-ready code. Return only code without markdown formatting.",
                gen.model_name),
              2, `resume_file:${filePath}`
            );

            totalTokens += tokenUsage;
            const cleanContent = content.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim();

            await supabase.from("app_files").insert({
              project_id: projectId, generation_id: generationId,
              path: filePath, content: cleanContent,
              file_type: filePath.split('.').pop() || 'txt',
            });

            await supabase.from("build_logs").insert({
              project_id: projectId, generation_id: generationId,
              log_type: "generation", message: `Resumed: ${filePath} (${tokenUsage} tokens)`, level: "info",
            });
          }

          await supabase.from("app_generations").update({
            status: "reviewing", current_stage: "reviewing", progress: 70,
            token_usage: (gen.token_usage || 0) + totalTokens, error_message: null,
          }).eq("id", generationId);

          return new Response(JSON.stringify({ resumed: true, stage: "generating_files", resumedFiles: missingFiles.length, totalTokens }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // For review/validate stages, just reset and let client re-call
        await supabase.from("app_generations").update({
          status: failedStage as any, error_message: null,
          current_stage: failedStage,
        }).eq("id", generationId);

        return new Response(JSON.stringify({ resumed: true, stage: failedStage }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (e) {
        await failGeneration(supabase, generationId, projectId, `resume_${failedStage}`, e instanceof Error ? e.message : "Unknown");
        throw e;
      }
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-app error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
