import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { GoogleGenerativeAI } from '@google/generative-ai';

const kv = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '',
});
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(request: Request) {
  try {
    const reqBody = await request.json();
    const available_triggers = reqBody.available_triggers || [];

    if (available_triggers.length === 0) {
      return NextResponse.json({ actions: [] }, { status: 200 });
    }

    const trg_id = available_triggers[0];
    let triggerData: any;
    try { triggerData = await kv.get(trg_id); } catch(e) {}

    if (!triggerData || !triggerData.payload || !triggerData.payload.merchant_id) {
      return NextResponse.json({ actions: [] }, { status: 200 });
    }

    const merchant_id = triggerData.payload.merchant_id;
    const customer_id = triggerData.payload.customer_id || null;
    let merchantData: any, customerData: any;
    try {
        merchantData = await kv.get(merchant_id);
        if (customer_id) customerData = await kv.get(customer_id);
    } catch(e) {}

    const isCustomerFacing = customer_id !== null;
    const sendAs = isCustomerFacing ? "merchant_on_behalf" : "vera";
    
    const audiencePrompt = isCustomerFacing 
      ? `You are messaging the merchant's CUSTOMER on behalf of the merchant. Tone: Warm, helpful. Use the customer's name and preferred language.`
      : `You are Vera, messaging the MERCHANT directly. Tone: Peer-to-peer, highly analytical, data-driven.`;

    const SYSTEM_PROMPT = `
      ${audiencePrompt}
      CRITICAL SCORING RULES:
      1. SPECIFICITY: You MUST extract and use exact numbers, dates, and prices from the contexts.
      2. MERCHANT FIT: You MUST use the Merchant's Owner Name (if available) or Business Name.
      3. TRIGGER RELEVANCE: Explicitly state the specific event/data from the Trigger Context driving this message.
      4. ENGAGEMENT: End with a single, clear, low-friction Yes/No question.

      Return strictly valid JSON matching this schema:
      {
        "body": "<The highly specific message incorporating numbers/facts>",
        "cta": "<'binary_yes_no' or 'multi_choice_slot' or 'open_ended'>",
        "suppression_key": "<A unique string representing the core topic>",
        "rationale": "<Your reasoning for choosing this specific message based on the data>"
      }
    `;

    const model = genAI.getGenerativeModel({ 
        model: "gemini-2.5-flash",
        generationConfig: { temperature: 0, responseMimeType: "application/json" }
    });

    const prompt = `${SYSTEM_PROMPT}\n\nTrigger Context:\n${JSON.stringify(triggerData?.payload || {})}\n\nMerchant Context:\n${JSON.stringify(merchantData?.payload || {})}\n\nCustomer Context:\n${JSON.stringify(customerData?.payload || {})}`;
    
    const result = await model.generateContent(prompt);
    let responseText = result.response.text();
    responseText = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsedResult = JSON.parse(responseText);

    const action = {
        conversation_id: `conv_${merchant_id}_${trg_id.substring(0, 8)}`,
        merchant_id: merchant_id,
        customer_id: customer_id,
        trigger_id: trg_id,
        template_name: isCustomerFacing ? "merchant_customer_outreach_v1" : "vera_generic_v1",
        template_params: [],
        send_as: sendAs,
        ...parsedResult
    };

    return NextResponse.json({ actions: [action] }, { status: 200 });
  } catch (error) {
    console.error('Error in /v1/tick:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}