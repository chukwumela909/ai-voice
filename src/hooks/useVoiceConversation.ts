"use client";

import { useState, useRef, useCallback, useEffect } from "react";

interface Message {
  role: "user" | "assistant";
  text: string;
}

export function useVoiceConversation() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [status, setStatus] = useState<"idle" | "connected" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recognizerRef = useRef<SpeechRecognition | null>(null);
  const historyRef = useRef<Message[]>([]);
  const transcriptBuffer = useRef<string>("");

  // Play audio from base64 string
  const playAudio = useCallback(async (audioBase64: string) => {
    try {
      const blob = new Blob(
        [Uint8Array.from(atob(audioBase64), (c) => c.charCodeAt(0))],
        { type: "audio/mpeg" }
      );
      const url = URL.createObjectURL(blob);

      if (audioRef.current) {
        audioRef.current.pause();
        URL.revokeObjectURL(audioRef.current.src);
      }

      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onplay = () => setIsSpeaking(true);
      audio.onended = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(url);
      };
      audio.onerror = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(url);
      };

      await audio.play();
    } catch (e: any) {
      if (e.name === "NotAllowedError") {
        console.warn("[Audio] Autoplay blocked — user interaction required before playing audio.");
      } else {
        console.error("[Audio] Play error:", e);
      }
      setIsSpeaking(false);
    }
  }, []);

  // Send message to API and play response
  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim()) return;

      setIsProcessing(true);
      setError(null);

      // Add user message
      const userMsg: Message = { role: "user", text };
      setMessages((prev) => [...prev, userMsg]);
      historyRef.current = [...historyRef.current, userMsg];

      try {
        const res = await fetch("/api/voice/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text,
            history: historyRef.current.slice(-10),
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "API error");
        }

        const data = await res.json();

        // Add assistant message
        const assistantMsg: Message = { role: "assistant", text: data.response };
        setMessages((prev) => [...prev, assistantMsg]);
        historyRef.current = [...historyRef.current, assistantMsg];

        // Play audio
        if (data.audio_base64) {
          await playAudio(data.audio_base64);
        }
      } catch (e: any) {
        console.error("[Voice] Chat error:", e);
        setError(e.message);
        setStatus("error");
      } finally {
        setIsProcessing(false);
      }
    },
    [playAudio]
  );

  // Start listening with SpeechRecognition
  const startListening = useCallback(() => {
    if (isListening || isProcessing || isSpeaking) return;

    const SpeechRecognitionCtor =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      setError("Speech recognition not supported in this browser");
      return;
    }

    const recognizer = new SpeechRecognitionCtor();
    recognizer.continuous = true;
    recognizer.interimResults = true;
    recognizer.lang = "en-US";

    transcriptBuffer.current = "";

    recognizer.onstart = () => {
      setIsListening(true);
      setStatus("connected");
      setError(null);
      console.log("[Voice] Listening started");
    };

    recognizer.onresult = (event: SpeechRecognitionEvent) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          const text = result[0].transcript.trim();
          if (text) {
            transcriptBuffer.current += (transcriptBuffer.current ? " " : "") + text;
            console.log("[Voice] Final transcript:", text);
          }
        }
      }
    };

    recognizer.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === "no-speech") return; // Ignore no-speech
      console.error("[Voice] Recognition error:", event.error);
      if (event.error !== "aborted") {
        setError(`Speech error: ${event.error}`);
      }
    };

    recognizer.onend = () => {
      setIsListening(false);
      console.log("[Voice] Listening ended");
      // If we have accumulated text, send it
      const text = transcriptBuffer.current.trim();
      if (text && !isProcessing && !isSpeaking) {
        transcriptBuffer.current = "";
        sendMessage(text);
      }
    };

    recognizerRef.current = recognizer;
    recognizer.start();
  }, [isListening, isProcessing, isSpeaking, sendMessage]);

  // Stop listening
  const stopListening = useCallback(() => {
    if (recognizerRef.current) {
      recognizerRef.current.stop();
    }
  }, []);

  // Play greeting on mount
  const playGreeting = useCallback(async () => {
    try {
      const res = await fetch("/api/voice/greet");
      if (!res.ok) return;
      const data = await res.json();
      if (data.audio_base64) {
        await playAudio(data.audio_base64);
        setMessages([{ role: "assistant", text: data.greeting }]);
      }
    } catch (e) {
      console.error("[Voice] Greeting error:", e);
    }
  }, [playAudio]);

  // Stop audio
  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsSpeaking(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognizerRef.current) {
        recognizerRef.current.abort();
      }
      if (audioRef.current) {
        audioRef.current.pause();
        URL.revokeObjectURL(audioRef.current.src);
      }
    };
  }, []);

  return {
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
  };
}
