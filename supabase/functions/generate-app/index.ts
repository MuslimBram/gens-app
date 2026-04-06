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

async function callAI(prompt: string, systemPrompt: string, model: string): Promise<string> {
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
  return data.choices?.[0]?.message?.content || "";
}

async function callAIJSON(prompt: string, systemPrompt: string, model: string): Promise<any> {
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
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (toolCall?.function?.arguments) {
    return JSON.parse(toolCall.function.arguments);
  }
  throw new Error("Failed to get structured output");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from token
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action } = body;

    // ACTION: CREATE SPEC
    if (action === "create_spec") {
      const { projectId, prompt, model, template, stack, appType, options } = body;

      // Create generation record
      const { data: gen, error: genErr } = await supabase.from("app_generations").insert({
        project_id: projectId,
        prompt,
        model_name: model,
        generation_mode: "initial",
        status: "creating_spec",
        current_stage: "creating_spec",
        progress: 10,
      }).select().single();
      if (genErr) throw genErr;

      // Update project status
      await supabase.from("app_projects").update({ status: "generating" }).eq("id", projectId);

      // Log
      await supabase.from("build_logs").insert({
        project_id: projectId, generation_id: gen.id,
        log_type: "spec", message: "Starting spec generation...", level: "info",
      });

      // Generate spec with AI
      const specPrompt = `Create a detailed project specification for: "${prompt}"
App Type: ${appType}, Template: ${template}, Stack: ${stack}
Options: ${JSON.stringify(options)}
Generate a comprehensive spec with pages, features, file tree, and dependencies.`;

      const spec = await callAIJSON(specPrompt, 
        "You are a senior software architect. Create detailed project specifications for web applications. Be specific about pages, routes, features, and file structure.", 
        model
      );

      // Update generation with spec
      await supabase.from("app_generations").update({
        spec_json: spec, status: "generating_files", current_stage: "generating_files", progress: 30,
      }).eq("id", gen.id);

      await supabase.from("build_logs").insert({
        project_id: projectId, generation_id: gen.id,
        log_type: "spec", message: `Spec generated: ${spec.pages?.length || 0} pages, ${spec.features?.length || 0} features`, level: "success",
      });

      // Track usage
      await supabase.from("usage_tracking").insert({
        user_id: user.id, action_type: "generation", project_id: projectId, model_used: model,
      });

      return new Response(JSON.stringify({ generationId: gen.id, spec }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ACTION: GENERATE FILES
    if (action === "generate_files") {
      const { projectId, generationId, spec, model, stack } = body;

      await supabase.from("build_logs").insert({
        project_id: projectId, generation_id: generationId,
        log_type: "generation", message: "Starting file generation...", level: "info",
      });

      const fileTree = spec.file_tree || [];
      const generatedFiles: { path: string; content: string }[] = [];

      // Generate files based on spec
      for (const filePath of fileTree) {
        const filePrompt = `Generate the complete code for file: ${filePath}
Project spec: ${JSON.stringify(spec)}
Stack: ${stack}
Generate production-ready code with proper imports, types, and structure. Return ONLY the file content, no markdown.`;

        try {
          const content = await callAI(filePrompt,
            "You are an expert developer. Generate clean, production-ready code for the specified file. Return only the code content without any markdown formatting or code blocks.",
            model
          );

          // Clean up any markdown code blocks
          const cleanContent = content.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim();

          generatedFiles.push({ path: filePath, content: cleanContent });

          await supabase.from("build_logs").insert({
            project_id: projectId, generation_id: generationId,
            log_type: "generation", message: `Generated: ${filePath}`, level: "info",
          });
        } catch (err) {
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

      // Update generation
      await supabase.from("app_generations").update({
        status: "reviewing", current_stage: "reviewing", progress: 70,
      }).eq("id", generationId);

      await supabase.from("build_logs").insert({
        project_id: projectId, generation_id: generationId,
        log_type: "generation", message: `Generated ${generatedFiles.length} files`, level: "success",
      });

      return new Response(JSON.stringify({ files: generatedFiles.length, revisionId: revision?.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ACTION: REVIEW FILES
    if (action === "review_files") {
      const { projectId, generationId } = body;

      const { data: files } = await supabase.from("app_files")
        .select("path, content").eq("project_id", projectId).eq("generation_id", generationId);

      if (!files?.length) throw new Error("No files to review");

      const fileList = files.map(f => `${f.path}: ${f.content.substring(0, 200)}...`).join("\n");
      const reviewPrompt = `Review these project files for issues:\n${fileList}\n\nCheck for: missing imports, broken references, env vars, syntax issues, missing dependencies.`;

      const reviewResult = await callAI(reviewPrompt,
        "You are a code reviewer. Check for missing imports, broken file references, syntax issues, and missing dependencies. Be specific about each issue found.",
        "auto"
      );

      await supabase.from("build_logs").insert({
        project_id: projectId, generation_id: generationId,
        log_type: "review", message: `Code review: ${reviewResult.substring(0, 500)}`, level: "info",
      });

      await supabase.from("app_generations").update({
        status: "validating", current_stage: "validating", progress: 85,
      }).eq("id", generationId);

      return new Response(JSON.stringify({ review: reviewResult }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ACTION: VALIDATE PROJECT
    if (action === "validate_project") {
      const { projectId, generationId } = body;

      const { data: files } = await supabase.from("app_files")
        .select("path, content").eq("project_id", projectId);

      const issues: string[] = [];

      // Check for package.json
      const pkgJson = files?.find(f => f.path === "package.json");
      if (!pkgJson) issues.push("Missing package.json");

      // Check for README
      const readme = files?.find(f => f.path === "README.md");
      if (!readme) issues.push("Missing README.md");

      // Check for imports matching file structure
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

      // Update statuses
      await supabase.from("app_generations").update({
        status: "completed", build_status: buildStatus,
        current_stage: "completed", progress: 100,
      }).eq("id", generationId);

      await supabase.from("app_projects").update({
        status: "preview_ready",
      }).eq("id", projectId);

      return new Response(JSON.stringify({ buildStatus, issues }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ACTION: FOLLOW-UP EDIT
    if (action === "follow_up_edit") {
      const { projectId, generationId, prompt, model } = body;

      // Get existing files
      const { data: existingFiles } = await supabase.from("app_files")
        .select("path, content").eq("project_id", projectId);

      const fileList = existingFiles?.map(f => `${f.path}:\n${f.content}`).join("\n---\n") || "";

      // Create new generation
      const { data: newGen } = await supabase.from("app_generations").insert({
        project_id: projectId, prompt, model_name: model,
        generation_mode: "follow_up", status: "generating_files",
        current_stage: "generating_files", progress: 20,
      }).select().single();

      await supabase.from("app_projects").update({ status: "generating" }).eq("id", projectId);

      // Ask AI to determine which files to modify
      const editPrompt = `Current project files:\n${fileList}\n\nUser request: "${prompt}"\n\nDetermine which files need to be modified or created. For each file, provide the complete updated content. Return a JSON array of objects with "path" and "content" fields.`;

      const editResult = await callAI(editPrompt,
        "You are an expert developer. Given existing project files and an edit request, determine which files need changes. Return ONLY a JSON array of {\"path\": \"...\", \"content\": \"...\"} objects. No markdown, no explanation.",
        model
      );

      let modifiedFiles: { path: string; content: string }[] = [];
      try {
        const cleaned = editResult.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim();
        modifiedFiles = JSON.parse(cleaned);
      } catch {
        modifiedFiles = [{ path: "EDIT_LOG.md", content: editResult }];
      }

      // Get revision count
      const { count } = await supabase.from("app_revisions")
        .select("*", { count: "exact", head: true }).eq("project_id", projectId);

      const { data: revision } = await supabase.from("app_revisions").insert({
        project_id: projectId, generation_id: newGen?.id,
        revision_number: (count || 0) + 1, change_summary: prompt,
        created_by: user.id,
      }).select().single();

      // Update or insert files
      for (const file of modifiedFiles) {
        const existing = existingFiles?.find(f => f.path === file.path);
        if (existing) {
          await supabase.from("app_files").update({
            content: file.content, revision_id: revision?.id,
            generation_id: newGen?.id,
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
        status: "completed", current_stage: "completed", progress: 100,
      }).eq("id", newGen?.id);

      await supabase.from("app_projects").update({ status: "preview_ready" }).eq("id", projectId);

      await supabase.from("usage_tracking").insert({
        user_id: user.id, action_type: "follow_up_edit", project_id: projectId, model_used: model,
      });

      await supabase.from("build_logs").insert({
        project_id: projectId, generation_id: newGen?.id,
        log_type: "edit", message: `Follow-up edit: modified ${modifiedFiles.length} file(s)`, level: "success",
      });

      return new Response(JSON.stringify({ files: modifiedFiles.length, revisionId: revision?.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
