"use client";

import { useVoiceConversation } from "@/hooks/useVoiceConversation";
import { useEffect } from "react";

export default function VoiceInterface() {
  const {
    messages,
    isListening,
    isProcessing,
    isSpeaking,
    status,
    error,
    startListening,
    stopListening,
    stopAudio,
    playGreeting,
  } = useVoiceConversation();

  // Play greeting on first load
  useEffect(() => {
    const timer = setTimeout(() => {
      playGreeting();
    }, 500);
    return () => clearTimeout(timer);
  }, [playGreeting]);

  const handleToggle = () => {
    if (isListening) {
      stopListening();
    } else if (isSpeaking) {
      stopAudio();
    } else {
      startListening();
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white p-6">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold mb-3">Voice AI</h1>
        <p className="text-gray-400 text-lg">
          Speak naturally. The AI agent will respond in real-time.
        </p>
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
            <span className="text-gray-400">Tap microphone to start</span>
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

      {/* Main button */}
      <button
        onClick={handleToggle}
        disabled={isProcessing}
        className={`w-20 h-20 rounded-full flex items-center justify-center text-2xl transition-all duration-300 ${
          isListening
            ? "bg-red-500 hover:bg-red-600 shadow-red-500/50 shadow-lg"
            : isSpeaking
            ? "bg-blue-500 hover:bg-blue-600 shadow-blue-500/50 shadow-lg"
            : "bg-white text-black hover:bg-gray-200 shadow-white/20 shadow-lg"
        }`}
      >
        {isListening ? (
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
          </svg>
        ) : isSpeaking ? (
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ) : (
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        )}
      </button>

      <p className="mt-4 text-sm text-gray-500">
        {isListening
          ? "Tap to stop listening"
          : isSpeaking
          ? "Tap to stop audio"
          : isProcessing
          ? "Processing your message..."
          : "Tap microphone and speak"}
      </p>

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
