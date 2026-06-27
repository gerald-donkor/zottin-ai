// CodePanel.tsx
/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useRef, useState } from "react";
import {
  SandpackProvider,
  SandpackLayout,
  SandpackCodeEditor,
  SandpackPreview,
  SandpackFileExplorer,
  useSandpack,
  type SandpackPredefinedTemplate,
} from "@codesandbox/sandpack-react";
import { dracula } from "@codesandbox/sandpack-themes";
import {
  Eye,
  Code2,
  Download,
  AlertTriangle,
  Bot,
  Loader2,
  ArrowUp,
  Check,
} from "lucide-react";
import { RingLoader } from "react-spinners";
import JSZip from "jszip";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PricingModal } from "@/components/PricingModal";
import { VersionHistory } from "@/components/VersionHistory";
import { ResearchPanel } from "@/components/ResearchPanel";
import { saveWorkspaceFiles } from "@/actions/workspace";
import type { FileData, StatusStep } from "@/types/workspace";
import type { AppFramework } from "@/lib/frameworks";
import { getFrameworkLabel } from "@/lib/frameworks";

// ─── Placeholder ──────────────────────────────────────────────────────────────

const PLACEHOLDER_FILES = {
  "/App.js": {
    code: `export default function App() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "#0a0a0a",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "system-ui, sans-serif",
    }}>
      <div style={{ textAlign: "center", color: "rgba(255,255,255,0.3)" }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>⚡</div>
        <p style={{ fontSize: 14 }}>Your app will appear here</p>
      </div>
    </div>
  );
}`,
  },
};

// ─── Base dependencies ────────────────────────────────────────────────────────

const BASE_DEPENDENCIES: Record<string, string> = {
  "react-is": "latest",
  "react-router-dom": "latest",
  "lucide-react": "latest",
  recharts: "latest",
  "date-fns": "latest",
  "framer-motion": "latest",
  motion: "latest",
  gsap: "latest",
  "@gsap/react": "latest",
  "@base-ui/react": "latest",
  tailwindcss: "latest",
  "@tailwindcss/postcss": "latest",
  postcss: "latest",
  react: "latest",
  "react-dom": "latest",
  "react-hook-form": "latest",
  "@hookform/resolvers": "latest",
  zod: "latest",
  "@radix-ui/react-dialog": "latest",
  "@radix-ui/react-dropdown-menu": "latest",
  "@radix-ui/react-tabs": "latest",
  "@radix-ui/react-tooltip": "latest",
  "@radix-ui/react-accordion": "latest",
  "@radix-ui/react-select": "latest",
  axios: "latest",
  clsx: "latest",
  "class-variance-authority": "latest",
  "tailwind-merge": "latest",
};

const SANDPACK_TEMPLATES: Record<
  AppFramework,
  SandpackPredefinedTemplate
> = {
  react: "react",
  nextjs: "nextjs",
  expo: "static",
  vue: "vite-vue",
  svelte: "vite-svelte",
  vanilla: "vite",
};

function baseDependencies(framework: AppFramework): Record<string, string> {
  if (framework === "react" || framework === "nextjs") {
    return BASE_DEPENDENCIES;
  }
  if (
    framework === "vue" ||
    framework === "svelte" ||
    framework === "vanilla"
  ) {
    return { gsap: "latest" };
  }
  return {};
}

function frameworkDependencies(
  framework: AppFramework,
  dependencies: Record<string, string>
): Record<string, string> {
  const core: Record<AppFramework, Record<string, string>> = {
    react: {
      react: "latest",
      "react-dom": "latest",
      "react-scripts": "5.0.1",
    },
    nextjs: {
      next: "latest",
      react: "latest",
      "react-dom": "latest",
    },
    expo: {
      expo: "latest",
      react: "latest",
      "react-native": "latest",
    },
    vue: { vue: "latest", vite: "latest" },
    svelte: {
      svelte: "latest",
      vite: "latest",
      "@sveltejs/vite-plugin-svelte": "latest",
    },
    vanilla: { vite: "latest" },
  };
  return { ...core[framework], ...dependencies };
}

function frameworkScripts(framework: AppFramework): Record<string, string> {
  const scripts: Record<AppFramework, Record<string, string>> = {
    react: { start: "react-scripts start", build: "react-scripts build" },
    nextjs: { dev: "next dev", build: "next build", start: "next start" },
    expo: {
      start: "expo start",
      android: "expo start --android",
      ios: "expo start --ios",
      web: "expo start --web",
    },
    vue: { dev: "vite", build: "vite build", preview: "vite preview" },
    svelte: { dev: "vite", build: "vite build", preview: "vite preview" },
    vanilla: { dev: "vite", build: "vite build", preview: "vite preview" },
  };
  return scripts[framework];
}

// ─── Types ────────────────────────────────────────────────────────────────────

type ActiveTab = "preview" | "code";

interface CodePanelProps {
  fileData: FileData | null;
  isGenerating: boolean;
  statusLog: StatusStep[];
  onImprove: (userRequest: string) => Promise<void>;
  onFixError: (error: string) => Promise<void>;
  appTitle: string | null;
  isImproving: boolean;
  isProUser: boolean;
  workspaceId: string | null;
  currentVersionId: string | null;
  onVersionRestored: (fileData: FileData, versionId: string) => void;
  onManualSave: (fileData: FileData, versionId: string) => void;
}

// ─── SandpackInner ────────────────────────────────────────────────────────────
// Lives inside SandpackProvider so it can call useSandpack().
// Receives fileData as a prop and uses updateFile() to push code changes
// into the live Sandpack instance without remounting the provider.

function SandpackInner({
  isGenerating,
  statusLog,
  activeTab,
  setActiveTab,
  onImprove,
  onFixError,
  fileData,
  appTitle,
  isImproving,
  isProUser,
  workspaceId,
  currentVersionId,
  onVersionRestored,
  onManualSave,
}: {
  isGenerating: boolean;
  statusLog: StatusStep[];
  activeTab: ActiveTab;
  setActiveTab: (t: ActiveTab) => void;
  onImprove: (userRequest: string) => Promise<void>;
  onFixError: (error: string) => Promise<void>;
  fileData: FileData | null;
  appTitle: string | null;
  isImproving: boolean;
  isProUser: boolean;
  workspaceId: string | null;
  currentVersionId: string | null;
  onVersionRestored: (fileData: FileData, versionId: string) => void;
  onManualSave: (fileData: FileData, versionId: string) => void;
}) {
  const { sandpack, listen } = useSandpack();
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [improveInput, setImproveInput] = useState("");
  const [showImproveInput, setShowImproveInput] = useState(false);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Push file content updates into Sandpack without remounting.
  // This runs whenever fileData changes (e.g. after improve completes).
  // SandpackProvider key only changes when the file path set changes,
  // so this is the safe way to update existing file contents.
  const prevFilesRef = useRef<Record<string, { code: string }>>({});
  useEffect(() => {
    if (!fileData?.files) return;
    const prev = prevFilesRef.current;
    for (const [path, { code }] of Object.entries(fileData.files)) {
      if (prev[path]?.code !== code) {
        sandpack.updateFile(path, code);
      }
    }
    prevFilesRef.current = fileData.files;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileData?.files]);

  useEffect(() => {
    if (
      !workspaceId ||
      !fileData ||
      isGenerating ||
      isImproving ||
      sandpack.editorState !== "dirty"
    ) {
      return;
    }

    const editedFiles = Object.fromEntries(
      Object.keys(fileData.files).map((path) => [
        path,
        { code: sandpack.files[path]?.code ?? fileData.files[path].code },
      ])
    );
    const unchanged = Object.entries(editedFiles).every(
      ([path, file]) => file.code === fileData.files[path]?.code
    );
    if (unchanged) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSaveStatus("saving");
    saveTimerRef.current = setTimeout(async () => {
      const editedFileData: FileData = {
        ...fileData,
        files: editedFiles,
      };
      try {
        const version = await saveWorkspaceFiles(workspaceId, editedFileData);
        // Mark these files as synchronized before updating parent state. This
        // prevents a slower save response from overwriting newer editor text.
        prevFilesRef.current = editedFiles;
        onManualSave(editedFileData, version.id);
        setSaveStatus("saved");
      } catch (error) {
        console.error("Autosave failed:", error);
        setSaveStatus("error");
      }
    }, 1200);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [
    fileData,
    isGenerating,
    isImproving,
    onManualSave,
    sandpack.editorState,
    sandpack.files,
    workspaceId,
  ]);

  // Listen for Sandpack runtime errors
  useEffect(() => {
    unsubscribeRef.current = listen((msg) => {
      if (
        msg.type === "action" &&
        "action" in msg &&
        msg.action === "show-error"
      ) {
        const errMsg =
          "message" in msg && typeof msg.message === "string"
            ? msg.message
            : "An error occurred in the preview.";
        setPreviewError(errMsg);
        return;
      }
      if (msg.type === "compile") {
        const errMsg =
          "message" in msg && typeof msg.message === "string"
            ? msg.message
            : "Compile error in preview.";
        setPreviewError(errMsg);
        return;
      }
      if (msg.type === "success") {
        setPreviewError(null);
      }
    });
    return () => unsubscribeRef.current?.();
  }, [listen]);

  useEffect(() => {
    if (isGenerating) setPreviewError(null);
  }, [isGenerating]);

  const handleImproveSubmit = async () => {
    const trimmed = improveInput.trim();
    if (!trimmed || isImproving) return;
    setImproveInput("");
    setShowImproveInput(false);
    await onImprove(trimmed);
  };

  // ── Export to ZIP ──────────────────────────────────────────────────────────
  const handleExportZip = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const filesToZip =
        Object.keys(sandpack.files).length > 0
          ? sandpack.files
          : fileData?.files ?? {};

      const framework = fileData?.framework ?? "react";
      const dependencies = {
        ...baseDependencies(framework),
        ...(fileData?.dependencies ?? {}),
      };

      const zip = new JSZip();

      const packageJson = {
        name: "forge-app",
        version: "1.0.0",
        private: true,
        dependencies: frameworkDependencies(framework, dependencies),
        scripts: frameworkScripts(framework),
      };
      zip.file("package.json", JSON.stringify(packageJson, null, 2));

      if (framework === "react") {
        zip.file(
          "public/index.html",
          `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Forge App</title>
    <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`
        );
      }

      for (const [filePath, fileObj] of Object.entries(filesToZip)) {
        const code =
          typeof fileObj === "object" && fileObj !== null && "code" in fileObj
            ? (fileObj as { code: string }).code
            : "";
        const cleanPath = filePath.replace(/^\//, "");
        const zipPath =
          framework === "react" ? `src/${cleanPath}` : cleanPath;
        zip.file(zipPath, code);
      }

      if (framework === "react") {
        zip.file(
          "src/index.js",
          `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<React.StrictMode><App /></React.StrictMode>);`
        );
      }

      zip.file(
        "README.md",
        `# ${appTitle || "Zottin App"}\n\nGenerated with Zottin using ${getFrameworkLabel(framework)}.\n\n## Getting started\n\n\`\`\`bash\nnpm install\nnpm run ${framework === "expo" ? "start" : "dev"}\n\`\`\``
      );

      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const zipName = appTitle
        ? `${appTitle
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")}.zip`
        : "forge-app.zip";
      a.download = zipName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setIsExporting(false);
    }
  };

  const currentStepLabel =
    statusLog[statusLog.length - 1]?.label ?? "Generating…";

  return (
    <Tabs
      value={activeTab}
      onValueChange={(v) => setActiveTab(v as ActiveTab)}
      className="flex h-full flex-col gap-0"
    >
      {/* Tabs + Actions bar */}
      <div className="flex items-center justify-between border-b border-white/6 px-2">
        <TabsList
          variant="line"
          className="h-auto gap-0 rounded-none bg-transparent p-0"
        >
          <TabsTrigger className="border-b-2 pt-2" value="code">
            <Code2 className="h-3.5 w-3.5" />
            Code
          </TabsTrigger>
          <TabsTrigger className="border-b-2 pt-2" value="preview">
            <Eye className="h-3.5 w-3.5" />
            Preview
          </TabsTrigger>
        </TabsList>

        <div className="flex items-center gap-1.5">
          {fileData && (
            <span className="flex min-w-14 items-center justify-end gap-1 text-[10px] text-white/30">
              {saveStatus === "saving" && (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Saving
                </>
              )}
              {saveStatus === "saved" && (
                <>
                  <Check className="h-3 w-3 text-emerald-400/70" />
                  Saved
                </>
              )}
              {saveStatus === "error" && (
                <span className="text-red-400/70">Save failed</span>
              )}
            </span>
          )}
          <ResearchPanel research={fileData?.research} />
          <VersionHistory
            workspaceId={workspaceId}
            currentVersionId={currentVersionId}
            disabled={isGenerating || isImproving}
            onRestored={onVersionRestored}
          />
          {/* ── Improve button ── */}
          {isProUser ? (
            showImproveInput ? (
              <div className="flex items-center gap-1.5">
                <div className="relative flex items-center">
                  <Bot className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-violet-400" />
                  <input
                    autoFocus
                    value={improveInput}
                    onChange={(e) => setImproveInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleImproveSubmit();
                      if (e.key === "Escape") setShowImproveInput(false);
                    }}
                    placeholder="What should I improve?"
                    className="h-7 w-56 rounded-md border border-violet-500/30 bg-gradient-to-r from-violet-500/10 via-fuchsia-500/10 to-cyan-500/10 pl-8 pr-3 text-xs text-white/80 placeholder:text-white/30 focus:border-violet-400/50 focus:outline-none focus:shadow-[0_0_10px_rgba(139,92,246,0.2)]"
                  />
                </div>
                <button
                  onClick={handleImproveSubmit}
                  disabled={!improveInput.trim() || isImproving}
                  className="group relative flex h-7 w-7 items-center justify-center overflow-hidden rounded-md border border-violet-500/30 bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 text-violet-300 transition-all duration-200 hover:border-violet-400/50 hover:from-violet-500/30 hover:to-fuchsia-500/30 hover:shadow-[0_0_10px_rgba(139,92,246,0.3)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isImproving ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <ArrowUp className="h-3 w-3" />
                  )}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowImproveInput(true)}
                disabled={isImproving || !fileData}
                className="group relative flex h-7 cursor-pointer items-center gap-1.5 overflow-hidden rounded-md border border-white/10 bg-gradient-to-r from-violet-500/10 via-fuchsia-500/10 to-cyan-500/10 px-2.5 text-xs font-medium transition-all duration-300 hover:border-white/20 hover:from-violet-500/20 hover:via-fuchsia-500/20 hover:to-cyan-500/20 hover:shadow-[0_0_12px_rgba(139,92,246,0.3)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="pointer-events-none absolute inset-0 -translate-x-full animate-[shimmer_2.5s_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                {isImproving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-400" />
                ) : (
                  <Bot className="h-3.5 w-3.5 text-violet-400 transition-colors group-hover:text-violet-300" />
                )}
                <span className="bg-gradient-to-r from-violet-300 via-fuchsia-300 to-cyan-300 bg-clip-text text-transparent">
                  {isImproving ? "Improving…" : "Improve with Agent"}
                </span>
                {!isImproving && (
                  <span className="rounded-sm bg-violet-500/30 px-1 py-0.5 text-[10px] font-semibold leading-none text-violet-300">
                    PRO
                  </span>
                )}
              </button>
            )
          ) : (
            <PricingModal reason="upgrade">
              <span className="group relative flex h-7 cursor-pointer items-center gap-1.5 overflow-hidden rounded-md border border-white/10 bg-gradient-to-r from-violet-500/10 via-fuchsia-500/10 to-cyan-500/10 px-2.5 text-xs font-medium text-white/60 transition-all duration-300 hover:border-white/20 hover:from-violet-500/20 hover:via-fuchsia-500/20 hover:to-cyan-500/20 hover:text-white/90 hover:shadow-[0_0_12px_rgba(139,92,246,0.3)]">
                <span className="pointer-events-none absolute inset-0 -translate-x-full animate-[shimmer_2.5s_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                <Bot className="h-3.5 w-3.5 text-violet-400 transition-colors group-hover:text-violet-300" />
                <span className="bg-gradient-to-r from-violet-300 via-fuchsia-300 to-cyan-300 bg-clip-text text-transparent">
                  Improve with Agent
                </span>
                <span className="rounded-sm bg-violet-500/30 px-1 py-0.5 text-[10px] font-semibold leading-none text-violet-300">
                  PRO
                </span>
              </span>
            </PricingModal>
          )}

          <Button
            variant="ghost"
            onClick={handleExportZip}
            disabled={isExporting || !fileData}
          >
            {isExporting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            Download
          </Button>
        </div>
      </div>

      {/* Content area */}
      <div className="relative flex-1 overflow-hidden h-full">
        {(isGenerating || isImproving) && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 bg-[#0a0a0a]/85 backdrop-blur-sm">
            <RingLoader color="#60a5fa" size={64} speedMultiplier={0.8} />
            <div className="flex flex-col items-center gap-1.5">
              <p className="text-sm font-medium text-white/60">
                {isImproving ? "Improving with Cline AI…" : currentStepLabel}
              </p>
              <p className="text-xs text-white/20">
                This usually takes 10–20 seconds
              </p>
            </div>
          </div>
        )}

        <SandpackLayout
          style={{
            height: "100vh",
            border: "none",
            borderRadius: 0,
            background: "transparent",
          }}
        >
          <TabsContent
            value="preview"
            keepMounted
            className="mt-0 h-full w-full"
          >
            {fileData?.framework === "expo" ? (
              <div className="flex h-[89%] items-center justify-center bg-[#101010] p-8 text-center">
                <div className="max-w-sm">
                  <p className="text-sm font-medium text-white/70">
                    Expo native preview
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-white/35">
                    Native iOS and Android previews require Expo Go or an
                    emulator. Edit the project here, then download and run
                    <code className="mx-1 text-blue-300/70">npm start</code>.
                  </p>
                </div>
              </div>
            ) : (
              <SandpackPreview
                style={{ height: "89%" }}
                showOpenInCodeSandbox={false}
              />
            )}
          </TabsContent>

          <TabsContent
            value="code"
            keepMounted
            className="mt-0 flex h-full w-full"
          >
            <SandpackFileExplorer
              style={{
                height: "90%",
                width: "180px",
                borderRight: "0.5px solid rgba(255,255,255,0.08)",
              }}
            />
            <SandpackCodeEditor
              style={{ height: "90%", flex: 1 }}
              showTabs
              showLineNumbers
              showInlineErrors
              closableTabs
              readOnly={isGenerating || isImproving}
            />
          </TabsContent>
        </SandpackLayout>
      </div>

      {/* Preview error banner — uses onFixError (Gemini), not onImprove (Cline) */}
      {previewError &&
        !isGenerating &&
        !isImproving &&
        activeTab === "preview" && (
          <div className="absolute inset-x-0 -bottom-3 z-20 border-t border-red-500/20 bg-red-950/99 p-4 pb-6">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400/70" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-red-400/80">
                  Preview error
                </p>
                <p className="break-all text-[11px] text-red-300/50">
                  {previewError}
                </p>
              </div>
              <Button
                onClick={() => onFixError(previewError)}
                variant="destructive"
              >
                <Bot className="h-3 w-3" />
                Fix with AI
              </Button>
            </div>
          </div>
        )}
    </Tabs>
  );
}

// ─── CodePanel (outer) ────────────────────────────────────────────────────────

export function CodePanel({
  fileData,
  isGenerating,
  statusLog,
  onImprove,
  onFixError,
  appTitle,
  isImproving,
  isProUser,
  workspaceId,
  currentVersionId,
  onVersionRestored,
  onManualSave,
}: CodePanelProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>("preview");

  useEffect(() => {
    if (fileData) {
      setActiveTab(fileData.framework === "expo" ? "code" : "preview");
    }
  }, [fileData]);

  const files = fileData?.files ?? PLACEHOLDER_FILES;
  const framework = fileData?.framework ?? "react";
  const dependencies = {
    ...baseDependencies(framework),
    ...(fileData?.dependencies ?? {}),
  };

  // Key only on file path set — NOT on file contents.
  // Content changes go through sandpack.updateFile() inside SandpackInner.
  // This prevents Sandpack from remounting when only code changes.
  const filePathKey = `${framework}:${Object.keys(files).sort().join("|")}`;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <SandpackProvider
        key={filePathKey}
        template={SANDPACK_TEMPLATES[framework]}
        theme={dracula}
        files={files}
        customSetup={{ dependencies }}
        options={{
          externalResources: [
            "https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4",
          ],
          recompileMode: "delayed",
          recompileDelay: 500,
        }}
      >
        <SandpackInner
          isGenerating={isGenerating}
          statusLog={statusLog}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onImprove={onImprove}
          onFixError={onFixError}
          fileData={fileData}
          appTitle={appTitle}
          isImproving={isImproving}
          isProUser={isProUser}
          workspaceId={workspaceId}
          currentVersionId={currentVersionId}
          onVersionRestored={onVersionRestored}
          onManualSave={onManualSave}
        />
      </SandpackProvider>
    </div>
  );
}
