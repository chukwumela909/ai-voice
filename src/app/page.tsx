"use client";

import VoiceInterface from "@/components/voice/VoiceInterface";

export default function HomePage() {
  return (
    <main className="flex flex-col items-center justify-center min-h-[100dvh] w-full p-6 bg-black">
      <div className="w-full max-w-xl flex flex-col items-center gap-8">
        <VoiceInterface />
      </div>
    </main>
  );
}
