import { createAnthropic } from "@ai-sdk/anthropic";
import { createVercelAIProvider } from "@trymeka/ai-provider-vercel";
import { createScrapybaraComputerProvider } from "@trymeka/computer-provider-scrapybara";
import { createAgent } from "@trymeka/core/ai/agent";
import { z } from "zod";

if (!process.env.SCRAPYBARA_API_KEY) {
  throw new Error("SCRAPYBARA_API_KEY is not set");
}

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error("ANTHROPIC_API_KEY is not set");
}

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const agent = createAgent({
  aiProvider: createVercelAIProvider({
    model: anthropic("claude-4-sonnet-20250514"),
  }),
  computerProvider: createScrapybaraComputerProvider({
    apiKey: process.env.SCRAPYBARA_API_KEY,
    initialUrl: "https://www.google.com",
    logger: console,
  }),
  logger: console,
});

const session = await agent.session.initialize();
console.log("session created", session);
const { result } = await agent.session.run({
  sessionId: session.id,
  instructions: "Search hacker news for the latest 5 news.",
  outputSchema: z.object({
    newsHeadlines: z.array(z.string()),
  }),
});
console.log(JSON.stringify(result, null, 2));

await agent.session.end(session.id);

process.exit(0);
