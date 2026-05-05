"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Room,
  RoomEvent,
  ConnectionState,
  Track,
  RemoteParticipant,
  RemoteTrack,
} from "livekit-client";

interface VoiceState {
  isConnected: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  status: string;
  error: string | null;
}

export function useLiveKitVoice() {
  const [state, setState] = useState<VoiceState>({
    isConnected: false,
    isListening: false,
    isSpeaking: false,
    status: "idle",
    error: null,
  });

  const roomRef = useRef<Room | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number>(0);
  const [visualizerData, setVisualizerData] = useState<number[]>(new Array(32).fill(0));

  // Generate token from backend
  const getToken = async (): Promise<string> => {
    const res = await fetch("/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room: "voice-pipecat" }),
    });
    if (!res.ok) throw new Error("Failed to get token");
    const data = await res.json();
    return data.token;
  };

  // Start conversation
  const startConversation = useCallback(async () => {
    try {
      setState((s) => ({ ...s, status: "connecting", error: null }));

      const token = await getToken();
      const wsUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL || "wss://livekit-livekit.amenviron.app/";

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      roomRef.current = room;

      // Subscribe to all remote tracks (agent audio)
      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, pub, participant: RemoteParticipant) => {
        console.log("[LiveKit] Track subscribed:", track.kind, "from", participant.identity);
        if (track.kind === Track.Kind.Audio) {
          const el = document.createElement("audio");
          el.id = "agent-audio";
          el.autoplay = true;
          track.attach(el);
          document.body.appendChild(el);

          // Visualize agent audio
          const stream = new MediaStream([track.mediaStreamTrack]);
          const audioCtx = audioContextRef.current || new AudioContext();
          audioContextRef.current = audioCtx;
          const source = audioCtx.createMediaStreamSource(stream);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 64;
          source.connect(analyser);
          analyserRef.current = analyser;

          const updateViz = () => {
            const data = new Uint8Array(analyser.frequencyBinCount);
            analyser.getByteFrequencyData(data);
            setVisualizerData(Array.from(data).map((v) => v / 255));
            animationFrameRef.current = requestAnimationFrame(updateViz);
          };
          updateViz();
        }
      });

      room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        track.detach();
        const el = document.getElementById("agent-audio");
        if (el) el.remove();
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      });

      // CRITICAL: Wait for full connection before enabling mic
      await room.connect(wsUrl, token);
      console.log("[LiveKit] Signaling connected, waiting for WebRTC...");

      // Wait for ConnectionState to be fully Connected
      if (room.state !== ConnectionState.Connected) {
        await new Promise<void>((resolve, reject) => {
          const onStateChange = (state: ConnectionState) => {
            console.log("[LiveKit] Connection state:", state);
            if (state === ConnectionState.Connected) {
              room.off(RoomEvent.ConnectionStateChanged, onStateChange);
              resolve();
            } else if (state === ConnectionState.Disconnected) {
              room.off(RoomEvent.ConnectionStateChanged, onStateChange);
              reject(new Error("Connection disconnected before fully connected"));
            }
          };
          room.on(RoomEvent.ConnectionStateChanged, onStateChange);
          // Timeout fallback
          setTimeout(() => {
            if (room.state === ConnectionState.Connected) {
              room.off(RoomEvent.ConnectionStateChanged, onStateChange);
              resolve();
            }
          }, 5000);
        });
      }
      console.log("[LiveKit] Fully connected, enabling microphone...");

      // NOW enable microphone after full connection
      await room.localParticipant.setMicrophoneEnabled(true);
      console.log("[LiveKit] Microphone enabled");

      setState({
        isConnected: true,
        isListening: true,
        isSpeaking: false,
        status: "connected",
        error: null,
      });
    } catch (err: any) {
      console.error("[LiveKit] Connection error:", err);
      setState({
        isConnected: false,
        isListening: false,
        isSpeaking: false,
        status: "error",
        error: err.message || "Failed to connect",
      });
    }
  }, []);

  // Stop conversation
  const stopConversation = useCallback(async () => {
    if (roomRef.current) {
      await roomRef.current.disconnect();
      roomRef.current = null;
    }
    if (audioContextRef.current) {
      await audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    setState({
      isConnected: false,
      isListening: false,
      isSpeaking: false,
      status: "idle",
      error: null,
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopConversation();
    };
  }, [stopConversation]);

  return {
    ...state,
    visualizerData,
    startConversation,
    stopConversation,
  };
}
