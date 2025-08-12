import { createOpenAI } from "@ai-sdk/openai";
import { createVercelAIProvider } from "@trymeka/ai-provider-vercel";
import { createAnchorBrowserComputerProvider } from "@trymeka/computer-provider-anchor-browser";
import { createAgent } from "@trymeka/core/ai/agent";
import { z } from "zod";

if (!process.env.ANCHOR_BROWSER_API_KEY) {
  throw new Error("ANCHOR_BROWSER_API_KEY is not set");
}
if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is not set");
}

const aiProvider = createVercelAIProvider({
  model: createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })("gpt-5"),
});
const computerProvider = createAnchorBrowserComputerProvider({
  apiKey: process.env.ANCHOR_BROWSER_API_KEY as string,
  initialUrl: "https://news.ycombinator.com",
});

const agent = createAgent({
  aiProvider,
  computerProvider,
  logger: console,
});

const session = await agent.initializeSession();
const result = await session.runTask({
  instructions: "Summarize the top 3 articles",
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

console.log("results", JSON.stringify(result, null, 2));

await session.end();
const sessionDetails = session.get();

console.log(
  "session details",
  sessionDetails.tasks.map((task) => {
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
);
process.exit(0);
