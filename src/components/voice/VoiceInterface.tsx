"use client";

import { useState } from "react";
import { useLiveKitVoice } from "@/hooks/useLiveKitVoice";

export default function VoiceInterface() {
  const {
    isConnected,
    status,
    error,
    visualizerData,
    startConversation,
    stopConversation,
  } = useLiveKitVoice();
  const [showError, setShowError] = useState(false);

  const handleStart = async () => {
    setShowError(false);
    await startConversation();
  };

  const handleStop = async () => {
    await stopConversation();
  };

  const isIdle = status === "idle";
  const isConnecting = status === "connecting";
  const isActive = isConnected;

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8 p-6">
      {/* Status text */}
      <div className="text-center">
        <h1 className="text-4xl font-bold text-white mb-2">
          {isActive ? "Connected" : isConnecting ? "Connecting..." : "Voice Chat"}
        </h1>
        <p className="text-zinc-400 text-lg">
          {isActive
            ? "Speak naturally — the AI is listening"
            : isConnecting
            ? "Joining the room..."
            : "Click below to start a voice conversation"}
        </p>
      </div>

      {/* Audio Visualizer */}
      <div className="flex items-end justify-center gap-1 h-32 w-64">
        {visualizerData.map((value, i) => (
          <div
            key={i}
            className={`w-2 rounded-full transition-all duration-75 ${
              isActive ? "bg-emerald-400" : "bg-zinc-700"
            }`}
            style={{
              height: `${Math.max(4, value * 100)}%`,
              opacity: isActive ? 0.8 + value * 0.2 : 0.3,
            }}
          />
        ))}
      </div>

      {/* Start/Stop button */}
      <button
        onClick={isActive ? handleStop : handleStart}
        disabled={isConnecting}
        className={`px-8 py-4 rounded-full text-lg font-semibold transition-all duration-300 ${
          isActive
            ? "bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/30"
            : isConnecting
            ? "bg-zinc-600 text-zinc-300 cursor-wait"
            : "bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/30 hover:scale-105"
        }`}
      >
        {isActive
          ? "End Conversation"
          : isConnecting
          ? "Connecting..."
          : "Start Conversation"}
      </button>

      {/* Connection status */}
      {isActive && (
        <div className="flex items-center gap-2 text-emerald-400 text-sm">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          Live — speak anytime
        </div>
      )}

      {/* Error */}
      {error && showError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400 max-w-md text-center">
          {error}
          <button onClick={() => setShowError(false)} className="ml-2 text-sm underline">
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
