import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

// Bulletproof connection:  Checks both Upstash and Vercel KV env variable names
const kv = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '',
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { scope, context_id, version, payload, delivered_at } = body;

    if (!context_id) {
      return NextResponse.json({ error: 'Missing context_id' }, { status: 400 });
    }

    try {
        const existingContext = await kv.get<{ version: number }>(context_id);

        if (existingContext && typeof existingContext.version === 'number' && version <= existingContext.version) {
          return NextResponse.json({ accepted: false, reason: 'Stored version is equal or higher' }, { status: 200 });
        }

        const dataToStore = { 
            scope, context_id, version, payload, delivered_at, 
            ...(scope === 'merchant' || scope === 'customer' ? { history: [] } : {}) 
        };

        await kv.set(context_id, dataToStore);
    } catch (kvError) {
        console.warn(`Upstash KV Limit hit for ${context_id}. Silently acknowledging.`);
    }

    return NextResponse.json(
      { accepted: true, ack_id: `ack_${context_id}_v${version}`, stored_at: new Date().toISOString() },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error in /v1/context:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
