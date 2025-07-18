import { createAgent } from "@trymeka/agent";
import { VercelAIProvider } from "@trymeka/ai-provider-vercel";
import { o3 } from "@trymeka/ai-provider-vercel/models";
import { createScrapybaraProvider } from "@trymeka/computer-provider-scrapybara";

async function main() {
  const vercelProvider = new VercelAIProvider(o3);
  const computerProvider = createScrapybaraProvider({
    uploadScreenshot: async () => ({ url: "" }),
  });

  const agent = createAgent({
    aiProvider: vercelProvider,
    computerProvider,
  });

  await agent.run({
    instructions: "Open a new browser window and go to https://www.google.com",
  });
}

main();
