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
} from "livekit-client";
import { useVoiceStore } from "@/lib/store";

export function useLiveKitVoice(roomName: string) {
  const roomRef = useRef<Room | null>(null);
  const audioContainerRef = useRef<HTMLDivElement | null>(null);
  const remoteAudioElements = useRef<Map<string, HTMLAudioElement>>(new Map());
  const levelIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [isConnecting, setIsConnecting] = useState(false);

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

      try {
        const res = await fetch("/api/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            room: roomName,
            identity: participantName || `user-${Math.floor(Math.random() * 10_000)}`,
          }),
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
              p.trackPublications.forEach((pub) => {
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

        levelIntervalRef.current = setInterval(() => {
          const local = room.localParticipant;
          useVoiceStore.getState().setUserAudioLevel(local.audioLevel ?? 0);
          useVoiceStore.getState().setSpeaking(local.isSpeaking ?? false);

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
          .setError(err instanceof Error ? err.message : "Unknown connection error");
        useVoiceStore.getState().setStatus("error");
      } finally {
        setIsConnecting(false);
      }
    },
    [roomName]
  );

  const disconnect = useCallback(() => {
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
    useVoiceStore.getState().setUserAudioLevel(0);
    useVoiceStore.getState().setAgentAudioLevel(0);
  }, []);

  const toggleMic = useCallback(async () => {
    const room = roomRef.current;
    if (!room || room.state !== "connected") return;

    const next = !room.localParticipant.isMicrophoneEnabled;
    await room.localParticipant.setMicrophoneEnabled(next);
    useVoiceStore.getState().setMicEnabled(next);
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
