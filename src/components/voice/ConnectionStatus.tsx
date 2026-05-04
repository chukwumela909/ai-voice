"use client";

import { cn } from "@/lib/utils";
import { useVoiceStore } from "@/lib/store";

export function ConnectionStatus() {
  const status = useVoiceStore((s) => s.status);
  const error = useVoiceStore((s) => s.error);

  let label = "Idle";
  let color = "bg-neutral-500";

  switch (status) {
    case "connecting":
    case "disconnecting":
      label = "Connecting...";
      color = "bg-amber-400";
      break;
    case "connected":
      label = "Connected";
      color = "bg-emerald-400";
      break;
    case "error":
      label = error ? "Error" : "Disconnected";
      color = "bg-red-400";
      break;
    default:
      label = "Ready";
      color = "bg-neutral-500";
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={cn("relative inline-flex size-2.5 rounded-full", color)}>
        {status === "connecting" && (
          <span
            className={cn(
              "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
              color
            )}
          />
        )}
      </span>
      <span className="text-muted-foreground font-medium">{label}</span>
      {error && (
        <span className="text-red-400 ml-1 truncate max-w-[16rem]">— {error}</span>
      )}
    </div>
  );
}
