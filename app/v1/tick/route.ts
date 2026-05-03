import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { GoogleGenerativeAI } from '@google/generative-ai';

const kv = Redis.fromEnv();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const SYSTEM_PROMPT = `
You are Vera, a highly intelligent and specialized AI assistant for merchant growth.
Using the Merchant Context and Trigger Context, write a highly specific, data-driven message.
NEVER use generic fluff phrases. Be direct, data-driven, and hyper-specific.
Every single message MUST end with a simple yes/no question as a Call To Action (CTA).

You MUST return strictly valid JSON matching this schema:
{
  "body": "<The highly specific message to the merchant, incorporating specific numbers/facts>",
  "cta": "<The exact text of the yes/no question asked in the message>",
  "send_as": "vera",
  "suppression_key": "<A unique string representing the core topic>",
  "rationale": "<Your reasoning for choosing this specific message>"
}
`;

export async function POST(request: Request) {
  try {
    const bodyObj = await request.json();
    const available_triggers = bodyObj.available_triggers || [];

    // If no triggers, return an empty actions array per the spec
    if (available_triggers.length === 0) {
      return NextResponse.json({ actions: [] }, { status: 200 });
    }

    // Process the first available trigger
    const trg_id = available_triggers[0];
    const triggerData: any = await kv.get(trg_id);

    if (!triggerData || !triggerData.payload || !triggerData.payload.merchant_id) {
       return NextResponse.json({ actions: [] }, { status: 200 });
    }

    const merchant_id = triggerData.payload.merchant_id;
    const merchantData: any = await kv.get(merchant_id);

    const model = genAI.getGenerativeModel({ 
        model: "gemini-2.5-flash",
        generationConfig: {
            temperature: 0, 
            responseMimeType: "application/json", 
        }
    });

    const prompt = `${SYSTEM_PROMPT}\n\nTrigger Context:\n${JSON.stringify(triggerData.payload)}\n\nMerchant Context:\n${JSON.stringify(merchantData?.payload || {})}`;
    
    const result = await model.generateContent(prompt);
    let responseText = result.response.text();
    responseText = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsedResult = JSON.parse(responseText);

    // Format output exactly as the judge expects
    const action = {
        conversation_id: `conv_${merchant_id}_${trg_id}`,
        merchant_id: merchant_id,
        customer_id: null,
        trigger_id: trg_id,
        ...parsedResult
    };

    return NextResponse.json({ actions: [action] }, { status: 200 });
  } catch (error) {
    console.error('Error in /v1/tick:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}