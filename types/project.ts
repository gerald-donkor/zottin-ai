import type { AppFramework } from "@/lib/frameworks";

// ─── Project Types ────────────────────────────────────────────────────────────

export interface ProjectSummary {
  id: string;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
  firstPrompt: string | null;
  framework: AppFramework;
}
