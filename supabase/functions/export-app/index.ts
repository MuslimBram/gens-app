import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Simple ZIP creation (no external deps)
function createZip(files: { path: string; content: string }[]): Uint8Array {
  const encoder = new TextEncoder();
  const centralDirEntries: Uint8Array[] = [];
  const localEntries: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const pathBytes = encoder.encode(file.path);
    const contentBytes = encoder.encode(file.content);

    // Local file header
    const localHeader = new Uint8Array(30 + pathBytes.length);
    const view = new DataView(localHeader.buffer);
    view.setUint32(0, 0x04034b50, true); // signature
    view.setUint16(4, 20, true); // version
    view.setUint16(6, 0, true); // flags
    view.setUint16(8, 0, true); // compression (store)
    view.setUint16(10, 0, true); // mod time
    view.setUint16(12, 0, true); // mod date
    view.setUint32(14, 0, true); // crc32 (skip for simplicity)
    view.setUint32(18, contentBytes.length, true); // compressed size
    view.setUint32(22, contentBytes.length, true); // uncompressed size
    view.setUint16(26, pathBytes.length, true); // filename length
    view.setUint16(28, 0, true); // extra field length
    localHeader.set(pathBytes, 30);

    localEntries.push(localHeader);
    localEntries.push(contentBytes);

    // Central directory entry
    const centralEntry = new Uint8Array(46 + pathBytes.length);
    const cView = new DataView(centralEntry.buffer);
    cView.setUint32(0, 0x02014b50, true);
    cView.setUint16(4, 20, true);
    cView.setUint16(6, 20, true);
    cView.setUint16(8, 0, true);
    cView.setUint16(10, 0, true);
    cView.setUint16(12, 0, true);
    cView.setUint16(14, 0, true);
    cView.setUint32(16, 0, true);
    cView.setUint32(20, contentBytes.length, true);
    cView.setUint32(24, contentBytes.length, true);
    cView.setUint16(28, pathBytes.length, true);
    cView.setUint16(30, 0, true);
    cView.setUint16(32, 0, true);
    cView.setUint16(34, 0, true);
    cView.setUint16(36, 0, true);
    cView.setUint32(38, 0, true);
    cView.setUint32(42, offset, true);
    centralEntry.set(pathBytes, 46);
    centralDirEntries.push(centralEntry);

    offset += localHeader.length + contentBytes.length;
  }

  const centralDirOffset = offset;
  let centralDirSize = 0;
  for (const entry of centralDirEntries) centralDirSize += entry.length;

  // End of central directory
  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralDirSize, true);
  endView.setUint32(16, centralDirOffset, true);
  endView.setUint16(20, 0, true);

  // Combine all
  const totalSize = offset + centralDirSize + 22;
  const result = new Uint8Array(totalSize);
  let pos = 0;
  for (const entry of localEntries) { result.set(entry, pos); pos += entry.length; }
  for (const entry of centralDirEntries) { result.set(entry, pos); pos += entry.length; }
  result.set(endRecord, pos);

  return result;
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

    const { projectId, exportType } = await req.json();

    // Get project files
    const { data: files, error: filesError } = await supabase.from("app_files")
      .select("path, content").eq("project_id", projectId);
    if (filesError) throw filesError;
    if (!files?.length) throw new Error("No files to export");

    if (exportType === "zip") {
      const zipBytes = createZip(files);
      const zipBase64 = base64Encode(zipBytes);

      // Record export
      await supabase.from("app_exports").insert({
        project_id: projectId, export_type: "zip",
      });
      await supabase.from("usage_tracking").insert({
        user_id: user.id, action_type: "export", project_id: projectId,
      });

      return new Response(JSON.stringify({ zipBase64 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (exportType === "desktop_mac" || exportType === "desktop_windows") {
      // Add Electron wrapper files
      const electronFiles = [...files];
      electronFiles.push({
        path: "electron/main.cjs",
        content: `const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200, height: 800,
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  });
  mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });`,
      });
      electronFiles.push({
        path: "BUILD_INSTRUCTIONS.md",
        content: `# Desktop App Build Instructions\n\n## Prerequisites\n- Node.js 18+\n- npm\n\n## Steps\n1. \`npm install\`\n2. \`npm install --save-dev electron @electron/packager\`\n3. \`npx vite build\`\n4. For ${exportType === "desktop_mac" ? "macOS" : "Windows"}: \`npx @electron/packager . "MyApp" --platform=${exportType === "desktop_mac" ? "darwin" : "win32"} --arch=x64 --out=release --overwrite\``,
      });

      const zipBytes = createZip(electronFiles);
      const zipBase64 = base64Encode(zipBytes);

      await supabase.from("app_exports").insert({
        project_id: projectId, export_type: exportType as any,
      });
      await supabase.from("usage_tracking").insert({
        user_id: user.id, action_type: "export", project_id: projectId,
        metadata: { type: exportType },
      });

      return new Response(JSON.stringify({ zipBase64 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (exportType === "mobile_android" || exportType === "mobile_ios") {
      const platform = exportType === "mobile_android" ? "android" : "ios";
      const mobileFiles = [...files];
      mobileFiles.push({
        path: "capacitor.config.ts",
        content: `import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: 'com.pulseai.generated',
  appName: 'Generated App',
  webDir: 'dist',
};
export default config;`,
      });
      mobileFiles.push({
        path: "BUILD_INSTRUCTIONS.md",
        content: `# Mobile App Build Instructions (${platform})\n\n## Prerequisites\n- Node.js 18+\n- ${platform === "android" ? "Android Studio" : "Xcode (macOS only)"}\n\n## Steps\n1. \`npm install\`\n2. \`npm install @capacitor/core @capacitor/cli @capacitor/${platform}\`\n3. \`npx cap init\`\n4. \`npm run build\`\n5. \`npx cap add ${platform}\`\n6. \`npx cap sync\`\n7. \`npx cap run ${platform}\``,
      });

      const zipBytes = createZip(mobileFiles);
      const zipBase64 = base64Encode(zipBytes);

      await supabase.from("app_exports").insert({
        project_id: projectId, export_type: exportType as any,
      });
      await supabase.from("usage_tracking").insert({
        user_id: user.id, action_type: "export", project_id: projectId,
        metadata: { type: exportType },
      });

      return new Response(JSON.stringify({ zipBase64 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (exportType === "pwa") {
      const pwaFiles = [...files];
      pwaFiles.push({
        path: "public/manifest.json",
        content: JSON.stringify({
          name: "Generated App", short_name: "App", start_url: "/",
          display: "standalone", background_color: "#ffffff", theme_color: "#3B82F6",
          icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" },
                  { src: "/icon-512.png", sizes: "512x512", type: "image/png" }],
        }, null, 2),
      });
      pwaFiles.push({
        path: "public/sw.js",
        content: `const CACHE = 'app-v1';
const URLS = ['/'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(URLS))));
self.addEventListener('fetch', e => e.respondWith(caches.match(e.request).then(r => r || fetch(e.request))));`,
      });

      const zipBytes = createZip(pwaFiles);
      const zipBase64 = base64Encode(zipBytes);

      await supabase.from("app_exports").insert({
        project_id: projectId, export_type: "pwa",
      });

      return new Response(JSON.stringify({ zipBase64 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("Unknown export type");
  } catch (e) {
    console.error("export-app error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
