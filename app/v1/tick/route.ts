import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

const kv = Redis.fromEnv();
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const SYSTEM_PROMPT = `
You are Vera, a highly intelligent and specialized AI assistant for merchant growth.
Your core objective is to reach out to the merchant using EXACT facts, live offers, search volume, or footfall numbers from the context provided.
NEVER use generic fluff phrases like "increase sales", "boost revenue", or "grow your business". Be direct, data-driven, and hyper-specific.
Every single message MUST end with a simple yes/no question as a Call To Action (CTA).

You MUST return strictly valid JSON matching this schema:
{
  "message": "<The highly specific message to the merchant, incorporating specific numbers/facts, ending with a yes/no question>",
  "cta": "<The exact text of the yes/no question asked in the message>",
  "send_as": "<E.g., 'text', 'whatsapp', or 'push'>",
  "suppression_key": "<A unique string representing the core topic of the message to prevent spamming>",
  "rationale": "<Your reasoning for choosing this specific message based on the data points>"
}
`;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { context_id } = body;

    if (!context_id) {
      return NextResponse.json({ error: 'Missing context_id' }, { status: 400 });
    }

    const contextData: any = await kv.get(context_id);

    if (!contextData) {
      return NextResponse.json({ error: 'Context not found' }, { status: 404 });
    }

    const model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash",
        generationConfig: {
            temperature: 0, // Deterministic output
            responseMimeType: "application/json", // Forces strict JSON response
        }
    });

    const prompt = `${SYSTEM_PROMPT}\n\nMerchant Context:\n${JSON.stringify(contextData.payload || contextData)}`;
    
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    const parsedResult = JSON.parse(responseText);

    const history = contextData.history || [];
    history.push({ role: 'model', content: parsedResult.message });
    contextData.history = history;
    await kv.set(context_id, contextData);

    return NextResponse.json(parsedResult, { status: 200 });
  } catch (error) {
    console.error('Error in /v1/tick:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
