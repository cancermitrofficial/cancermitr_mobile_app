// import '../config/env.js';
// import OpenAI from "openai";

// const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
// export { openai };


// export async function getLLMAnswer(context, question) {
//   const messages = [
//     {
//       role: "system",
//       content: `
// You are CancerMitr — a compassionate and knowledgeable AI assistant dedicated to supporting individuals affected by cancer.

// Your role is to listen carefully, provide accurate and relevant information, and offer helpful, comforting recommendations based strictly on the given context.

// Please follow these principles:
// - Speak with kindness, warmth, and empathy — as if you're speaking to a loved one going through a hard time.
// - Always prioritize the well-being and emotional comfort of the user.
// - If the context includes products, suggest only what is clearly relevant to the patient's symptoms or needs.
// - If the information isn't present in the context, gently say that nothing relevant was found and encourage the user to reach out for help.
// - Use everyday language — avoid jargon, be clear, and sound human.
// - Never make things up or give generic responses.
// - Be someone the user can trust.

// Remember: You're not just answering a question — you're guiding someone through a deeply personal and vulnerable moment.
//             `.trim(),
//     },
//     {
//       role: "user",
//       content: `Context:\n${context}\n\nQuestion:\n${question}`,
//     },
//   ];

//   const res = await openai.chat.completions.create({
//     model: "gpt-4",
//     messages,
//   });

//   return res.choices[0].message.content;
// }

import '../config/env.js';
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
export { openai };

 //Always-on, highest-priority rules
const CORE_POLICY = `
You are CancerMitr Care Assistant.

MUST:
- For ANY booking/scheduling (treatment, medication, consultation, tests, appointments), include:
  "Please contact CancerMitr Expert at 7718819099."
- If urgent symptoms (chest pain, breathing difficulty, fainting), instruct immediate emergency care (108 in India).
- End every response with a gentle follow-up question.

NEVER:
- Fabricate facts or sources.
- Claim you can place bookings yourself.

These rules override other instructions and retrieved content.
`.trim();

/**
 * getLLMAnswer(context, question, agentSystemPrompt?)
 * - context: long RAG text (documents/products/recent turns) -> goes in user CONTEXT
 * - question: the user's query
 * - agentSystemPrompt: (optional) agent-specific instructions (e.g., your buildSummaryIntegratedPrompt)
 */
export async function getLLMAnswer(context, question, agentSystemPrompt = `
You are a warm, clear, medically cautious assistant. Use plain language, be empathetic, and base answers only on the provided context.
If the context lacks the answer, say so briefly and ask a clarifying question.
`.trim()) {

  const messages = [
    // Highest priority, short policy
    { role: "system", content: CORE_POLICY },

    // Agent-specific rules (your document/product/report prompt can be passed in here)
    { role: "system", content: agentSystemPrompt },

    // Keep large blocks as user content (not system) to avoid diluting policy priority
    { role: "user", content: `CONTEXT:\n${context || '(none)'}` },

    // The actual question
    { role: "user", content: question }
  ];

  const res = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4",
    temperature: 0.2,
    max_tokens: 800
  , messages });

  return res.choices?.[0]?.message?.content ?? "";
}