import { createOpenAI } from "@ai-sdk/openai";
import { createVercelAIProvider } from "@trymeka/ai-provider-vercel";
import { createE2BComputerProvider } from "@trymeka/computer-provider-e2b";
import { createAgent } from "@trymeka/core/ai/agent";
import { z } from "zod";

/**
 * This example shows how to use the Anthropic model to run a task.
 */

if (!process.env.E2B_API_KEY) {
  throw new Error("E2B_API_KEY is not set");
}

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is not set");
}

const aiProvider = createVercelAIProvider({
  model: createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })("o3"),
});
const computerProvider = createE2BComputerProvider({
  apiKey: process.env.E2B_API_KEY,
});
const agent = createAgent({
  aiProvider,
  computerProvider,
  logger: console,
});

const session = await agent.initializeSession();
console.log("session live url", session.get()?.liveUrl);

const task = await session
  .runTask({
    instructions: "Read the last article on the front page and summarize it",
    initialUrl: "https://news.ycombinator.com",
    outputSchema: z.object({
      articles: z.array(
        z.object({
          title: z.string(),
          url: z.string(),
          summary: z.string(),
          author: z.string(),
        }),
      ),
    }),
  })
  .finally(async () => {
    await session.end();
    console.log("Session ended");
  });

console.log("Task", JSON.stringify(task.result, null, 2));
process.exit(0);
