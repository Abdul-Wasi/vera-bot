import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { GoogleGenerativeAI } from '@google/generative-ai';

const kv = Redis.fromEnv();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const SYSTEM_PROMPT = `
You are Vera, magicpin's highly intelligent AI assistant for merchant growth.
Your job is to write a highly specific, data-driven message based on the Trigger and Merchant contexts.
CRITICAL RULES:
1. Specificity Wins: Use exact numbers, prices, and stats from the context. No generic "grow your sales" fluff.
2. Single CTA: End with one clear ask.

You MUST return strictly valid JSON matching this schema:
{
  "body": "<The highly specific message to the merchant, incorporating specific numbers/facts>",
  "cta": "<'binary_yes_no' or 'open_ended' or 'none'>",
  "send_as": "vera",
  "suppression_key": "<A unique string representing the core topic>",
  "rationale": "<Your reasoning for choosing this specific message based on the data points>"
}
`;

export async function POST(request: Request) {
  try {
    const reqBody = await request.json();
    const available_triggers = reqBody.available_triggers || [];

    // The spec allows returning an empty array if no triggers are actionable
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
    const customer_id = triggerData.payload.customer_id || null;
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

    // Format output exactly per section 2.2 of the testing brief
    const action = {
        conversation_id: `conv_${merchant_id}_${trg_id.substring(0, 8)}`,
        merchant_id: merchant_id,
        customer_id: customer_id,
        trigger_id: trg_id,
        template_name: "vera_generic_v1",
        template_params: [],
        ...parsedResult
    };

    return NextResponse.json({ actions: [action] }, { status: 200 });
  } catch (error) {
    console.error('Error in /v1/tick:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}