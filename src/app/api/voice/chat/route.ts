import { NextRequest, NextResponse } from "next/server";

const GROQ_API_KEY = process.env.GROQ_API_KEY!;
const CARTESIA_API_KEY = process.env.CARTESIA_API_KEY!;
const VOICE_ID = "a0e99841-438c-4a64-b679-ae501e7d6091";

const SYSTEM_PROMPT = `You are a friendly, helpful voice assistant. Keep responses concise (1-3 sentences), warm, and natural. Speak as if in a real conversation.`;

export async function POST(req: NextRequest) {
  try {
    const { text, history = [] } = await req.json();
    if (!text) {
      return NextResponse.json({ error: "Missing text" }, { status: 400 });
    }

    // Call Groq LLM
    const llmRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...history,
          { role: "user", content: text },
        ],
        temperature: 0.7,
        max_tokens: 256,
      }),
    });

    if (!llmRes.ok) {
      const err = await llmRes.text();
      return NextResponse.json({ error: `Groq: ${err}` }, { status: 502 });
    }

    const llmData = await llmRes.json();
    const responseText = llmData.choices?.[0]?.message?.content || "I'm not sure how to respond.";

    // Call Cartesia TTS
    const ttsRes = await fetch("https://api.cartesia.ai/tts/bytes", {
      method: "POST",
      headers: {
        "Cartesia-Version": "2024-06-30",
        "X-API-Key": CARTESIA_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model_id: "sonic",
        transcript: responseText,
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
      response: responseText,
      audio_base64: audioBase64,
      model: "llama-3.1-8b-instant",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
