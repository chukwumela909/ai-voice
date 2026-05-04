"use client";

import { cn } from "@/lib/utils";
import { useVoiceStore } from "@/lib/store";
import { Mic, MicOff, PhoneOff, Phone } from "lucide-react";

type MicVariant = "start" | "mic" | "stop";

interface MicButtonProps {
  variant: MicVariant;
  onClick?: () => void;
  disabled?: boolean;
}

export function MicButton({ variant, onClick, disabled }: MicButtonProps) {
  const status = useVoiceStore((s) => s.status);
  const isMicEnabled = useVoiceStore((s) => s.isMicEnabled);

  if (variant === "start") {
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-full px-8 py-4 text-base font-semibold shadow-lg transition-all",
          "bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
        )}
      >
        <Phone className="size-5" />
        Start Call
      </button>
    );
  }

  if (variant === "stop") {
    return (
      <button
        onClick={onClick}
        className={cn(
          "inline-flex items-center justify-center rounded-full size-14 shadow-lg transition-all",
          "bg-destructive/10 text-destructive hover:bg-destructive/20 active:scale-95"
        )}
        aria-label="End call"
      >
        <PhoneOff className="size-6" />
      </button>
    );
  }

  // mic toggle
  const active = status === "connected" && isMicEnabled;

  return (
    <button
      onClick={onClick}
      disabled={status !== "connected"}
      className={cn(
        "inline-flex items-center justify-center rounded-full size-20 shadow-xl transition-all ring-4",
        active
          ? "bg-primary text-primary-foreground ring-primary/30 hover:bg-primary/90 active:scale-95"
          : "bg-muted text-muted-foreground ring-muted/30 hover:bg-muted/80 active:scale-95",
        "disabled:opacity-40 disabled:pointer-events-none"
      )}
      aria-label={active ? "Mute microphone" : "Unmute microphone"}
    >
      {active ? <Mic className="size-8" /> : <MicOff className="size-8" />}
    </button>
  );
}
