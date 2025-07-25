---
"@trymeka/core": patch
---

feat(core): Add support for listeners.

```typescript
import { createOpenAI } from "@ai-sdk/openai";
import { createVercelAIProvider } from "@trymeka/ai-provider-vercel";
import { createScrapybaraComputerProvider } from "@trymeka/computer-provider-scrapybara";
import { createAgent } from "@trymeka/core/ai/agent";
import { z } from "zod";

const aiProvider = createVercelAIProvider({
  model: createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })("o3"),
});
const computerProvider = createScrapybaraComputerProvider({
  apiKey: process.env.SCRAPYBARA_API_KEY,
});
const agent = createAgent({
  aiProvider,
  computerProvider,
});

const session = await agent.initializeSession();
const task = await session.runTask({
  instructions: "Summarize the top 3 articles",
  initialUrl: "https://news.ycombinator.com",
  outputSchema: z.object({
    articles: z.array(
      z.object({
        title: z.string(),
        url: z.string(),
        summary: z.string(),
      }),
    ),
  }),
  onStep: (args) => {
    console.log("Step", JSON.stringify(args, null, 2));
  },
  onComplete: (args) => {
    console.log("Complete", JSON.stringify(args, null, 2));
  },
});
```
