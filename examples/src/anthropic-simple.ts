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
const aiProvider = createVercelAIProvider({
  model: createAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  })("claude-4-sonnet-20250514"),
});
const computerProvider = createScrapybaraComputerProvider({
  apiKey: process.env.SCRAPYBARA_API_KEY,
  initialUrl: "https://news.ycombinator.com/news",
});

const agent = createAgent({
  aiProvider,
  computerProvider,
  logger: console,
});

const session = await agent.initializeSession();
console.log("session created", session);
const result = await session.runTask({
  instructions: "Search hacker news for the latest 5 news.",
  outputSchema: z.object({
    newsHeadlines: z.array(z.string()),
  }),
});

console.log("results", JSON.stringify(result, null, 2));

await session.end();
const sessionDetails = session.get();

console.log("session details", {
  status: sessionDetails.status,
  liveUrl: sessionDetails.liveUrl,
  tasks: sessionDetails.tasks.map((task) => {
    return {
      logs: JSON.stringify(
        task.logs.map((log) => {
          return {
            ...log,
            screenshot: "image-data",
          };
        }),
      ),
      result: task.result,
    };
  }),
});

process.exit(0);
