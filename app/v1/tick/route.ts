import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { GoogleGenerativeAI } from '@google/generative-ai';

const kv = Redis.fromEnv();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(request: Request) {
  try {
    const reqBody = await request.json();
    const available_triggers = reqBody.available_triggers || [];

    if (available_triggers.length === 0) {
      return NextResponse.json({ actions: [] }, { status: 200 });
    }

    const trg_id = available_triggers[0];
    const triggerData: any = await kv.get(trg_id);

    if (!triggerData || !triggerData.payload || !triggerData.payload.merchant_id) {
      return NextResponse.json({ actions: [] }, { status: 200 });
    }

    const merchant_id = triggerData.payload.merchant_id;
    const customer_id = triggerData.payload.customer_id || null;
    const merchantData: any = await kv.get(merchant_id);
    const customerData: any = customer_id ? await kv.get(customer_id) : null;

    // PRO-TIER ROUTING: Decide tone and sender identity based on the presence of a customer
    const isCustomerFacing = customer_id !== null;
    const sendAs = isCustomerFacing ? "merchant_on_behalf" : "vera";
    
    const audiencePrompt = isCustomerFacing 
      ? `You are messaging the merchant's CUSTOMER on behalf of the merchant. Tone: Warm, helpful, NO medical guarantees. Use the customer's name and preferred language.`
      : `You are Vera, messaging the MERCHANT directly. Tone: Peer-to-peer, highly analytical, data-driven. Use exact numbers and performance stats.`;

    const SYSTEM_PROMPT = `
      ${audiencePrompt}
      CRITICAL RULES:
      1. Specificity Wins: Extract exact numbers, prices, and stats from the context.
      2. Single CTA: End with one clear ask (a yes/no question or simple choice).
      3. No generic marketing fluff.

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

    const prompt = `${SYSTEM_PROMPT}\n\nTrigger Context:\n${JSON.stringify(triggerData.payload)}\n\nMerchant Context:\n${JSON.stringify(merchantData?.payload || {})}\n\nCustomer Context:\n${JSON.stringify(customerData?.payload || {})}`;
    
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