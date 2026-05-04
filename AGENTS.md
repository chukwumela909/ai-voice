# AGENTS.md — AI Voice

## Next.js & React
- Next.js **16.2.4**, React **19.2.4**. APIs and conventions differ from Next.js 14 / React 18 training data. Before writing code, check the in-package reference docs at `node_modules/next/dist/docs/`.
- Uses the **App Router** (`src/app/`).

## Tailwind CSS v4
- Tailwind v4 (`tailwindcss@^4`, `@tailwindcss/postcss`). Do not use v3 patterns.
- Styling entrypoint: `src/app/globals.css` uses `@import "tailwindcss"` and `@theme inline`. No `tailwind.config.js`.
- PostCSS config: `postcss.config.mjs`.

## shadcn/ui
- Configured in `components.json`: style `base-nova`, RSC + TSX, CSS variables.
- Aliases: `ui` → `@/components/ui`, `utils` → `@/lib/utils`, `components` → `@/components`, `lib` → `@/lib`, `hooks` → `@/hooks`.
- Icons: `lucide-react`.

## Domain
- LiveKit packages are installed (`@livekit/components-react`, `livekit-client`, `livekit-server-sdk`). Build voice/RTC features on these.
- State: `zustand`.
- Backend agent scaffold exists in `python-agent/` (Python `livekit-agents` + Deepgram STT + Groq LLM + Cartesia TTS). Do not duplicate this unless intentionally replacing the stack.

## Tooling & Scripts
- ESLint uses flat config (`eslint.config.mjs`) via `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript`.
- Available commands: `dev`, `build`, `start`, `lint`. There is **no** `test` or `typecheck` script.
- Path alias: `@/*` → `./src/*`.

## Secrets & Environment
- `.env.local` is **gitignored**. You must create it manually. There is an `.env.local.example` in the project root with the expected keys (`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`).

## Backend Agent (Python)
- The Python LiveKit agent is in `python-agent/`.
- It runs as a Docker container (Dokploy) using `livekit-agents`, `livekit-plugins-deepgram`, `livekit-plugins-openai` (for Groq), and `livekit-plugins-cartesia`.
- See `AGENT-BRIEF.md` for full architecture, deployment steps, troubleshooting, and verification checklist.
