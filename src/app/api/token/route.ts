import { AccessToken } from "livekit-server-sdk";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const room = body.room;
    const identity = body.identity || `user-${Math.floor(Math.random() * 10_000)}`;

    if (!room) {
      return NextResponse.json({ error: "Missing room name" }, { status: 400 });
    }

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;

    if (!apiKey || !apiSecret) {
      return NextResponse.json(
        { error: "Server misconfiguration: missing LiveKit credentials" },
        { status: 500 }
      );
    }

    const at = new AccessToken(apiKey, apiSecret, {
      identity,
      name: identity,
    });

    at.addGrant({
      roomJoin: true,
      room,
      canPublish: true,
      canSubscribe: true,
    });

    const token = await at.toJwt();
    const url = process.env.LIVEKIT_URL || "";

    if (!url) {
      return NextResponse.json(
        { error: "Server misconfiguration: missing LIVEKIT_URL" },
        { status: 500 }
      );
    }

    return NextResponse.json({ token, url });
  } catch (error) {
    console.error("Token generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate token" },
      { status: 500 }
    );
  }
}
