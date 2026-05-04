"use client";

import { useMemo } from "react";
import { useVoiceStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export function AudioVisualizer() {
  const userLevel = useVoiceStore((s) => s.userAudioLevel);
  const agentLevel = useVoiceStore((s) => s.agentAudioLevel);
  const isSpeaking = useVoiceStore((s) => s.isSpeaking);
  const isAgentSpeaking = useVoiceStore((s) => s.isAgentSpeaking);

  const barCount = 7;

  const bars = useMemo(() => {
    const activeLevel = isAgentSpeaking ? agentLevel : userLevel;
    const bars: number[] = [];
    for (let i = 0; i < barCount; i++) {
      const pos = i / (barCount - 1);
      const distance = Math.abs(pos - 0.5) * 2;
      const jitter = ((i * 3.7) % 1) * 0.3;
      const base = Math.max(0.1, 1 - distance);
      const effective = activeLevel * base + jitter * activeLevel * 0.5;
      bars.push(Math.min(1, Math.max(0.05, effective)));
    }
    return bars;
  }, [userLevel, agentLevel, isAgentSpeaking]);

  const active = isAgentSpeaking || isSpeaking;

  if (!active && userLevel === 0 && agentLevel === 0) {
    return (
      <div className="flex items-end justify-center gap-1 h-24">
        {Array.from({ length: barCount }).map((_, i) => {
          const pos = i / (barCount - 1);
          const h = 20 + (1 - Math.abs(pos - 0.5) * 2) * 30;
          return (
            <div
              key={i}
              className="w-2 rounded-full bg-muted-foreground/30"
              style={{ height: `${h}%` }}
            />
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2 w-full">
      {isAgentSpeaking && (
        <span className="text-xs text-emerald-400 font-medium">Agent is speaking</span>
      )}
      <div className="flex items-end justify-center gap-1.5 h-24 w-full">
        {bars.map((h, i) => (
          <div
            key={i}
            className={cn(
              "w-2.5 rounded-full transition-all duration-75 ease-out",
              isAgentSpeaking ? "bg-emerald-400" : "bg-primary"
            )}
            style={{
              height: `${Math.max(8, h * 100)}%`,
              opacity: 0.6 + h * 0.4,
            }}
          />
        ))}
      </div>
      {isSpeaking && (
        <span className="text-xs text-primary/80 font-medium">Listening...</span>
      )}
    </div>
  );
}
