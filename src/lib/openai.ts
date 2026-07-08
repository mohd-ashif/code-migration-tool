import { config } from "../config";
import { logger } from "../utils/logger";

/**
   * Calls the OpenAI chat completion API.
   * If the API key is not configured, it will run in stub/mock mode.
   */
export async function callOpenAI(prompt: string, systemPrompt?: string): Promise<string> {
  if (!config.OPENAI_API_KEY) {
    logger.info("OPENAI_API_KEY is not set. Running OpenAI in stub mode.");
    return `AI stub response for prompt: ${prompt}`;
  }

  try {
    const messages: any[] = [];
    if (systemPrompt) {
      messages.push({ role: "system", content: systemPrompt });
    }
    messages.push({ role: "user", content: prompt });

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API returned status ${response.status}: ${errorText}`);
    }

    const data: any = await response.json();
    return data?.choices?.[0]?.message?.content || "";
  } catch (error) {
    logger.error(`OpenAI API call failed: ${error}`);
    throw error;
  }
}
