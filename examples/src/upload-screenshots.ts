import { createOpenAI } from "@ai-sdk/openai";
import { createVercelAIProvider } from "@trymeka/ai-provider-vercel";
import { createScrapybaraComputerProvider } from "@trymeka/computer-provider-scrapybara";
import { createAgent } from "@trymeka/core/ai/agent";

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
  uploadScreenshot: async (options) => {
    const response = await fetch("https://example.com/upload-screenshot", {
      method: "POST",
      body: JSON.stringify({
        b64Image: options.screenshotBase64,
        sessionId: options.sessionId,
        step: options.step,
      }),
    });
    console.log("Uploaded screenshot", options.sessionId);
    const _data = await response.text();
    return {
      url: "https://framerusercontent.com/images/GaKFlfUpPkRNtOcizXLNswxjA.png?scale-down-to=1024",
    };
  },
});
const agent = createAgent({
  aiProvider,
  computerProvider,
  logger: console,
});

const session = await agent.initializeSession();
console.log("session live url", session.get()?.liveUrl);

const task = await session.runTask({
  instructions: "Tell me the latest 3 articles",
});
console.log("Task", JSON.stringify(task.result, null, 2));
await session.end();
process.exit(0);
