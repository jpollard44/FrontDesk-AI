import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not set");
    }
    client = new Anthropic();
  }
  return client;
}

// Per the business plan: Haiku for high-volume chat (~$2-8/client/month),
// Sonnet for one-shot config generation where quality matters.
export const CHAT_MODEL = process.env.CHAT_MODEL ?? "claude-haiku-4-5";
export const CONFIG_MODEL = process.env.CONFIG_MODEL ?? "claude-sonnet-5";
