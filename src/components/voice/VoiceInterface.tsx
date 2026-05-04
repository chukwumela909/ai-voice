"use client";

import { useState } from "react";
import { useLiveKitVoice } from "@/hooks/useLiveKitVoice";
import { ConnectionStatus } from "./ConnectionStatus";
import { AudioVisualizer } from "./AudioVisualizer";
import { MicButton } from "./MicButton";
import { TranscriptLog } from "./TranscriptLog";

interface VoiceInterfaceProps {
  roomName: string;
}

export function VoiceInterface({ roomName }: VoiceInterfaceProps) {
  const { connect, disconnect, toggleMic, isConnecting, audioContainerRef } =
    useLiveKitVoice(roomName);

  const [hasStarted, setHasStarted] = useState(false);

  async function handleStart() {
    setHasStarted(true);
    await connect();
  }

  function handleStop() {
    setHasStarted(false);
    disconnect();
  }

  return (
    <section className="w-full flex flex-col items-center gap-6">
      <ConnectionStatus />
      <AudioVisualizer />

      {/* Hidden container for auto-played remote audio elements */}
      <div
        ref={audioContainerRef}
        className="sr-only"
        aria-hidden="true"
        data-testid="remote-audio-container"
      />

      <div className="flex items-center gap-4">
        {!hasStarted ? (
          <MicButton
            variant="start"
            disabled={isConnecting}
            onClick={handleStart}
          />
        ) : (
          <div className="flex items-center gap-4">
            <MicButton variant="mic" onClick={toggleMic} />
            <MicButton variant="stop" onClick={handleStop} />
          </div>
        )}
      </div>

      <TranscriptLog />
    </section>
  );
}
