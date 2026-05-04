# LiveKit Voice AI â€” Agent Build Brief

## Overview

This project uses a **self-hosted LiveKit** server for real-time WebRTC audio transport. The Next.js client handles the browser side (microphone input + AI audio playback). **You will build the Python agent** that acts as the "brain" â€” consuming the user's audio, transcribing it, sending it to an LLM, and streaming synthesized speech back into the same LiveKit room.

```
Browser (Next.js)           LiveKit Server               Python Agent
     |                             |                             |
  Mic Audio ----WebRTC---->   SFU Routes Audio ------->  Agent Subscribes
                                                            |
                                                      [Deepgram STT]
                                                            â†“
                                                      [Groq LLM]
                                                            â†“
                                                      [Cartesia TTS]
                                                            |
  Agent Audio <----WebRTC----  SFU Routes Audio <------- Publishes
```

## Stack

| Layer | Technology |
|-------|-----------|
| Transport | LiveKit (self-hosted) |
| STT | Deepgram Nova-2 (streaming) |
| LLM | Groq (`llama-3.1-8b-instant` or your choice) |
| TTS | Cartesia Sonic (streaming) |
| Agent Framework | `livekit-agents` (Python) |

## Required Environment Variables

Create a `.env` file on your VPS or pass these into the Dokploy container:

```bash
# LiveKit Server
LIVEKIT_URL=wss://livekit-livekit.amenviron.app/
LIVEKIT_API_KEY=your_api_key
LIVEKIT_API_SECRET=your_api_secret

# AI Services
DEEPGRAM_API_KEY=your_deepgram_key
GROQ_API_KEY=your_groq_key
CARTESIA_API_KEY=your_cartesia_key
```

## Python Agent Scaffold

Create the following files inside the `python-agent/` directory in this repository (already scaffolded):

```
ai-voice/python-agent/
â”œâ”€â”€ agent.py
â”œâ”€â”€ Dockerfile
â”œâ”€â”€ docker-compose.yml
â”œâ”€â”€ requirements.txt
â””â”€â”€ .env.example
```

### `requirements.txt`

```text
livekit-agents>=0.12.0
livekit-plugins-deepgram>=0.6.0
livekit-plugins-cartesia>=0.4.0
livekit-plugins-openai>=0.10.0
livekit-plugins-silero>=0.7.0
python-dotenv>=1.0.0
```

### `agent.py`

```python
import os
import logging

from livekit.agents import (
    AutoSubscribe,
    JobContext,
    JobRequest,
    WorkerOptions,
    cli,
)
from livekit.agents.voice import VoicePipelineAgent
from livekit.agents.voice.audio_recorder import AudioRecorder
from livekit.plugins import deepgram, cartesia
from livekit.plugins.openai import llm as openai_llm

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("voice-agent")


async def entrypoint(ctx: JobContext):
    """Called when the agent receives a job (someone joined the room)."""
    logger.info(f"Starting agent for room {ctx.room.name}")

    # Connect to room, auto-subscribe to audio tracks
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)

    # Wait for at least one participant (the user) to join before configuring pipelines
    participant = await ctx.wait_for_participant()
    logger.info(f"Participant joined: {participant.identity}")

    # Configure the voice pipeline
    agent = VoicePipelineAgent(
        vad=ctx.proc.userdata.get("vad"),  # Silero VAD (preloaded in prewarm)
        stt=deepgram.STT(api_key=os.environ["DEEPGRAM_API_KEY"]),
        llm=openai_llm.LLM(
            api_key=os.environ["GROQ_API_KEY"],
            base_url="https://api.groq.com/openai/v1",
            model="llama-3.1-8b-instant",
        ),
        tts=cartesia.TTS(api_key=os.environ["CARTESIA_API_KEY"]),
        chat_ctx=None,  # Optional: warm-up system prompt
    )

    # Start listening and responding
    agent.start(ctx.room, participant)

    # Optional: pre-warm TTS to reduce first-chunk latency
    agent.tts.stream("Hello! I'm ready to chat.")

    logger.info("Agent is now running.")


async def prewarm(proc):
    """Preload heavy models before accepting jobs."""
    from livekit.plugins import silero
    proc.userdata["vad"] = silero.VAD.load()


async def request_fnc(req: JobRequest):
    """Accept any job request to the worker."""
    await req.accept(entrypoint)


if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            request_fnc=request_fnc,
            prewarm_fnc=prewarm,
        )
    )
```

### `Dockerfile`

```dockerfile
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libportaudio2 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY agent.py .
COPY .env .

CMD ["python", "agent.py"]
```

### `docker-compose.yml`

Add this service to your existing Dokploy `docker-compose.yml` (the one running LiveKit), or use the `docker-compose.yml` in `python-agent/` as a standalone snippet:

```yaml
services:
  # ... your existing livekit, redis, turn, ingress services ...

  agent:
    build:
      context: ./python-agent
      dockerfile: Dockerfile
    container_name: livekit-agent
    restart: unless-stopped
    env_file:
      - ./python-agent/.env
    networks:
      - livekit-network          # Must be same network as LiveKit server
    depends_on:
      - livekit
```

> **Critical:** The agent container **must share the same Docker network** as the LiveKit server. In Dokploy, this is usually `livekit-network` or whatever `docker network ls` shows. If the agent cannot resolve the LiveKit container by hostname, use the Docker bridge gateway IP or the public `traefik.me` domain.

## Deployment Steps (from your local machine to your VPS)

Since the `python-agent/` folder is currently on your local Windows machine, you need to copy the files to your VPS before Dokploy can build the container.

### 1. Get your VPS SSH credentials from Dokploy
- Log into your Dokploy dashboard → go to your **Server** → look for the **IP address** and **SSH key / root password**.
- If you use an SSH key, note its path (e.g., `C:\Users\Amirize\.ssh\id_rsa`).

### 2. Copy the `python-agent/` folder to your VPS
Open **PowerShell** (or Git Bash / Terminal) on your local machine and run:

```powershell
# If using a password (you will be prompted for the root password):
scp -r "C:\Users\Amirize\Desktop\AI-voice\ai-voice\python-agent" root@<YOUR_VPS_IP>:~/ai-voice/

# If using an SSH key:
scp -r -i "C:\Users\Amirize\.ssh\id_rsa" "C:\Users\Amirize\Desktop\AI-voice\ai-voice\python-agent" root@<YOUR_VPS_IP>:~/ai-voice/
```

Replace `<YOUR_VPS_IP>` with your actual server IP (e.g., `185.209.230.171`).

**What this does:** It copies the entire `python-agent/` directory from your local `Desktop/AI-voice/ai-voice/` to the `~/ai-voice/` directory on your VPS.

### 3. SSH into your VPS
Still in PowerShell:

```powershell
ssh root@<YOUR_VPS_IP>
# or with SSH key:
ssh -i "C:\Users\Amirize\.ssh\id_rsa" root@<YOUR_VPS_IP>
```

Once you are logged into the VPS, your terminal prompt will change (e.g., `root@my-vps:~#`).

### 4. Create the environment file on the VPS
Inside the SSH session:

```bash
cd ~/ai-voice/python-agent
cp .env.example .env
nano .env
```

Fill in your real secrets:
```bash
LIVEKIT_URL=wss://livekit-livekit.amenviron.app/
LIVEKIT_API_KEY=your_real_key
LIVEKIT_API_SECRET=your_real_secret
DEEPGRAM_API_KEY=your_real_key
GROQ_API_KEY=your_real_key
CARTESIA_API_KEY=your_real_key
```
Save and exit nano: `Ctrl+O`, `Enter`, `Ctrl+X`.

### 5. Add the agent to your existing Dokploy Docker Compose stack
Still inside the SSH session, navigate to the Dokploy project directory that already contains your LiveKit `docker-compose.yml` (for example: `/opt/dokploy/livekit/` or wherever Dokploy deployed it). You can locate it by listing Dokploy project directories:

```bash
find /opt -name "docker-compose.yml" 2>/dev/null | head -20
```

Open that `docker-compose.yml` in an editor (e.g., `nano`) and paste the agent service block from the snippet below under the existing `services:` section.

```yaml
  agent:
    build:
      context: ~/ai-voice/python-agent
      dockerfile: Dockerfile
    container_name: livekit-agent
    restart: unless-stopped
    env_file:
      - ~/ai-voice/python-agent/.env
    networks:
      - livekit-network
    depends_on:
      - livekit
```

**Important:** Make sure `livekit-network` is the exact network name already used by your LiveKit container. Verify with:
```bash
docker network ls
```
If it is named differently (e.g., `livekit_default`), update the `networks:` line accordingly.

### 6. Build and start the agent
```bash
cd /opt/dokploy/livekit      # or wherever your docker-compose.yml lives
docker compose up --build -d agent
```

### 7. Verify it is running
```bash
docker ps | grep agent
docker logs -f livekit-agent
```

Expected output:
```
Preloading Silero VAD...
Starting agent for room: voice-room
Agent is now running and listening.
```

### 8. Test end-to-end
Go back to your local browser, open the Next.js client (`http://localhost:3000`), click **Start Call**, and speak. You should hear the AI respond within ~1 second.

## Expected Latency Budget

| Stage | Time |
|-------|------|
| Uplink (WebRTC) | 20â€“80 ms |
| VAD endpointing | 150â€“300 ms |
| Deepgram STT (streaming) | 100â€“250 ms |
| Groq LLM (`llama-3.1-8b-instant`, TTFT) | 30â€“100 ms |
| Cartesia Sonic (first audio chunk) | 50â€“150 ms |
| Downlink + Playback | 30â€“80 ms |
| **Total** | **~350 ms â€“ 900 ms** |

## Client â†” Agent Contract

The Next.js client and the Python agent do **not** share code. They only agree on:

| Contract | Value |
|----------|-------|
| Room name | The client joins `voice-room` by default. You can change this in `src/app/page.tsx`. The agent automatically joins whatever room the user is in. |
| Protocol | LiveKit WebRTC. The agent uses `auto_subscribe=AutoSubscribe.AUDIO_ONLY`. |
| Tracks | User publishes one audio track (microphone). Agent publishes one audio track (TTS output). |
| Identity | Client uses `user-XXXX`. You can filter on this in the agent if needed, but `VoicePipelineAgent` automatically targets the first human participant. |

## Verification Checklist

Before declaring the agent "done", verify:

- [ ] Agent container starts without Python import errors.
- [ ] Agent logs show `Starting agent for room ...` when the Next.js user clicks **Start Call**.
- [ ] Agent logs show `Participant joined: user-...`.
- [ ] You hear the synthesized voice from the browser speakers within ~1 second of finishing speech.
- [ ] When you speak, the agent does **not** cut you off (proper VAD endpointing).
- [ ] When you speak **while** the AI is speaking, the AI stops and yields (interruption handling â€” `VoicePipelineAgent` handles this by default via VAD).
- [ ] The browser does **not** show `Error` in the connection status badge.
- [ ] `docker logs -f livekit-agent` shows no red Python tracebacks.

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Agent never joins room | Container cannot reach LiveKit server | Check Docker network shared with LiveKit; verify `LIVEKIT_URL` is `wss://` not `ws://` |
| No audio heard | Browser autoplay policy | User must click **Start Call** first (browser requires user gesture to play audio). The Next.js client handles this. |
| Agent joins but no speech | Deepgram key invalid | Check `DEEPGRAM_API_KEY` is not expired; verify in Deepgram console |
| TTS is choppy/slow | Cartesia latency or Docker CPU limits | Ensure VPS has at least 2 vCPU; GPU is not required but helps for local alternatives |
| `livekit-agents` import error | Wrong Python version | Must be Python 3.11+; `3.12` is recommended |

## Next Steps After Agent Works

1. Add a **system prompt** to the `VoicePipelineAgent` to define personality.
2. Add **room metadata** or tokens to restrict agent access to authenticated users.
3. Consider **LiveKit Egress** if you want to record conversations.
4. Explore **livekit-plugins-silero** alternatives or custom VAD models for your use case.

---

*Generated by OpenCode â€” Session 1 (Next.js Client). The Python agent is intentionally decoupled and can be developed in a separate session.*
