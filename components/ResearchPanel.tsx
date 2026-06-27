"use client";

import { ExternalLink, Globe2, SearchCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { ProjectResearch } from "@/types/workspace";

export function ResearchPanel({
  research,
}: {
  research: ProjectResearch | undefined;
}) {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            disabled={!research}
            aria-label="Verified project research"
          />
        }
      >
        <Globe2 className="h-3.5 w-3.5" />
        Research
      </DialogTrigger>
      <DialogContent className="max-h-[80vh] grid-rows-[auto_1fr] overflow-hidden bg-[#111] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SearchCheck className="h-4 w-4 text-emerald-400/80" />
            Verified project research
          </DialogTitle>
          <DialogDescription>
            Current documentation and public project information consulted
            before generating code.
          </DialogDescription>
        </DialogHeader>

        {research && (
          <div className="overflow-y-auto pr-1">
            <p className="whitespace-pre-wrap text-xs leading-relaxed text-white/55">
              {research.summary}
            </p>

            {research.sources.length > 0 && (
              <div className="mt-5 border-t border-white/7 pt-4">
                <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-white/30">
                  Sources
                </p>
                <div className="space-y-1.5">
                  {research.sources.map((source) => (
                    <a
                      key={source.url}
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 rounded-lg border border-white/7 bg-white/3 px-3 py-2 text-xs text-white/55 transition-colors hover:border-white/15 hover:text-white/80"
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {source.title}
                      </span>
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {research.searchEntryHtml && (
              <iframe
                title="Google Search suggestions"
                srcDoc={research.searchEntryHtml}
                sandbox="allow-popups allow-popups-to-escape-sandbox"
                className="mt-4 h-12 w-full border-0"
              />
            )}

            <p className="mt-4 text-[10px] text-white/20">
              Researched {new Date(research.researchedAt).toLocaleString()}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
