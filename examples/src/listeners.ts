import { createOpenAI } from "@ai-sdk/openai";
import { createVercelAIProvider } from "@trymeka/ai-provider-vercel";
import { createScrapybaraComputerProvider } from "@trymeka/computer-provider-scrapybara";
import { createAgent } from "@trymeka/core/ai/agent";
import { z } from "zod";

if (!process.env.SCRAPYBARA_API_KEY) {
  throw new Error("SCRAPYBARA_API_KEY is not set");
}

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is not set");
}

const aiProvider = createVercelAIProvider({
  model: createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })("o3"),
});
const computerProvider = createScrapybaraComputerProvider({
  apiKey: process.env.SCRAPYBARA_API_KEY,
  initialUrl: "https://news.ycombinator.com",
});
const agent = createAgent({
  aiProvider,
  computerProvider,
  logger: console,
});

const session = await agent.initializeSession();
const task = await session.runTask({
  instructions: "Summarize the top 3 articles",
  onStep: (args) => {
    console.log("Step", JSON.stringify(args, null, 2));
  },
  onComplete: (args) => {
    console.log("Complete", JSON.stringify(args, null, 2));
  },
  outputSchema: z.object({
    articles: z.array(
      z.object({
        title: z.string(),
        url: z.string(),
        summary: z.string(),
      }),
    ),
  }),
});

console.log("Task", JSON.stringify(task.result, null, 2));

await session.end();
const sessionDetails = session.get();
if (!sessionDetails) {
  throw new Error("Session details are undefined");
}
console.log(
  "session details",
  sessionDetails.tasks.map((task) => {
    return {
      logs: JSON.stringify(task.logs, null, 2),
      result: task.result,
    };
  }),
);
process.exit(0);
