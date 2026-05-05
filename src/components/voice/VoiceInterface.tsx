"use client";

import { useState } from "react";
import { useVoiceConversation } from "@/hooks/useVoiceConversation";

export default function VoiceInterface() {
  const [started, setStarted] = useState(false);
  const {
    messages,
    isListening,
    isProcessing,
    isSpeaking,
    status,
    error,
    startConversation,
    stopListening,
    stopAudio,
  } = useVoiceConversation();

  const handleStart = async () => {
    setStarted(true);
    startConversation();
  };

  if (!started) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white p-6">
        <div className="text-center">
          <h1 className="text-5xl font-bold mb-4">Voice AI</h1>
          <p className="text-gray-400 text-lg mb-8 max-w-md">
            Your personal AI voice assistant. Tap to start a natural conversation.
          </p>
          <button
            onClick={handleStart}
            className="px-8 py-4 bg-white text-black font-semibold rounded-full text-lg hover:bg-gray-200 transition-all shadow-white/20 shadow-lg"
          >
            Start Conversation
          </button>
          <p className="mt-4 text-xs text-gray-600">
            Powered by Groq + Cartesia
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white p-6">
      <div className="text-center mb-6">
        <h1 className="text-3xl font-bold mb-2">Voice AI</h1>
      </div>

      {/* Status */}
      <div className="flex items-center gap-3 mb-8 text-sm">
        {error ? (
          <>
            <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse"></span>
            <span className="text-red-400">{error}</span>
          </>
        ) : isProcessing ? (
          <>
            <span className="w-3 h-3 rounded-full bg-yellow-500 animate-spin"></span>
            <span className="text-yellow-400">Thinking...</span>
          </>
        ) : isSpeaking ? (
          <>
            <span className="w-3 h-3 rounded-full bg-blue-500 animate-pulse"></span>
            <span className="text-blue-400">AI speaking...</span>
          </>
        ) : isListening ? (
          <>
            <span className="w-3 h-3 rounded-full bg-green-500 animate-pulse"></span>
            <span className="text-green-400">Listening... Speak now</span>
          </>
        ) : (
          <>
            <span className="w-3 h-3 rounded-full bg-gray-500"></span>
            <span className="text-gray-400">Waiting...</span>
          </>
        )}
      </div>

      {/* Audio visualizer */}
      <div className="flex items-end justify-center gap-1 h-16 mb-8">
        {[...Array(8)].map((_, i) => (
          <div
            key={i}
            className={`w-2 rounded-full transition-all duration-150 ${
              isListening || isSpeaking
                ? "bg-green-400 animate-bounce"
                : "bg-gray-700"
            }`}
            style={{
              height: isListening || isSpeaking ? `${Math.random() * 40 + 20}px` : "8px",
              animationDelay: `${i * 0.1}s`,
            }}
          />
        ))}
      </div>

      {/* Transcript */}
      <div className="mt-8 w-full max-w-lg bg-gray-900 rounded-xl p-4 max-h-64 overflow-y-auto">
        {messages.length === 0 ? (
          <p className="text-gray-500 text-center text-sm">
            Transcript will appear here once the conversation starts.
          </p>
        ) : (
          <div className="space-y-3">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${
                  msg.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[80%] px-4 py-2 rounded-2xl text-sm ${
                    msg.role === "user"
                      ? "bg-blue-600 text-white rounded-br-md"
                      : "bg-gray-800 text-gray-200 rounded-bl-md"
                  }`}
                >
                  <span className="font-semibold text-xs opacity-70 block mb-1">
                    {msg.role === "user" ? "You" : "AI Agent"}
                  </span>
                  {msg.text}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
