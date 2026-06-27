"use server";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { db } from "@/lib/prisma";
import type { WorkspaceUser, WorkspaceData } from "@/types/workspace";
import type {
  FileData,
  RestoreWorkspaceVersionResult,
  WorkspaceVersionSource,
  WorkspaceVersionSummary,
} from "@/types/workspace";

export type { WorkspaceUser, WorkspaceData } from "@/types/workspace";

// ─── Get the current authenticated user ──────────────────────────────────────

export async function getWorkspaceUser(): Promise<WorkspaceUser> {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/");

  const user = await db.user.findUnique({
    where: { clerkId },
    select: { id: true, credits: true, plan: true },
  });

  if (!user) redirect("/");

  return user;
}

// ─── Get a workspace by id (must belong to the current user) ─────────────────

export async function getWorkspaceById(
  workspaceId: string
): Promise<WorkspaceData> {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/");

  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId, user: { clerkId } },
    select: {
      id: true,
      updatedAt: true,
      title: true,
      messages: true,
      fileData: true,
      githubOwner: true,
      githubRepo: true,
      githubBranch: true,
      versions: {
        select: { id: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (!workspace) redirect("/");

  return workspace;
}

function isFileData(value: unknown): value is FileData {
  if (!value || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  return (
    !!data.files &&
    typeof data.files === "object" &&
    !!data.dependencies &&
    typeof data.dependencies === "object"
  );
}

function toVersionSummary(version: {
  id: string;
  source: string;
  summary: string | null;
  createdAt: Date;
}): WorkspaceVersionSummary {
  return {
    id: version.id,
    source: version.source as WorkspaceVersionSource,
    summary: version.summary,
    createdAt: version.createdAt.toISOString(),
  };
}

export async function getWorkspaceVersions(
  workspaceId: string
): Promise<WorkspaceVersionSummary[]> {
  const { userId: clerkId } = await auth();
  if (!clerkId) throw new Error("Unauthorized");

  const workspace = await db.workspace.findFirst({
    where: { id: workspaceId, user: { clerkId } },
    select: { id: true },
  });
  if (!workspace) throw new Error("Workspace not found");

  const versions = await db.workspaceVersion.findMany({
    where: { workspaceId },
    select: { id: true, source: true, summary: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  return versions.map(toVersionSummary);
}

export async function restoreWorkspaceVersion(
  workspaceId: string,
  versionId: string
): Promise<RestoreWorkspaceVersionResult> {
  const { userId: clerkId } = await auth();
  if (!clerkId) throw new Error("Unauthorized");

  return db.$transaction(async (tx) => {
    const version = await tx.workspaceVersion.findFirst({
      where: {
        id: versionId,
        workspaceId,
        workspace: { user: { clerkId } },
      },
      select: { fileData: true },
    });
    if (!version || !isFileData(version.fileData)) {
      throw new Error("Version not found");
    }

    const workspace = await tx.workspace.update({
      where: { id: workspaceId, user: { clerkId } },
      data: { fileData: version.fileData },
      select: { updatedAt: true },
    });

    const restoredVersion = await tx.workspaceVersion.create({
      data: {
        workspaceId,
        fileData: version.fileData,
        source: "restore",
        summary: "Restored a previous version",
      },
      select: { id: true, source: true, summary: true, createdAt: true },
    });

    return {
      fileData: version.fileData as unknown as FileData,
      version: toVersionSummary(restoredVersion),
      workspaceUpdatedAt: workspace.updatedAt.toISOString(),
    };
  });
}

export async function saveWorkspaceFiles(
  workspaceId: string,
  fileData: FileData,
  expectedUpdatedAt: string
): Promise<WorkspaceVersionSummary & { workspaceUpdatedAt: string }> {
  const { userId: clerkId } = await auth();
  if (!clerkId) throw new Error("Unauthorized");
  if (!isFileData(fileData)) throw new Error("Invalid project files");

  const version = await db.$transaction(async (tx) => {
    const update = await tx.workspace.updateMany({
      where: {
        id: workspaceId,
        user: { clerkId },
        updatedAt: new Date(expectedUpdatedAt),
      },
      data: { fileData: fileData as never },
    });
    if (update.count !== 1) {
      throw new Error("Workspace changed elsewhere. Reload before saving.");
    }

    const created = await tx.workspaceVersion.create({
      data: {
        workspaceId,
        fileData: fileData as never,
        source: "edit",
        summary: "Saved code edits",
      },
      select: { id: true, source: true, summary: true, createdAt: true },
    });
    const workspace = await tx.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: { updatedAt: true },
    });
    return { created, workspaceUpdatedAt: workspace.updatedAt.toISOString() };
  });

  return {
    ...toVersionSummary(version.created),
    workspaceUpdatedAt: version.workspaceUpdatedAt,
  };
}
