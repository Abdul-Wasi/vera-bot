import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

const kv = Redis.fromEnv();

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { scope, context_id, version, payload, delivered_at } = body;

    if (!context_id) {
      return NextResponse.json({ error: 'Missing context_id' }, { status: 400 });
    }

    // Retrieve the existing context to check the version
    const existingContext = await kv.get<{ version: number }>(context_id);

    // If incoming version is <= stored version, do nothing
    if (existingContext && typeof existingContext.version === 'number' && version <= existingContext.version) {
      return NextResponse.json(
        { accepted: false, reason: 'Stored version is equal or higher' },
        { status: 200 }
      );
    }

    // Replace context in KV
    await kv.set(context_id, { scope, context_id, version, payload, delivered_at, history: [] });

    // Generate response data
    const ack_id = Math.random().toString(36).substring(2, 15);
    const stored_at = new Date().toISOString();

    return NextResponse.json(
      { accepted: true, ack_id, stored_at },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error in /v1/context:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
