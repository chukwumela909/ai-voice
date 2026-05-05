"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Room,
  RoomEvent,
  Track,
  TrackEvent,
  RemoteParticipant,
  RemoteTrack,
  RoomConnectOptions,
  type DataPacket_Kind,
} from "livekit-client";
import { useVoiceStore } from "@/lib/store";

// Browser SpeechRecognition types (not in standard TS lib)
interface SpeechRecognitionResult {
  isFinal: boolean;
  [index: number]: { transcript: string };
}

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: SpeechRecognitionResult[];
}

interface SpeechRecognitionErrorEvent {
  error: string;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  }
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
}

export function useLiveKitVoice() {
  const roomRef = useRef<Room | null>(null);
  const audioContainerRef = useRef<HTMLDivElement | null>(null);
  const remoteAudioElements = useRef<Map<string, HTMLAudioElement>>(new Map());
  const levelIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const speechRef = useRef<SpeechRecognitionInstance | null>(null);

  const [isConnecting, setIsConnecting] = useState(false);

  // Generate a unique room name
  const getRoomName = useCallback(() => {
    return "voice-pipecat";
  }, []);

  const connect = useCallback(
    async (participantName?: string) => {
      if (
        roomRef.current?.state === "connected" ||
        roomRef.current?.state === "connecting"
      ) {
        return;
      }

      setIsConnecting(true);
      useVoiceStore.getState().setStatus("connecting");
      useVoiceStore.getState().setError(null);
      useVoiceStore.getState().setAgentJoined(false);

      try {
        const roomName = getRoomName();
        const identity =
          participantName || `user-${Math.floor(Math.random() * 10_000)}`;

        const res = await fetch("/api/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ room: roomName, identity }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `Token request failed (${res.status})`);
        }

        const { token, url } = await res.json();
        if (!token || !url) {
          throw new Error("Invalid token response from server");
        }

        const room = new Room({
          adaptiveStream: true,
          dynacast: true,
          publishDefaults: {
            dtx: true,
            red: true,
          } as const,
        });

        roomRef.current = room;

        // === Agent detection ===
        room.on(RoomEvent.ParticipantConnected, (p: RemoteParticipant) => {
          useVoiceStore.getState().setAgentJoined(true);
          console.log(`[Agent] Participant connected: ${p.identity}`);
        });

        room.on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
          const hasOthers = room.participants.size > 0;
          if (!hasOthers) {
            useVoiceStore.getState().setAgentJoined(false);
            useVoiceStore.getState().setAgentSpeaking(false);
            useVoiceStore.getState().setAgentAudioLevel(0);
          }
          console.log(`[Agent] Participant disconnected: ${p.identity}`);
        });

        // === Data messages (transcripts from agent) ===
        // livekit-client v1.15.4: (payload, participant?, kind?, topic?)
        room.on(
          RoomEvent.DataReceived,
          (
            payload: Uint8Array,
            _participant?: RemoteParticipant,
            _kind?: DataPacket_Kind,
            _topic?: string
          ) => {
            try {
              const text = new TextDecoder().decode(payload);
              const data = JSON.parse(text);
              if (data.role && data.text) {
                useVoiceStore.getState().addTranscript({
                  role: data.role,
                  text: data.text,
                  source: "server",
                });
              }
            } catch (e) {
              // Non-JSON data, ignore
            }
          }
        );

        // === Audio track handling ===
        room.on(
          RoomEvent.TrackSubscribed,
          (track: RemoteTrack, _pub, participant: RemoteParticipant) => {
            if (track.kind === Track.Kind.Audio && track.sid) {
              const audioEl = track.attach() as HTMLAudioElement;
              audioEl.volume = 1.0;
              audioEl.autoplay = true;
              audioEl.id = `audio-${participant.identity}-${track.sid}`;
              remoteAudioElements.current.set(track.sid, audioEl);

              if (audioContainerRef.current) {
                audioContainerRef.current.appendChild(audioEl);
              }

              useVoiceStore.getState().setAgentSpeaking(true);

              track.on(TrackEvent.AudioPlaybackStarted, () => {
                useVoiceStore.getState().setAgentSpeaking(true);
              });
              track.on(TrackEvent.AudioPlaybackFailed, (e) => {
                console.error("Audio playback failed:", e);
              });
              track.on(TrackEvent.Ended, () => {
                useVoiceStore.getState().setAgentSpeaking(false);
              });
            }
          }
        );

        room.on(
          RoomEvent.TrackUnsubscribed,
          () => {
            const sids = new Set<string>();
            room.participants.forEach((p) => {
              p.tracks.forEach((pub) => {
                if (pub.trackSid) sids.add(pub.trackSid);
              });
            });

            const entries = Array.from(remoteAudioElements.current.entries());
            for (const [sid, el] of entries) {
              if (!sids.has(sid)) {
                el.remove();
                remoteAudioElements.current.delete(sid);
              }
            }

            if (remoteAudioElements.current.size === 0) {
              useVoiceStore.getState().setAgentSpeaking(false);
              useVoiceStore.getState().setAgentAudioLevel(0);
            }
          }
        );

        room.on(RoomEvent.ParticipantDisconnected, () => {
          if (remoteAudioElements.current.size === 0) {
            useVoiceStore.getState().setAgentSpeaking(false);
            useVoiceStore.getState().setAgentAudioLevel(0);
          }
        });

        room.on(RoomEvent.Connected, () => {
          useVoiceStore.getState().setStatus("connected");
          useVoiceStore.getState().setMicEnabled(true);
        });

        room.on(RoomEvent.Disconnected, () => {
          useVoiceStore.getState().setStatus("idle");
          useVoiceStore.getState().setMicEnabled(false);
          useVoiceStore.getState().setSpeaking(false);
          useVoiceStore.getState().setAgentSpeaking(false);
          useVoiceStore.getState().setAgentJoined(false);
          useVoiceStore.getState().setUserAudioLevel(0);
          useVoiceStore.getState().setAgentAudioLevel(0);
        });

        room.on(RoomEvent.ConnectionStateChanged, (state) => {
          if (state === "connecting") useVoiceStore.getState().setStatus("connecting");
        });

        room.on(RoomEvent.Reconnecting, () => {
          useVoiceStore.getState().setStatus("connecting");
        });

        room.on(RoomEvent.Reconnected, () => {
          useVoiceStore.getState().setStatus("connected");
        });

        await room.connect(url, token, {
          autoSubscribe: true,
        } satisfies RoomConnectOptions);

        await room.localParticipant.setMicrophoneEnabled(true);

        // === Browser SpeechRecognition for local transcripts ===
        const SpeechRecognitionCtor =
          window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognitionCtor) {
          const recognizer = new SpeechRecognitionCtor();
          recognizer.continuous = true;
          recognizer.interimResults = true;
          recognizer.lang = "en-US";

          recognizer.onresult = (event: SpeechRecognitionEvent) => {
            for (let i = event.resultIndex; i < event.results.length; i++) {
              const result = event.results[i];
              if (result.isFinal) {
                const text = result[0].transcript.trim();
                if (text) {
                  useVoiceStore.getState().addTranscript({
                    role: "user",
                    text,
                    source: "local",
                  });
                  // Send text to Pipecat bot via LiveKit data message
                  try {
                    const payload = new TextEncoder().encode(JSON.stringify({ text }));
                    room.localParticipant.publishData(payload, 1); // 1 = RELIABLE
                    console.log("[Client] Sent text to bot:", text);
                  } catch (e) {
                    console.error("[Client] Failed to send data:", e);
                  }
                }
              }
            }
          };

          recognizer.onerror = (e: SpeechRecognitionErrorEvent) => {
            // Ignore 'no-speech' and 'aborted' as they're normal
            if (e.error !== "no-speech" && e.error !== "aborted") {
              console.warn("SpeechRecognition error:", e.error);
            }
          };

          recognizer.start();
          speechRef.current = recognizer;
        }

        // === Audio level polling ===
        levelIntervalRef.current = setInterval(() => {
          const local = room.localParticipant;
          useVoiceStore
            .getState()
            .setUserAudioLevel(local.audioLevel ?? 0);
          useVoiceStore
            .getState()
            .setSpeaking(local.isSpeaking ?? false);

          let maxAgentLevel = 0;
          room.participants.forEach((p) => {
            if (p.audioLevel && p.audioLevel > maxAgentLevel) {
              maxAgentLevel = p.audioLevel;
            }
          });
          useVoiceStore.getState().setAgentAudioLevel(maxAgentLevel);
          useVoiceStore.getState().setAgentSpeaking(maxAgentLevel > 0.01);
        }, 80);
      } catch (err) {
        console.error("Failed to connect:", err);
        useVoiceStore
          .getState()
          .setError(
            err instanceof Error ? err.message : "Unknown connection error"
          );
        useVoiceStore.getState().setStatus("error");
      } finally {
        setIsConnecting(false);
      }
    },
    [getRoomName]
  );

  const disconnect = useCallback(() => {
    // Stop speech recognition
    if (speechRef.current) {
      try {
        speechRef.current.stop();
      } catch (e) {
        // May already be stopped
      }
      speechRef.current = null;
    }

    if (levelIntervalRef.current) {
      clearInterval(levelIntervalRef.current);
      levelIntervalRef.current = null;
    }

    remoteAudioElements.current.forEach((el) => el.remove());
    remoteAudioElements.current.clear();

    roomRef.current?.disconnect();
    roomRef.current = null;

    useVoiceStore.getState().setStatus("idle");
    useVoiceStore.getState().setMicEnabled(false);
    useVoiceStore.getState().setSpeaking(false);
    useVoiceStore.getState().setAgentSpeaking(false);
    useVoiceStore.getState().setAgentJoined(false);
    useVoiceStore.getState().setUserAudioLevel(0);
    useVoiceStore.getState().setAgentAudioLevel(0);
  }, []);

  const toggleMic = useCallback(async () => {
    const room = roomRef.current;
    if (!room || room.state !== "connected") return;

    const next = !room.localParticipant.isMicrophoneEnabled;
    await room.localParticipant.setMicrophoneEnabled(next);
    useVoiceStore.getState().setMicEnabled(next);

    // Also toggle speech recognition
    if (speechRef.current) {
      if (next) {
        try { speechRef.current.start(); } catch (e) {}
      } else {
        try { speechRef.current.stop(); } catch (e) {}
      }
    }
  }, []);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    connect,
    disconnect,
    toggleMic,
    isConnecting,
    audioContainerRef,
  };
}
