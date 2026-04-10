import { useMemo } from 'react';
import {
  SandpackProvider,
  SandpackLayout,
  SandpackCodeEditor,
  SandpackPreview as SandpackPreviewPanel,
  SandpackFileExplorer,
} from '@codesandbox/sandpack-react';

interface ProjectFile {
  path: string;
  content: string;
}

interface SandpackPreviewProps {
  files: ProjectFile[];
  stackKey?: string | null;
}

export function SandpackPreview({ files, stackKey }: SandpackPreviewProps) {
  const sandpackFiles = useMemo(() => {
    const result: Record<string, string> = {};

    for (const file of files) {
      // Sandpack expects paths starting with /
      const path = file.path.startsWith('/') ? file.path : `/${file.path}`;
      result[path] = file.content;
    }

    // Ensure there's an entry point
    if (!result['/App.tsx'] && !result['/App.jsx'] && !result['/App.js']) {
      // Try to find an App file in src/
      const appFile = files.find(f =>
        f.path.match(/^(src\/)?App\.(tsx|jsx|js)$/)
      );
      if (appFile) {
        const appPath = appFile.path.startsWith('/') ? appFile.path : `/${appFile.path}`;
        // Already included above
      }
    }

    // Ensure index file exists
    if (!result['/index.tsx'] && !result['/index.jsx'] && !result['/index.js'] && !result['/src/main.tsx'] && !result['/src/main.jsx']) {
      // Create a minimal entry point that imports App
      const appPath = result['/src/App.tsx'] ? './App' :
                      result['/App.tsx'] ? './App' :
                      result['/src/App.jsx'] ? './App' :
                      result['/App.jsx'] ? './App' : null;

      if (appPath) {
        const ext = result['/src/App.tsx'] || result['/App.tsx'] ? 'tsx' : 'jsx';
        result['/index.' + ext] = `import React from "react";
import { createRoot } from "react-dom/client";
import App from "${appPath}";

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
`;
      }
    }

    return result;
  }, [files]);

  const hasReactFiles = files.some(f => f.path.match(/\.(tsx|jsx)$/));

  if (!hasReactFiles) {
    return null;
  }

  // Determine template based on stack
  const isTypeScript = files.some(f => f.path.endsWith('.tsx') || f.path.endsWith('.ts'));
  const template = isTypeScript ? 'react-ts' as const : 'react' as const;

  // Extract dependencies from package.json if present
  const pkgFile = files.find(f => f.path === 'package.json' || f.path === '/package.json');
  let customDeps: Record<string, string> | undefined;
  if (pkgFile) {
    try {
      const pkg = JSON.parse(pkgFile.content);
      customDeps = { ...pkg.dependencies };
      // Remove react/react-dom as they come with template
      delete customDeps?.['react'];
      delete customDeps?.['react-dom'];
    } catch {}
  }

  return (
    <SandpackProvider
      template={template}
      files={sandpackFiles}
      customSetup={customDeps ? { dependencies: customDeps } : undefined}
      theme="dark"
      options={{
        externalResources: ['https://cdn.tailwindcss.com'],
      }}
    >
      <SandpackLayout style={{ height: '600px', borderRadius: '8px' }}>
        <SandpackFileExplorer style={{ height: '600px' }} />
        <SandpackCodeEditor style={{ height: '600px' }} showLineNumbers showTabs />
        <SandpackPreviewPanel style={{ height: '600px' }} showNavigator showRefreshButton />
      </SandpackLayout>
    </SandpackProvider>
  );
}
