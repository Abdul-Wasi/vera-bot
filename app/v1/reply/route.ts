import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { GoogleGenerativeAI } from '@google/generative-ai';

const kv = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '',
});
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const SYSTEM_PROMPT = `
You are Vera, magicpin's AI assistant. Analyze the merchant's reply and their context.

CRITICAL RULES FOR "action":
1. AUTO-REPLY: If the message is a canned WhatsApp auto-reply, set action to "wait" and wait_seconds to 14400.
2. HOSTILE: If the merchant is hostile, says "stop", or "spam", set action to "end".
3. POSITIVE INTENT: If the merchant agrees or says "let's do it", set action to "send". In the 'body', you MUST use words like "drafting", "sending", or "confirm" to show you are taking action. DO NOT END THE CONVERSATION.
4. NORMAL: For normal conversation, set action to "send" and write a highly specific 'body'.

You MUST return strictly valid JSON matching this schema:
{
  "action": "<'send', 'wait', or 'end'>",
  "body": "<Your highly specific response if action is 'send', otherwise leave empty>",
  "cta": "<'binary_yes_no', 'open_ended', or 'none'>",
  "wait_seconds": <number, e.g., 14400 if action is 'wait', otherwise 0>,
  "rationale": "<Your reasoning for choosing this action>"
}
`;

export async function POST(request: Request) {
  try {
    const reqBody = await request.json();
    const { conversation_id, merchant_id, message } = reqBody;

    if (!merchant_id || !message) {
      return NextResponse.json({ error: 'Missing merchant_id or message' }, { status: 400 });
    }

    let merchantData: any;
    try { merchantData = await kv.get(merchant_id); } catch(e) {}
    
    const history = merchantData?.history || [];

    const formattedHistory = history.map((msg: any) => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    }));

    const model = genAI.getGenerativeModel({ 
        model: "gemini-2.5-flash",
        generationConfig: { temperature: 0, responseMimeType: "application/json" }
    });

    const chat = model.startChat({
      history: [
        {
          role: 'user',
          parts: [{ text: `${SYSTEM_PROMPT}\n\nMerchant Context:\n${JSON.stringify(merchantData?.payload || {})}` }]
        },
        {
          role: 'model',
          parts: [{ text: 'Acknowledged. I will strictly follow these instructions.' }]
        },
        ...formattedHistory
      ]
    });

    const result = await chat.sendMessage(`Merchant's Reply: "${message}"`);
    let responseText = result.response.text();
    responseText = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsedResult = JSON.parse(responseText);

    // Clean up payload
    if (parsedResult.action !== "wait") delete parsedResult.wait_seconds;
    if (parsedResult.action !== "send") {
        delete parsedResult.body;
        delete parsedResult.cta;
    }

    history.push({ role: 'user', content: message });
    if (parsedResult.body) history.push({ role: 'model', content: parsedResult.body });
    
    if (merchantData) {
        merchantData.history = history;
        try { await kv.set(merchant_id, merchantData); } catch(e) {}
    }

    return NextResponse.json(parsedResult, { status: 200 });
  } catch (error) {
    console.error('Error in /v1/reply:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}