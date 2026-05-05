"use client";

import { VoiceInterface } from "@/components/voice/VoiceInterface";

export default function HomePage() {
  return (
    <main className="flex flex-col items-center justify-center min-h-[100dvh] w-full p-6">
      <div className="w-full max-w-xl flex flex-col items-center gap-8">
        <header className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">Voice AI</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Speak naturally. The AI agent will join the room automatically.
          </p>
        </header>
        <VoiceInterface />
      </div>
    </main>
  );
}
