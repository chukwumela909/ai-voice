import { create } from "zustand";

export interface Transcript {
  id: string;
  role: "user" | "agent";
  text: string;
  timestamp: number;
}

interface VoiceState {
  status: "idle" | "connecting" | "connected" | "disconnecting" | "error";
  isMicEnabled: boolean;
  isSpeaking: boolean;
  isAgentSpeaking: boolean;
  userAudioLevel: number;
  agentAudioLevel: number;
  error: string | null;
  transcripts: Transcript[];
  setStatus: (status: VoiceState["status"]) => void;
  setMicEnabled: (enabled: boolean) => void;
  setSpeaking: (speaking: boolean) => void;
  setAgentSpeaking: (speaking: boolean) => void;
  setUserAudioLevel: (level: number) => void;
  setAgentAudioLevel: (level: number) => void;
  setError: (error: string | null) => void;
  addTranscript: (transcript: Omit<Transcript, "id" | "timestamp">) => void;
  clearTranscripts: () => void;
}

export const useVoiceStore = create<VoiceState>((set) => ({
  status: "idle",
  isMicEnabled: false,
  isSpeaking: false,
  isAgentSpeaking: false,
  userAudioLevel: 0,
  agentAudioLevel: 0,
  error: null,
  transcripts: [],
  setStatus: (status) => set({ status, error: status === "error" ? null : undefined }),
  setMicEnabled: (isMicEnabled) => set({ isMicEnabled }),
  setSpeaking: (isSpeaking) => set({ isSpeaking }),
  setAgentSpeaking: (isAgentSpeaking) => set({ isAgentSpeaking }),
  setUserAudioLevel: (userAudioLevel) => set({ userAudioLevel }),
  setAgentAudioLevel: (agentAudioLevel) => set({ agentAudioLevel }),
  setError: (error) => set({ error, status: error ? "error" : "idle" }),
  addTranscript: (t) =>
    set((state) => ({
      transcripts: [
        ...state.transcripts,
        {
          ...t,
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          timestamp: Date.now(),
        },
      ],
    })),
  clearTranscripts: () => set({ transcripts: [] }),
}));
