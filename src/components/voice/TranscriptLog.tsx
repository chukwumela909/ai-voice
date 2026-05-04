"use client";

import { useVoiceStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { User, Bot, Trash2 } from "lucide-react";

export function TranscriptLog() {
  const transcripts = useVoiceStore((s) => s.transcripts);

  if (transcripts.length === 0) {
    return (
      <div className="w-full rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        Transcript will appear here once the agent is connected and processing speech.
      </div>
    );
  }

  return (
    <div className="w-full rounded-xl border border-border bg-card flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-sm font-medium">Transcript</span>
        <button
          onClick={() => useVoiceStore.getState().clearTranscripts()}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Clear transcript"
        >
          <Trash2 className="size-3.5" />
          Clear
        </button>
      </div>
      <ScrollArea className="h-48 px-4 py-3">
        <div className="flex flex-col gap-3">
          {transcripts.map((t) => (
            <div key={t.id} className="flex gap-3 items-start">
              <div
                className={cn(
                  "mt-0.5 flex items-center justify-center size-6 rounded-full shrink-0",
                  t.role === "user" ? "bg-primary/10 text-primary" : "bg-emerald-400/10 text-emerald-400"
                )}
              >
                {t.role === "user" ? (
                  <User className="size-3.5" />
                ) : (
                  <Bot className="size-3.5" />
                )}
              </div>
              <div className="flex flex-col">
                <span className="text-[0.7rem] font-medium text-muted-foreground capitalize">
                  {t.role}
                </span>
                <p className="text-sm leading-relaxed">{t.text}</p>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
