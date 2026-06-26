"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { GitBranch, Loader2, Lock, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { GitHubRepository } from "@/types/github";

export function ImportGitHubModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [repositories, setRepositories] = useState<GitHubRepository[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState<string | null>(null);

  const filteredRepositories = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return repositories;
    return repositories.filter(
      (repo) =>
        repo.fullName.toLowerCase().includes(normalized) ||
        repo.description?.toLowerCase().includes(normalized)
    );
  }, [query, repositories]);

  const loadRepositories = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/github/repos");
      const body = (await response.json()) as {
        repositories?: GitHubRepository[];
        message?: string;
      };
      if (!response.ok) throw new Error(body.message || "GitHub request failed.");
      setRepositories(body.repositories ?? []);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load repositories."
      );
    } finally {
      setLoading(false);
    }
  };

  const importRepository = async (repository: GitHubRepository) => {
    if (importing) return;
    setImporting(repository.fullName);
    setError(null);
    try {
      const response = await fetch("/api/github/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner: repository.owner,
          repo: repository.name,
          branch: repository.defaultBranch,
        }),
      });
      const body = (await response.json()) as {
        workspaceId?: string;
        message?: string;
      };
      if (!response.ok || !body.workspaceId) {
        throw new Error(body.message || "Import failed.");
      }
      router.push(`/workspace?id=${body.workspaceId}`);
    } catch (importError) {
      setError(
        importError instanceof Error
          ? importError.message
          : "Could not import repository."
      );
    } finally {
      setImporting(null);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen && repositories.length === 0) void loadRepositories();
      }}
    >
      <DialogTrigger render={<Button variant="outline" />}>
        <GitBranch className="h-3.5 w-3.5" />
        Import from GitHub
      </DialogTrigger>
      <DialogContent className="max-h-[80vh] grid-rows-[auto_auto_1fr] overflow-hidden bg-[#111] sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Import from GitHub</DialogTitle>
          <DialogDescription>
            Choose a React JavaScript repository to open it in Zottin.
          </DialogDescription>
        </DialogHeader>

        {!loading && !error && repositories.length > 0 && (
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-white/25" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search repositories"
              className="h-9 w-full rounded-lg border border-white/8 bg-white/4 pl-9 pr-3 text-xs text-white/80 outline-none placeholder:text-white/25 focus:border-white/15"
            />
          </div>
        )}

        <div className="min-h-40 overflow-y-auto">
          {loading ? (
            <div className="flex h-40 items-center justify-center gap-2 text-xs text-white/35">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading repositories…
            </div>
          ) : error ? (
            <div className="rounded-lg border border-red-500/15 bg-red-500/5 p-4">
              <p className="text-xs text-red-300/80">{error}</p>
              <p className="mt-2 text-[11px] leading-relaxed text-white/35">
                Enable GitHub in Clerk, then sign in with GitHub or connect it
                from your account profile. Private repositories also require
                repository access in the Clerk GitHub connection.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={loadRepositories}
              >
                Try again
              </Button>
            </div>
          ) : filteredRepositories.length === 0 ? (
            <p className="py-14 text-center text-xs text-white/30">
              {repositories.length === 0
                ? "No repositories found."
                : "No matching repositories."}
            </p>
          ) : (
            <div className="space-y-2">
              {filteredRepositories.map((repository) => (
                <div
                  key={repository.id}
                  className="flex items-center gap-3 rounded-lg border border-white/7 bg-white/3 p-3"
                >
                  <GitBranch className="h-4 w-4 shrink-0 text-white/35" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-xs font-medium text-white/75">
                        {repository.fullName}
                      </p>
                      {repository.private && (
                        <Lock className="h-3 w-3 shrink-0 text-white/25" />
                      )}
                    </div>
                    <p className="mt-0.5 line-clamp-1 text-[11px] text-white/30">
                      {repository.description || repository.defaultBranch}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    disabled={!!importing}
                    onClick={() => importRepository(repository)}
                  >
                    {importing === repository.fullName && (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    )}
                    Import
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
