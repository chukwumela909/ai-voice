# Voice AI Agent — Product Requirements Document

> **For Hermes:** Use `subagent-driven-development` skill to implement this plan task-by-task.
> **Created:** 2026-05-05 | **Target:** Sub-1-second end-to-end voice response

---

## 1. Executive Summary

Build an ultra-low-latency voice AI agent using **LiveKit** for real-time WebRTC audio transport and a **Python streaming pipeline** on a Vast.ai RTX 4090. The system streams audio from the browser → VAD (GPU-accelerated Silero) → Deepgram STT → Groq LLM → Cartesia TTS → back to the browser, with first audio playing within **~400-900ms** of the user stopping speech.

**Key innovation:** GPU-accelerated Silero VAD on the RTX 4090 for real-time voice activity detection, feeding a continuous streaming pipeline where each component emits output as soon as the first chunk is ready.

---

## 2. Goals & Non-Goals

### Goals
- [ ] End-to-end latency: **< 1 second** from user stops speaking to first audio heard
- [ ] Streaming TTS: first audio chunk plays while rest is still generating
- [ ] Streaming LLM: Groq returns first tokens immediately (no waiting for full response)
- [ ] Interruption handling: user can speak while AI speaks; AI stops immediately
- [ ] GPU VAD: Silero VAD runs on RTX 4090 for fast endpointing
- [ ] Works in Chrome/Firefox desktop + mobile

### Non-Goals
- [ ] Video support (audio-only)
- [ ] Multi-user rooms (single user + single agent)
- [ ] Persistent conversation history (in-memory only)
- [ ] Offline mode (requires all cloud APIs)
- [ ] Custom voice cloning (use fixed Cartesia "Sarah" voice)

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BROWSER (Next.js)                                │
│  ┌──────────────┐    ┌──────────────┐    ┌─────────────────────────────────┐   │
│  │ getUserMedia │───▶│ LiveKit SDK  │───▶│ WebRTC: publish mic audio     │   │
│  │ Audio capture│    │ (livekit-    │    │ subscribe agent audio track   │   │
│  │ 48kHz PCM    │    │  client)     │    │ attach to <audio> element     │   │
│  └──────────────┘    └──────────────┘    └─────────────────────────────────┘   │
│                            │                              ▲                    │
│                            │ WebRTC (UDP)                 │                    │
└────────────────────────────┼──────────────────────────────┼────────────────────┘
                             │                              │
                             ▼                              │
┌─────────────────────────────────────────────────────────────────────────────┐
│                           LIVEKIT SERVER (Dokploy)                            │
│                    Self-hosted SFU at wss://livekit...                        │
│                          Routes audio tracks                                  │
└─────────────────────────────────────────────────────────────────────────────┘
                             │                              ▲
                             │ WebRTC (UDP)                 │
                             ▼                              │
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PYTHON AGENT (Vast.ai RTX 4090)                       │
│                                                                              │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐ │
│  │ LiveKit  │──▶│ Silero   │──▶│ Deepgram │──▶│ Groq LLM │──▶│ Cartesia │ │
│  │ Input    │   │ VAD      │   │ STT      │   │ (stream) │   │ TTS      │ │
│  │ Transport│   │ (GPU)    │   │ (stream) │   │          │   │ (stream) │ │
│  └──────────┘   └──────────┘   └──────────┘   └──────────┘   └──────────┘ │
│        ▲                                                          │        │
│        │                    LiveKit Output Transport                │        │
│        └────────────────────────────────────────────────────────────┘        │
│                                                                              │
│  GPU utilization: Silero VAD inference (5-10% GPU)                           │
│  No local LLM (Groq API over Internet)                                     │
│  No local TTS (Cartesia API over Internet)                                 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Latency Budget (Target: < 1s)

| Stage | Time | Notes |
|-------|------|-------|
| Audio capture → LiveKit | 20-50 ms | WebRTC encoder, minimal buffering |
| LiveKit → Agent (UDP) | 20-80 ms | Internet RTT to Vast.ai |
| **Silero VAD** | **30-100 ms** | **GPU-accelerated, ~5ms inference** |
| VAD endpointing (silence detect) | 150-300 ms | 300ms silence = user stopped speaking |
| **Deepgram STT (streaming)** | **100-250 ms** | First transcript chunk |
| **Groq LLM (TTFT)** | **30-100 ms** | First token from llama-3.1-8b |
| LLM token generation (short response) | 50-200 ms | 1-2 sentences = ~30-60 tokens |
| **Cartesia TTS (first chunk)** | **50-150 ms** | Streaming mode, first audio bytes |
| TTS remainder | 100-300 ms | Streaming while playing |
| Agent → LiveKit (UDP) | 20-80 ms | Downlink |
| LiveKit → Browser | 20-50 ms | WebRTC decoder |
| Browser audio playback | 10-30 ms | Buffering |
| **TOTAL** | **~400–900 ms** | Worst case still < 1s |

**Critical path:** VAD endpointing (300ms silence) is the largest single contributor. Everything after that is pipelined and streaming.

---

## 5. Component Deep Dive

### 5.1 Browser Client (Next.js + LiveKit Client SDK)

**Responsibilities:**
- Capture microphone audio via `getUserMedia()`
- Connect to LiveKit room using `livekit-client`
- Publish audio track (48kHz, mono, PCM via Opus)
- Subscribe to agent's audio track and play it
- Handle browser autoplay policy (requires user click)

**Files:**
- `src/components/voice/VoiceInterface.tsx` — UI (mic button, visualizer, transcript)
- `src/hooks/useLiveKitVoice.ts` — LiveKit connection, audio tracks, speech state

**Key behavior:**
- User clicks "Start Call" → joins LiveKit room `voice-ai`
- Microphone immediately enabled
- Agent joins automatically (server-side worker)
- Audio playback via `HTMLAudioElement` with `autoplay=true` (needs user gesture)

### 5.2 LiveKit Server (Self-Hosted on Dokploy)

**Already running at:** `wss://livekit-livekit.amenviron.app/`

**No changes needed.** SFU routes audio tracks between browser and agent.

### 5.3 Python Agent (Vast.ai RTX 4090)

**Responsibilities:**
1. Connect to LiveKit room via `livekit`
2. Subscribe to user's audio track
3. Run **Silero VAD** (GPU) on incoming audio chunks
4. When speech detected → buffer audio → stream to **Deepgram STT**
5. When silence detected → send transcript to **Groq LLM** (streaming)
6. Stream LLM tokens to **Cartesia TTS** (streaming)
7. Publish TTS audio chunks back to LiveKit room

**Files:**
- `python-agent/agent.py` — Main agent with streaming pipeline
- `python-agent/vad.py` — Silero VAD wrapper with GPU support
- `python-agent/requirements.txt` — Dependencies
- `python-agent/Dockerfile` — Container build

#### 5.3.1 Silero VAD on GPU

**Why GPU matters:**
- Silero VAD on CPU: ~50-100ms inference per 30ms audio chunk
- Silero VAD on GPU (RTX 4090): **~3-5ms inference per chunk**
- For a 2-second utterance: CPU VAD adds 100-300ms latency; GPU VAD adds 6-10ms

**Implementation:**
```python
import torch
from silero_vad import load_silero_vad, get_speech_timestamps

# Load model ONCE at startup
model = load_silero_vad()
model = model.cuda()  # Move to GPU

# Process audio chunk
def is_speech(audio_chunk: np.ndarray) -> bool:
    tensor = torch.from_numpy(audio_chunk).cuda()
    with torch.no_grad():
        speech_prob = model(tensor, SAMPLE_RATE).item()
    return speech_prob > 0.5
```

**Challenges & Mitigations:**
- **Challenge:** Silero VAD model is small; moving to GPU may not be faster if data transfer overhead dominates
- **Mitigation:** Batch multiple chunks, keep tensor on GPU between calls, use `torch.cuda.Stream`
- **Challenge:** GPU memory is limited (24GB on RTX 4090, but VAD uses only ~100MB)
- **Mitigation:** No problem — VAD is tiny
- **Challenge:** RTX 4090 on Vast.ai may have driver/CUDA issues
- **Mitigation:** Verify `torch.cuda.is_available()` on startup; fall back to CPU if GPU fails

#### 5.3.2 Streaming Deepgram STT

**API:** `wss://api.deepgram.com/v1/listen`

**Why streaming matters:**
- Non-streaming: record audio → HTTP POST → wait for full transcript
- Streaming: send audio chunks via WebSocket → receive partial transcripts in real-time
- First word transcript: **~100-250ms** after speech starts

**Implementation:**
```python
import websockets
import json

async def stream_stt(audio_queue: asyncio.Queue):
    async with websockets.connect(
        "wss://api.deepgram.com/v1/listen?model=nova-2&encoding=linear16&sample_rate=48000&channels=1&interim_results=true&endpointing=300",
        extra_headers={"Authorization": f"Token {DEEPGRAM_KEY}"}
    ) as ws:
        # Send audio chunks as they arrive
        async def sender():
            while True:
                chunk = await audio_queue.get()
                if chunk is None:
                    break
                await ws.send(chunk)
        
        # Receive transcripts
        async def receiver():
            async for msg in ws:
                data = json.loads(msg)
                if data.get("is_final"):
                    return data["channel"]["alternatives"][0]["transcript"]
```

**Critical config:**
- `endpointing=300` — 300ms silence = user stopped speaking (triggers final transcript)
- `interim_results=true` — Show partial transcripts (not used for LLM, only UX)
- `encoding=linear16` — 16-bit PCM (what LiveKit delivers)
- `sample_rate=48000` — LiveKit default sample rate

#### 5.3.3 Streaming Groq LLM

**API:** `https://api.groq.com/openai/v1/chat/completions` with `stream=true`

**Why streaming matters:**
- Non-streaming: wait for full LLM response → then send to TTS
- Streaming: receive first token ~30ms → immediately send to TTS
- TTS can start speaking while LLM is still generating

**Implementation:**
```python
import httpx

async def stream_llm(text: str, history: list) -> AsyncGenerator[str, None]:
    async with httpx.AsyncClient() as client:
        async with client.stream(
            "POST",
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {GROQ_KEY}"},
            json={
                "model": "llama-3.1-8b-instant",
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    *history,
                    {"role": "user", "content": text},
                ],
                "stream": True,
                "max_tokens": 128,
            },
            timeout=30.0,
        ) as response:
            async for line in response.aiter_lines():
                if line.startswith("data: "):
                    data = json.loads(line[6:])
                    delta = data["choices"][0]["delta"].get("content", "")
                    if delta:
                        yield delta
```

**Sentence-level buffering:**
- We don't send every token to TTS (too choppy)
- Buffer tokens until a sentence boundary (`.`, `!`, `?`) or ~50 chars
- Then send the buffered sentence to Cartesia
- This gives TTS enough context for natural prosody

#### 5.3.4 Streaming Cartesia TTS

**API:** `wss://api.cartesia.ai/tts/stream` (WebSocket streaming)

**Why streaming matters:**
- Non-streaming: send full text → wait for full MP3 → play
- Streaming: send text → receive audio chunks as they generate → play immediately
- First audio chunk: **~50-150ms**

**Implementation:**
```python
async def stream_tts(text_iterator: AsyncGenerator[str, None]):
    async with websockets.connect(
        "wss://api.cartesia.ai/tts/stream",
        extra_headers={"Cartesia-Version": "2024-06-30", "X-API-Key": CARTESIA_KEY},
    ) as ws:
        # Send voice config
        await ws.send(json.dumps({
            "model_id": "sonic",
            "voice": {"mode": "id", "id": VOICE_ID},
            "output_format": {"container": "raw", "encoding": "pcm_s16le", "sample_rate": 24000},
        }))
        
        # Stream text as it arrives from LLM
        async for text_chunk in text_iterator:
            await ws.send(json.dumps({"transcript": text_chunk, "continue": True}))
        
        # Signal end of text
        await ws.send(json.dumps({"transcript": "", "continue": False}))
        
        # Receive audio chunks
        async for msg in ws:
            data = json.loads(msg)
            if "audio" in data:
                yield base64.b64decode(data["audio"])
```

**Output format:** `raw` PCM (not MP3)
- MP3 encoding adds ~50-100ms latency (encoder delay)
- Raw PCM can be played immediately via WebRTC
- LiveKit handles resampling from 24kHz to 48kHz

### 5.4 Pipeline Orchestration

The agent runs an **async pipeline** connecting all components:

```python
async def run_pipeline(room: rtc.Room):
    # 1. Subscribe to user's audio track
    user_track = await wait_for_user_audio(room)
    
    # 2. Start VAD + STT streaming
    audio_queue = asyncio.Queue()
    stt_task = asyncio.create_task(stream_stt(audio_queue))
    
    # 3. Process audio chunks
    async for pcm_chunk in user_track:
        is_speech = vad.is_speech(pcm_chunk)  # GPU, ~5ms
        
        if is_speech:
            await audio_queue.put(pcm_chunk)
        else:
            # Check if we had speech before (endpointing)
            if vad.just_ended_speech():
                transcript = await stt_task  # Get final transcript
                
                # 4. Stream LLM → TTS
                llm_stream = stream_llm(transcript, history)
                tts_stream = stream_tts(sentence_buffer(llm_stream))
                
                # 5. Publish audio back to LiveKit
                async for audio_chunk in tts_stream:
                    await publish_audio(room, audio_chunk)
                
                # 6. Restart STT for next utterance
                stt_task = asyncio.create_task(stream_stt(audio_queue))
```

---

## 6. VAD on GPU — Detailed Design

### 6.1 Why We Need GPU VAD

| Metric | CPU (AMD EPYC) | GPU (RTX 4090) | Difference |
|--------|---------------|----------------|------------|
| Inference per 30ms chunk | ~50-100ms | ~3-5ms | **10-20x faster** |
| 2-second utterance total | ~200-400ms | ~12-20ms | **~20x faster** |
| Batch processing (100 chunks) | ~5-10s | ~50-100ms | **~100x faster** |

The VAD runs on EVERY audio chunk ( LiveKit delivers ~50 chunks/second at 48kHz). CPU VAD can't keep up without dropping frames or adding buffering latency.

### 6.2 Silero VAD GPU Integration

**File:** `python-agent/vad.py`

```python
import torch
import numpy as np
from typing import Optional
import collections

class GPUVAD:
    """Silero VAD accelerated on RTX 4090."""
    
    def __init__(self, sample_rate: int = 48000):
        self.sample_rate = sample_rate
        self.chunk_samples = int(sample_rate * 0.03)  # 30ms chunks
        
        # Load Silero VAD
        self.model, utils = torch.hub.load(
            repo_or_dir="snakers4/silero-vad",
            model="silero_vad",
            force_reload=False,
            onnx=False,
        )
        self.model = self.model.cuda().eval()
        
        # State for streaming VAD
        self._h = torch.zeros(2, 1, 64).cuda()
        self._c = torch.zeros(2, 1, 64).cuda()
        self._buffer = collections.deque(maxlen=10)  # 300ms buffer
        self._speech_started = False
        self._silence_frames = 0
        
        # Config
        self.threshold = 0.5
        self.silence_frames_for_end = 10  # 300ms silence = end of speech
    
    def process_chunk(self, pcm: np.ndarray) -> dict:
        """Process a 30ms PCM chunk. Returns speech state."""
        # Convert to tensor and move to GPU
        tensor = torch.from_numpy(pcm).float().cuda()
        
        # Run VAD inference
        with torch.no_grad():
            speech_prob, self._h, self._c = self.model(
                tensor, self.sample_rate, self._h, self._c
            )
        
        prob = speech_prob.item()
        is_speech = prob > self.threshold
        
        # Track state
        if is_speech:
            self._silence_frames = 0
            if not self._speech_started:
                self._speech_started = True
                return {"event": "speech_start", "prob": prob}
        else:
            self._silence_frames += 1
            if self._speech_started and self._silence_frames >= self.silence_frames_for_end:
                self._speech_started = False
                return {"event": "speech_end", "prob": prob}
        
        return {"event": "continue", "is_speech": is_speech, "prob": prob}
    
    def reset(self):
        """Reset VAD state for new utterance."""
        self._h = torch.zeros(2, 1, 64).cuda()
        self._c = torch.zeros(2, 1, 64).cuda()
        self._speech_started = False
        self._silence_frames = 0
```

### 6.3 Fallback Strategy

If GPU fails (CUDA not available, out of memory):
```python
try:
    vad = GPUVAD()
    print("[VAD] Using GPU-accelerated Silero")
except Exception as e:
    print(f"[VAD] GPU failed ({e}), falling back to CPU")
    vad = CPUVAD()  # Simpler CPU version with larger chunks
```

### 6.4 Expected GPU Utilization

- Silero VAD: ~5-10% GPU (very small model)
- Most of the GPU sits idle (we're not using it for LLM or TTS)
- This is fine — the GPU's value here is **latency reduction**, not throughput
- Alternative: Could also run Deepgram STT on GPU if we used a local Whisper model, but Groq is faster for STT than local Whisper on RTX 4090

---

## 7. File-by-File Implementation Plan

### Phase 1: Infrastructure (Tasks 1-3)

#### Task 1: Create `python-agent/` directory structure
**Files:**
- Create: `python-agent/requirements.txt`
- Create: `python-agent/.env.example`
- Create: `python-agent/Dockerfile`

```text
# requirements.txt
livekit>=0.18.0
livekit-agents>=0.12.0,<1.0.0
websockets>=12.0
httpx>=0.27.0
torch>=2.0.0
torchaudio>=2.0.0
numpy>=1.26.0
python-dotenv>=1.0.0
```

```bash
# .env.example
LIVEKIT_URL=wss://livekit-livekit.amenviron.app/
LIVEKIT_API_KEY=your_key
LIVEKIT_API_SECRET=your_secret
DEEPGRAM_API_KEY=your_key
GROQ_API_KEY=your_key
CARTESIA_API_KEY=your_key
```

#### Task 2: Create VAD module with GPU support
**Files:**
- Create: `python-agent/vad.py`
- Create: `python-agent/test_vad.py`

**Verification:**
```bash
python3 -c "from vad import GPUVAD; v = GPUVAD(); print('GPU VAD loaded:', v.model.device)"
# Expected: GPU VAD loaded: cuda:0
```

#### Task 3: Create streaming STT module
**Files:**
- Create: `python-agent/stt.py`

**Verification:**
```bash
python3 test_stt.py
# Expected: Connected to Deepgram, received test transcript
```

### Phase 2: Core Pipeline (Tasks 4-6)

#### Task 4: Create streaming LLM module
**Files:**
- Create: `python-agent/llm.py`

**Verification:**
```bash
python3 -c "import asyncio; from llm import stream_llm; 
async def test(): 
    async for chunk in stream_llm('Hello', []): 
        print(chunk, end='')
asyncio.run(test())"
# Expected: Hello! How can I help you today?
```

#### Task 5: Create streaming TTS module
**Files:**
- Create: `python-agent/tts.py`

**Verification:**
```bash
python3 -c "import asyncio; from tts import stream_tts; 
async def test(): 
    async for chunk in stream_tts(['Hello', ' world']): 
        print(f'Audio chunk: {len(chunk)} bytes')
asyncio.run(test())"
# Expected: Audio chunk: 4800 bytes (etc.)
```

#### Task 6: Create main agent with pipeline orchestration
**Files:**
- Create: `python-agent/agent.py`

**Verification:**
```bash
cd python-agent && python3 agent.py --test-mode
# Expected: [Agent] Starting in test mode...
#           [VAD] GPU available: True
#           [STT] Deepgram connected
#           [LLM] Groq available
#           [TTS] Cartesia connected
```

### Phase 3: Frontend Updates (Tasks 7-8)

#### Task 7: Update Next.js frontend for LiveKit-only (no HTTP)
**Files:**
- Modify: `src/hooks/useLiveKitVoice.ts` — Simplify to just LiveKit connection
- Delete: `src/hooks/useVoiceConversation.ts` (replaced)
- Delete: `src/app/api/voice/chat/route.ts` (no longer needed)
- Delete: `src/app/api/voice/greet/route.ts` (no longer needed)

**Key changes:**
- Remove all HTTP fetch logic
- Remove SpeechRecognition (no longer needed — Deepgram handles STT)
- Keep LiveKit room join, audio track publish/subscribe
- Add transcript display from data messages

#### Task 8: Update VoiceInterface component
**Files:**
- Modify: `src/components/voice/VoiceInterface.tsx`

**Changes:**
- "Start Call" button joins LiveKit room
- No more "Thinking..." states (streaming is continuous)
- Visualizer shows both user + agent audio levels
- Transcript shows real-time STT output + LLM responses

### Phase 4: Integration & Testing (Tasks 9-10)

#### Task 9: End-to-end test on Vast.ai
**Steps:**
1. SSH to Vast.ai instance
2. Install dependencies: `pip install -r requirements.txt`
3. Set environment variables
4. Run: `python3 agent.py`
5. Open browser frontend
6. Click "Start Call"
7. Speak → verify audio response within 1 second

#### Task 10: Latency benchmarking
**Script:** `python-agent/benchmark.py`

Measures:
- VAD latency (chunk processing time)
- STT latency (speech end → first transcript)
- LLM latency (transcript → first token)
- TTS latency (text → first audio chunk)
- End-to-end (speech end → first audio heard)

**Target:** End-to-end < 1s (measured over 10 utterances)

---

## 8. API Keys & Environment

| Service | Key | Used By | Storage |
|---------|-----|---------|---------|
| LiveKit | `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | Agent + Frontend | `.env` (both) |
| Deepgram | `DEEPGRAM_API_KEY` | Agent STT | `.env` (agent only) |
| Groq | `GROQ_API_KEY` | Agent LLM | `.env` (agent only) |
| Cartesia | `CARTESIA_API_KEY` | Agent TTS | `.env` (agent only) |

**Security:**
- Frontend LiveKit token is short-lived (generated by backend `/api/token`)
- AI API keys NEVER sent to browser
- `.env` files in `.gitignore`

---

## 9. Error Handling & Edge Cases

| Scenario | Handling |
|----------|----------|
| GPU not available | Fall back to CPU VAD with larger chunks (~2x latency) |
| Deepgram disconnect | Reconnect with exponential backoff; buffer audio |
| Groq rate limit | Retry after 1s; queue utterances |
| Cartesia disconnect | Reconnect; buffer LLM tokens |
| User speaks during AI speech | VAD detects new speech → interrupt TTS stream → start new pipeline |
| Browser refreshes mid-call | Agent detects participant left → resets state → ready for rejoin |
| LiveKit server down | Agent retries connection; frontend shows "Reconnecting..." |
| Audio track fails | Retry publish/subscribe; log error |

---

## 10. Testing Strategy

### Unit Tests
- `test_vad.py`: GPU/CPU VAD accuracy, speech start/end detection
- `test_stt.py`: Deepgram connection, transcript accuracy
- `test_llm.py`: Groq streaming, sentence buffering
- `test_tts.py`: Cartesia streaming, audio chunk validity

### Integration Tests
- `test_pipeline.py`: Full pipeline with mock audio file
- `test_livekit.py`: Room join, track publish/subscribe

### Manual Tests
1. **Latency test:** Speak "What time is it?" → measure response time
2. **Interruption test:** Let AI speak, then say "Stop" → AI should stop immediately
3. **Long utterance test:** Speak 5 sentences → verify full response
4. **Noise test:** Play background music → verify VAD doesn't trigger falsely
5. **Reconnect test:** Refresh browser → verify agent rejoins and works

---

## 11. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Vast.ai GPU unavailable | Medium | HIGH | Fallback to CPU VAD; accept ~2x latency |
| Deepgram streaming API changes | Low | MEDIUM | Use stable `nova-2` model; pin API version |
| Cartesia streaming unstable | Low | MEDIUM | Fallback to non-streaming for single utterance |
| LiveKit SDK version mismatch | Medium | HIGH | Pin `livekit-agents>=0.12.0,<1.0.0` |
| Browser autoplay blocks audio | High | LOW | User clicks "Start Call" first (required gesture) |
| Network jitter between Vast.ai ↔ LiveKit | Medium | MEDIUM | Use UDP (WebRTC); tolerate packet loss |
| Silero VAD GPU overhead not worth it | Low | LOW | Benchmark CPU vs GPU; keep whichever is faster |

---

## 12. Deployment Plan

### Vast.ai (Agent)
1. SSH into instance
2. `git clone https://github.com/chukwumela909/ai-voice.git`
3. `cd ai-voice/python-agent`
4. `pip install -r requirements.txt`
5. Create `.env` with API keys
6. `python3 agent.py`
7. Run in background: `nohup python3 agent.py > agent.log 2>&1 &`

### Dokploy (Frontend)
1. Already deployed as `ai-voice` Next.js app
2. Update environment variables if needed
3. Redeploy after pushing frontend changes

### Monitoring
- Agent logs: `tail -f /root/ai-voice/python-agent/agent.log`
- Latency metrics: `python-agent/benchmark.py --continuous`
- GPU usage: `nvidia-smi` (should show ~5-10% when active)

---

## 13. Success Criteria

- [ ] End-to-end latency **< 1 second** for 90% of utterances
- [ ] First audio chunk plays within 500ms of speech end
- [ ] Interruption handling works (user can cut off AI)
- [ ] 10-minute conversation without agent crash
- [ ] GPU VAD active and faster than CPU fallback
- [ ] Streaming pipeline produces audio continuously (no gaps > 200ms)
- [ ] Frontend works on Chrome, Firefox, Safari desktop

---

## 14. Open Questions

1. **Should we use Cartesia's `sonic-2` model instead of `sonic`?** (Sonic-2 claims lower latency)
2. **Should we use Deepgram's `nova-2-general` or `nova-2-meeting` model?**
3. **Do we need echo cancellation?** (LiveKit may handle this; test first)
4. **Should we run a local Whisper model on the RTX 4090 instead of Deepgram API?** (Trade: latency vs accuracy vs cost)

---

## 15. Appendix: Benchmark Target

| Metric | Baseline (Current HTTP) | Target (This PRD) |
|--------|------------------------|-------------------|
| Speech end → STT transcript | 2-4s | 200-500ms |
| STT → LLM first token | 1-2s | 50-150ms |
| LLM → TTS first audio | 2-4s | 100-300ms |
| TTS → Browser playback | 500ms-1s | 50-100ms |
| **End-to-end** | **5-10s** | **~400-900ms** |

---

*PRD complete. Ready for implementation via subagent-driven-development.*
