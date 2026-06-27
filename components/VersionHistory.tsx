"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { History, Loader2, RotateCcw } from "lucide-react";
import {
  getWorkspaceVersions,
  restoreWorkspaceVersion,
} from "@/actions/workspace";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type {
  FileData,
  WorkspaceVersionSummary,
} from "@/types/workspace";

interface VersionHistoryProps {
  workspaceId: string | null;
  currentVersionId: string | null;
  disabled?: boolean;
  onRestored: (
    fileData: FileData,
    versionId: string,
    workspaceUpdatedAt: string
  ) => void;
}

const SOURCE_LABELS: Record<WorkspaceVersionSummary["source"], string> = {
  generation: "Generated",
  improvement: "Improved",
  restore: "Restored",
  edit: "Edited",
  import: "Imported",
};

export function VersionHistory({
  workspaceId,
  currentVersionId,
  disabled,
  onRestored,
}: VersionHistoryProps) {
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<WorkspaceVersionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [pendingVersion, setPendingVersion] =
    useState<WorkspaceVersionSummary | null>(null);

  const loadVersions = async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      setVersions(await getWorkspaceVersions(workspaceId));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not load history."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async () => {
    if (!workspaceId || !pendingVersion || restoringId) return;
    setRestoringId(pendingVersion.id);
    try {
      const result = await restoreWorkspaceVersion(
        workspaceId,
        pendingVersion.id
      );
      setVersions((previous) => [result.version, ...previous]);
      setPendingVersion(null);
      onRestored(
        result.fileData,
        result.version.id,
        result.workspaceUpdatedAt
      );
      toast.success("Version restored.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not restore version."
      );
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) void loadVersions();
        if (!nextOpen) setPendingVersion(null);
      }}
    >
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            disabled={disabled || !workspaceId}
            aria-label="Version history"
          />
        }
      >
        <History className="h-3.5 w-3.5" />
        History
      </DialogTrigger>
      <DialogContent className="max-h-[75vh] grid-rows-[auto_1fr_auto] overflow-hidden bg-[#111]">
        <DialogHeader>
          <DialogTitle>Version history</DialogTitle>
          <DialogDescription>
            Restore earlier code without changing your chat or credits.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-24 space-y-2 overflow-y-auto">
          {loading ? (
            <div className="flex h-24 items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin text-white/40" />
            </div>
          ) : versions.length === 0 ? (
            <p className="py-8 text-center text-xs text-white/35">
              No saved versions yet.
            </p>
          ) : (
            versions.map((version, index) => {
              const isCurrent =
                version.id === currentVersionId ||
                (!currentVersionId && index === 0);
              return (
                <div
                  key={version.id}
                  className="flex items-start gap-3 rounded-lg border border-white/7 bg-white/3 p-3"
                >
                  <RotateCcw className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/35" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-white/75">
                        {SOURCE_LABELS[version.source]}
                      </span>
                      {isCurrent && (
                        <span className="rounded-full bg-blue-500/15 px-1.5 py-0.5 text-[9px] font-medium text-blue-300">
                          Current
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[11px] text-white/35">
                      {version.summary || "Saved project state"}
                    </p>
                    <p className="mt-1 text-[10px] text-white/20">
                      {formatDistanceToNow(new Date(version.createdAt), {
                        addSuffix: true,
                      })}
                    </p>
                  </div>
                  {!isCurrent && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!!restoringId}
                      onClick={() => setPendingVersion(version)}
                    >
                      Restore
                    </Button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {pendingVersion && (
          <DialogFooter className="border-t border-white/7 pt-4">
            <div className="mr-auto text-xs text-white/50">
              Restore this version? Your current state remains in history.
            </div>
            <Button
              variant="ghost"
              disabled={!!restoringId}
              onClick={() => setPendingVersion(null)}
            >
              Cancel
            </Button>
            <Button disabled={!!restoringId} onClick={handleRestore}>
              {restoringId && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Confirm restore
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
