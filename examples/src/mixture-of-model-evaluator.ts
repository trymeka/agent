import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createVercelAIProvider } from "@trymeka/ai-provider-vercel";
import { createScrapybaraComputerProvider } from "@trymeka/computer-provider-scrapybara";
import { createAgent } from "@trymeka/core/ai/agent";

/**
 * This example shows how to use a mixture of models + a different evaluator model to run a task.
 */
if (!process.env.SCRAPYBARA_API_KEY) {
  throw new Error("SCRAPYBARA_API_KEY is not set");
}
if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is not set");
}
if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error("ANTHROPIC_API_KEY is not set");
}
if (!process.env.GOOGLE_API_KEY) {
  throw new Error("GOOGLE_API_KEY is not set");
}

const aiProvider = createVercelAIProvider({
  model: createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })("o3"),
});
const aiProvider2 = createVercelAIProvider({
  model: createAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  })("claude-4-sonnet-20250514"),
});
const evaluator = createVercelAIProvider({
  model: createGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_API_KEY,
  })("gemini-2.5-pro"),
});
const computerProvider = createScrapybaraComputerProvider({
  apiKey: process.env.SCRAPYBARA_API_KEY,
});
const agent = createAgent({
  aiProvider: {
    ground: aiProvider,
    alternateGround: aiProvider2,
    evaluator: evaluator,
  },
  computerProvider,
  logger: console,
});

const session = await agent.initializeSession();
const loginResult = await session.runTask({
  instructions:
    "Log in to the website using username: byteblaze and password: hello1234",
  initialUrl: "	http://3.149.163.222:8023",
});
console.log("loginResult", loginResult);
const task = await session.runTask({
  instructions:
    "Tell me the full names of the repositories where I made contributions and they got the least stars?",
  initialUrl: "	http://3.149.163.222:8023",
});
console.log("Task:", JSON.stringify(task.result, null, 2));

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
