# Vera AI Message Engine - Challenge Submission

**Bot Base URL:** `https://vera-bot-jet.vercel.app`

## Architectural Approach
This engine is built for speed, scalability, and strict deterministic output.
*   **Framework:** Next.js (App Router) deployed via Vercel for instant serverless execution.
*   **State Management:** Upstash Redis. Because serverless functions are stateless, merchant context and conversation history are atomically written to Upstash Redis using the `context_id`. This ensures the bot remembers the exact versioned payload across the `/tick` and `/reply` lifecycle without memory leaks.
*   **LLM Choice:** Google Gemini 1.5 Flash.

## Model Choice & Prompt Engineering
I selected **Gemini 1.5 Flash** because it natively supports `responseMimeType: "application/json"`. This is critical for ensuring the output perfectly matches the required schema (`message`, `cta`, `send_as`, `suppression_key`, `rationale`) 100% of the time without parsing errors. 
Temperature is strictly set to `0` to guarantee deterministic, highly grounded messaging. The system prompt heavily penalizes generic marketing fluff, forcing the model to extract real variables (footfall, search volume, exact discount values) from the Redis context.

## Tradeoffs
*   **Zero-Shot vs. Few-Shot:** To minimize latency and token overhead, the model relies on a dense, zero-shot system prompt rather than passing multiple few-shot examples in the context window.
*   **Stateless vs. Stateful:** Relying on Redis adds a slight network hop (ms latency) compared to an in-memory cache on a persistent Node server, but it guarantees absolute stability and scale if magicpin were to blast 10,000 webhooks at the endpoints simultaneously.
