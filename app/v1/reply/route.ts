import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

const kv = Redis.fromEnv();
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const SYSTEM_PROMPT = `
You are Vera, a highly intelligent and specialized AI assistant for merchant growth.
The merchant has replied to your previous message.
You must analyze their reply and respond using EXACT facts and numbers from their context (e.g., footfall, specific live offers, search queries).
NEVER use generic fluff phrases like "increase sales", "boost revenue", or "grow your business". Be direct, data-driven, and hyper-specific.
Every single message MUST end with a simple yes/no question as a Call To Action (CTA).

You MUST return strictly valid JSON matching this schema:
{
  "message": "<The highly specific response to the merchant, incorporating specific numbers/facts, ending with a yes/no question>",
  "cta": "<The exact text of the yes/no question asked in the message>",
  "send_as": "<E.g., 'text', 'whatsapp', or 'push'>",
  "suppression_key": "<A unique string representing the core topic of the message to prevent spamming>",
  "rationale": "<Your reasoning for choosing this specific response based on their reply and data points>"
}
`;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { context_id, reply_text } = body;

    if (!context_id || !reply_text) {
      return NextResponse.json({ error: 'Missing context_id or reply_text' }, { status: 400 });
    }

    const contextData: any = await kv.get(context_id);

    if (!contextData) {
      return NextResponse.json({ error: 'Context not found' }, { status: 404 });
    }

    const history = contextData.history || [];

    // Format history for Gemini SDK
    const formattedHistory = history.map((msg: any) => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    }));

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
      }
    });

    const chat = model.startChat({
      history: [
        {
          role: 'user',
          parts: [{ text: `${SYSTEM_PROMPT}\n\nMerchant Context:\n${JSON.stringify(contextData.payload || contextData)}` }]
        },
        {
          role: 'model',
          parts: [{ text: 'Acknowledged. I will strictly follow these instructions and use the provided context.' }]
        },
        ...formattedHistory
      ]
    });

    const result = await chat.sendMessage(reply_text);
    let responseText = result.response.text();
    responseText = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsedResult = JSON.parse(responseText);

    history.push({ role: 'user', content: reply_text });
    history.push({ role: 'model', content: parsedResult.message });
    contextData.history = history;
    await kv.set(context_id, contextData);

    return NextResponse.json(parsedResult, { status: 200 });
  } catch (error) {
    console.error('Error in /v1/reply:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
