import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { GoogleGenerativeAI } from '@google/generative-ai';

const kv = Redis.fromEnv();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const SYSTEM_PROMPT = `
You are Vera, a highly intelligent AI assistant for merchant growth.
The merchant has replied to your previous message.
Analyze their reply and respond using EXACT facts and numbers from their context.
Every single message MUST end with a simple yes/no question as a Call To Action (CTA).

You MUST return strictly valid JSON matching this schema:
{
  "body": "<The highly specific response to the merchant>",
  "cta": "<The exact text of the yes/no question asked>",
  "rationale": "<Your reasoning for choosing this specific response based on their reply>"
}
`;

export async function POST(request: Request) {
  try {
    const reqBody = await request.json();
    // The judge sends 'message' and 'merchant_id'
    const { conversation_id, merchant_id, message } = reqBody;

    if (!merchant_id || !message) {
      return NextResponse.json({ error: 'Missing merchant_id or message' }, { status: 400 });
    }

    const merchantData: any = await kv.get(merchant_id);

    const model = genAI.getGenerativeModel({ 
        model: "gemini-2.5-flash",
        generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
        }
    });

    const prompt = `${SYSTEM_PROMPT}\n\nMerchant Context:\n${JSON.stringify(merchantData?.payload || {})}\n\nMerchant's Message:\n${message}`;

    const result = await model.generateContent(prompt);
    let responseText = result.response.text();
    responseText = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsedResult = JSON.parse(responseText);

    // Format output exactly as the judge expects
    const finalResponse = {
        action: "send",
        ...parsedResult
    };

    return NextResponse.json(finalResponse, { status: 200 });
  } catch (error) {
    console.error('Error in /v1/reply:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}