"use client";

import { useState } from "react";
import { useLiveKitVoice } from "@/hooks/useLiveKitVoice";
import { useVoiceStore } from "@/lib/store";

export default function VoiceInterface() {
  const [started, setStarted] = useState(false);
  const { connect, disconnect, toggleMic, isConnecting, audioContainerRef } =
    useLiveKitVoice();
  const [isMuted, setIsMuted] = useState(false);

  const status = useVoiceStore((s) => s.status);
  const isMicEnabled = useVoiceStore((s) => s.isMicEnabled);
  const isSpeaking = useVoiceStore((s) => s.isSpeaking);
  const isAgentSpeaking = useVoiceStore((s) => s.isAgentSpeaking);
  const isAgentJoined = useVoiceStore((s) => s.isAgentJoined);
  const error = useVoiceStore((s) => s.error);
  const userAudioLevel = useVoiceStore((s) => s.userAudioLevel);
  const agentAudioLevel = useVoiceStore((s) => s.agentAudioLevel);

  const handleStart = async () => {
    setStarted(true);
    await connect();
  };

  const handleEnd = () => {
    disconnect();
    setStarted(false);
    setIsMuted(false);
  };

  const handleMicToggle = async () => {
    await toggleMic();
    setIsMuted(!isMicEnabled);
  };

  // Visualizer bars
  const getBarHeight = (index: number, levels: number) => {
    const base = 8;
    if (!started) return base;
    const isActive = isSpeaking || (isAgentSpeaking && isAgentJoined);
    if (!isActive) return base;
    const random = Math.sin(Date.now() / 200 + index * 1.5) * 0.5 + 0.5;
    return Math.max(base, levels * 50 * random + base);
  };

  if (!started) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white p-6">
        <div className="text-center">
          <h1 className="text-5xl font-bold mb-4">Voice AI</h1>
          <p className="text-gray-400 text-lg mb-8 max-w-md">
            Your personal AI voice assistant. Tap to start a real-time
            conversation.
          </p>
          <button
            onClick={handleStart}
            disabled={isConnecting}
            className="px-8 py-4 bg-white text-black font-semibold rounded-full text-lg hover:bg-gray-200 transition-all shadow-white/20 shadow-lg disabled:opacity-50"
          >
            {isConnecting ? "Connecting..." : "Start Conversation"}
          </button>
          <p className="mt-4 text-xs text-gray-600">Powered by Groq + Cartesia</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white p-6 relative">
      {/* Hidden audio container for LiveKit */}
      <div ref={audioContainerRef} className="hidden" />

      <div className="text-center mb-6">
        <h1 className="text-3xl font-bold mb-2">Voice AI</h1>
      </div>

      {/* Status */}
      <div className="flex items-center gap-3 mb-8 text-sm">
        {error ? (
          <>
            <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
            <span className="text-red-400">{error}</span>
          </>
        ) : !isAgentJoined ? (
          <>
            <span className="w-3 h-3 rounded-full bg-yellow-500 animate-pulse" />
            <span className="text-yellow-400">Waiting for agent...</span>
          </>
        ) : isAgentSpeaking ? (
          <>
            <span className="w-3 h-3 rounded-full bg-blue-500 animate-pulse" />
            <span className="text-blue-400">AI speaking...</span>
          </>
        ) : isSpeaking ? (
          <>
            <span className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
            <span className="text-green-400">Listening...</span>
          </>
        ) : (
          <>
            <span className="w-3 h-3 rounded-full bg-gray-500" />
            <span className="text-gray-400">Ready — speak anytime</span>
          </>
        )}
      </div>

      {/* Audio visualizer */}
      <div className="flex items-end justify-center gap-[3px] h-20 mb-10 w-64">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="w-[6px] rounded-full transition-all duration-100"
            style={{
              backgroundColor:
                isAgentSpeaking && isAgentJoined
                  ? "#60a5fa"
                  : isSpeaking
                  ? "#34d399"
                  : "#374151",
              height: getBarHeight(
                i,
                isAgentSpeaking ? agentAudioLevel : userAudioLevel
              ),
              opacity: isAgentSpeaking || isSpeaking ? 1 : 0.4,
            }}
          />
        ))}
      </div>

      {/* Control buttons */}
      <div className="flex items-center gap-4">
        {/* End call */}
        <button
          onClick={handleEnd}
          className="w-12 h-12 rounded-full bg-red-500/20 text-red-400 hover:bg-red-500/30 flex items-center justify-center transition-all"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.8 4h-9.6C6.3 4 5.9 4.5 6 5l1.2 6c.1.5.5.9 1 .9h1.8c.5 0 .9-.4 1-.9l.3-2.4h3.4l.3 2.4c.1.5.5.9 1 .9h1.8c.5 0 .9-.4 1-.9L18 5c.1-.5-.3-1-.8-1zM6 14c-.6 0-1 .4-1 1v3c0 .6.4 1 1 1h12c.6 0 1-.4 1-1v-3c0-.6-.4-1-1-1H6z" />
          </svg>
        </button>

        {/* Mic toggle */}
        <button
          onClick={handleMicToggle}
          disabled={!isAgentJoined}
          className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 ${
            isMuted
              ? "bg-red-500 hover:bg-red-600 shadow-red-500/30 shadow-lg"
              : "bg-white text-black hover:bg-gray-200 shadow-white/20 shadow-lg"
          } disabled:opacity-50`}
        >
          {isMuted ? (
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
            </svg>
          ) : (
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          )}
        </button>

        {/* Connection status badge */}
        <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
          <span className="w-3 h-3 rounded-full bg-emerald-400" />
        </div>
      </div>

      <p className="mt-6 text-sm text-gray-500">
        {isAgentJoined
          ? isAgentSpeaking
            ? "AI is speaking..."
            : "Speak to interrupt or respond"
          : "Waiting for agent to join..."}
      </p>
    </div>
  );
}
