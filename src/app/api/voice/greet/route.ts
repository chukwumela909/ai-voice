import { NextResponse } from "next/server";

const CARTESIA_API_KEY = process.env.CARTESIA_API_KEY!;
const VOICE_ID = "a0e99841-438c-4a64-b679-ae501e7d6091";

export async function GET() {
  try {
    const greeting = "Hi there! I'm your AI voice assistant. How can I help you today?";

    const ttsRes = await fetch("https://api.cartesia.ai/tts/bytes", {
      method: "POST",
      headers: {
        "Cartesia-Version": "2024-06-30",
        "X-API-Key": CARTESIA_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model_id: "sonic",
        transcript: greeting,
        voice: { mode: "id", id: VOICE_ID },
        output_format: {
          container: "mp3",
          sample_rate: 24000,
          encoding: "mp3",
        },
      }),
    });

    if (!ttsRes.ok) {
      const err = await ttsRes.text();
      return NextResponse.json({ error: `Cartesia: ${err}` }, { status: 502 });
    }

    const audioBuffer = await ttsRes.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString("base64");

    return NextResponse.json({
      greeting,
      audio_base64: audioBase64,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
