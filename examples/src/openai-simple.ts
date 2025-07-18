import { createOpenAI } from "@ai-sdk/openai";
import { createVercelAIProvider } from "@trymeka/ai-provider-vercel";
import { createScrapybaraComputerProvider } from "@trymeka/computer-provider-scrapybara";
import { createAgent } from "@trymeka/core/ai/agent";
import { z } from "zod/mini";

if (!process.env.SCRAPYBARA_API_KEY) {
  throw new Error("SCRAPYBARA_API_KEY is not set");
}

const openai = createOpenAI();

const agent = createAgent({
  aiProvider: createVercelAIProvider({
    model: openai("o3"),
  }),
  computerProvider: createScrapybaraComputerProvider({
    apiKey: process.env.SCRAPYBARA_API_KEY,
    initialUrl: "https://www.google.com",
  }),
});

const session = await agent.session.initialize();
console.log("session", session);
const { object } = await agent.session.run({
  sessionId: session.id,
  instructions: "Why is the sky blue?",
  outputSchema: z.object({
    answer: z.string(),
  }),
});

console.log(object);
