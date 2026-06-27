import type { AppFramework } from "@/lib/frameworks";

// ─── Workspace & Chat Types ───────────────────────────────────────────────────

export type MessageRole = "user" | "assistant";

export interface Message {
  role: MessageRole;
  content: string;
  imageUrl?: string;
}

export interface FileData {
  files: Record<string, { code: string }>;
  dependencies: Record<string, string>;
  title?: string;
  framework?: AppFramework;
  research?: ProjectResearch;
}

export interface ResearchSource {
  title: string;
  url: string;
}

export interface ProjectResearch {
  summary: string;
  sources: ResearchSource[];
  queries: string[];
  researchedAt: string;
  searchEntryHtml?: string;
}

export interface StatusStep {
  label: string;
  status: "running" | "done";
}

export interface WorkspaceData {
  id: string;
  updatedAt: Date;
  title: string | null;
  messages: unknown;
  fileData: unknown;
  githubOwner: string | null;
  githubRepo: string | null;
  githubBranch: string | null;
  versions: Array<{ id: string }>;
}

export interface WorkspaceUser {
  id: string;
  credits: number;
  plan: string;
}

export type WorkspaceVersionSource =
  | "generation"
  | "improvement"
  | "restore"
  | "edit"
  | "import";

export interface WorkspaceVersionSummary {
  id: string;
  source: WorkspaceVersionSource;
  summary: string | null;
  createdAt: string;
}

export interface RestoreWorkspaceVersionResult {
  fileData: FileData;
  version: WorkspaceVersionSummary;
  workspaceUpdatedAt: string;
}
