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
  initialUrl: "https://www.guardiandentistry.com/our-network",
});

const agent = createAgent({
  aiProvider,
  computerProvider,
  logger: console,
});

const session = await agent.session.initialize();
const { result } = await agent.session.run({
  sessionId: session.id,
  instructions:
    "Find the email address and phone number for the various practices in the location list.",
  outputSchema: z.object({
    locations: z.array(
      z.object({
        name: z.string(),
        address: z.string(),
        phone: z.string(),
        website: z.string(),
        email: z.string(),
      }),
    ),
  }),
});
await agent.session.end(session.id);

console.log(JSON.stringify(result, null, 2));
process.exit(0);
