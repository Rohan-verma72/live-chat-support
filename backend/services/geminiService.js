import "dotenv/config";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

/**
 * @param {object} session - The ChatSession database document.
 * @param {string} visitorMessage - The newest message sent by the visitor.
 * @returns {Promise<string>} The generated AI text response.
 */
export async function generateAIResponse(session, visitorMessage) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.warn("[GroqService] GROQ_API_KEY is not defined in the environment variables.");
    return "Thank you for your message. [TRANSFER_TO_HUMAN] (API Key missing, transferring to human support)";
  }

  const messages = [];

  // System instruction / system prompt
  messages.push({
    role: "system",
    content: `You are an expert AI Customer Support Assistant for our company. Your name is AI Support.
Your goal is to help visitors solve their problems politely, quickly, and professionally.

STRICT LANGUAGE RULE:
- ALWAYS match the language of the visitor.
- If the visitor speaks in English, you MUST respond in English.
- If the visitor speaks in Hindi (either in Devanagari script or Romanized script/Hinglish, e.g., "kaise ho", "help chahiye"), you MUST respond in Hindi (or Hinglish) matching their style. Do NOT reply in English if they ask in Hindi.

IMPORTANT TRANSFER RULES:
1. If the customer explicitly asks to talk to a human, talk to an agent, transfer, or calls for support staff (e.g., "human", "agent", "insan se baat karao", "customer care"), you MUST reply with the exact keyword [TRANSFER_TO_HUMAN] in your response (e.g., "Sure, I am transferring you to a human agent now. [TRANSFER_TO_HUMAN]").
2. If you are unable to solve the customer's problem or if they seem frustrated and you cannot help further, you MUST reply with the keyword [TRANSFER_TO_HUMAN] so we can escalate to a human specialist.
3. Keep your messages concise and helpful.`
  });

  if (session && session.messages) {
    for (const msg of session.messages) {
      if (msg.from === "system" || msg.type === "system") {
        continue; 
      }

      const role = msg.from === "visitor" ? "user" : "assistant";
      let text = msg.body || "";

      if (msg.type === "screenshot") {
        text = `[Sent a screenshot: ${msg.filename || "screenshot.png"}]`;
      }

      const lastContent = messages[messages.length - 1];
      if (lastContent && lastContent.role === role) {
        lastContent.content += `\n${text}`;
      } else {
        messages.push({
          role,
          content: text
        });
      }
    }
  }

  if (visitorMessage) {
    const lastContent = messages[messages.length - 1];
    if (lastContent && lastContent.role === "user") {
      // It's already there or we append to it
    } else {
      messages.push({
        role: "user",
        content: visitorMessage
      });
    }
  }

  if (messages.length === 1) {
    // Only system message, add a dummy user greeting
    messages.push({
      role: "user",
      content: "Hello"
    });
  }

  try {
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages,
        temperature: 0.7,
        max_tokens: 500
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[GroqService] API call failed: ${response.status} ${response.statusText}`, errorText);
      return "I apologize, but I am experiencing technical difficulties. [TRANSFER_TO_HUMAN]";
    }

    const data = await response.json();
    const replyText = data.choices?.[0]?.message?.content;
    
    if (!replyText) {
      console.warn("[GroqService] Empty response from Groq API:", JSON.stringify(data));
      return "I'm not sure how to answer that. [TRANSFER_TO_HUMAN]";
    }

    return replyText.trim();
  } catch (error) {
    console.error("[GroqService] Error calling Groq API:", error);
    return "I am unable to process your request at the moment. [TRANSFER_TO_HUMAN]";
  }
}
