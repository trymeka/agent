# Meka Agent

Meka Agent is an open-source, autonomous computer-using agent that delivers state-of-the-art browsing capabilities. The agent works and acts in the same way humans do, by purely using vision as its eyes and acting within a full computer context.

It is designed as a simple, extensible, and customizable framework, allowing flexibility in the choice of models, tools, and infrastructure providers.

## Benchmarks

The agent primarily focuses on web browsing today, and achieves state-of-the-art benchmark results in the WebArena Benchmark (72.7%).

<img width="451" height="321" alt="Frame 70 (2)" src="https://github.com/user-attachments/assets/45ba645c-7bb3-458d-af8a-9cb6cf689510" />

[Read more](https://blog.withmeka.com/meka-achieves-state-of-the-art-performance-for-computer-use/) about the details of the benchmark results.

## Meka App

If you would like to get started with browser automations without any setup, visit the [Meka App](https://app.withmeka.com) to try the Meka Agent with $10 in free credits.

## Getting Started

To get started with Meka, we packaged various providers that we have extensively tested. There are two main pieces:

- A vision model that has **good visual grounding**. From our experimentation, OpenAI o3, Claude Sonnet 4, and Claude Opus 4 are the best US-based models. We have not experimented with Chinese-based models but would love to see contributions!
- An infrastructure provider that exposes OS-level controls, not just a browser layer with Playwright screenshots. This is important for performance as a number of common web elements are rendered at the system level, invisible to the browser page. (Examples include dropdown menus, browser alerts, file uploads, and more)

To get started, we choose OpenAI o3 as the model and Anchor Browser as the VM-based infrastructure provider. We are open to submissions by other infra providers with OS-level controls!

1. Install the main components of the SDK

```bash
npm install @trymeka/core @trymeka/ai-provider-vercel @ai-sdk/openai @trymeka/computer-provider-anchor-browser playwright-core
```

2. Create your .env file and enter your API keys from the starter providers

```bash
OPENAI_API_KEY=GET FROM https://platform.openai.com/settings/organization/api-keys
ANCHOR_BROWSER_API_KEY=GET FROM https://app.anchorbrowser.io/api-access
```

3. Start the agent

```typescript
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createVercelAIProvider } from "@trymeka/ai-provider-vercel";
import { createAnchorBrowserComputerProvider } from "@trymeka/computer-provider-anchor-browser";
import { createAgent } from "@trymeka/core/ai/agent";

const o3AIProvider = createVercelAIProvider({
  model: createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })("o3"),
  logger: console,
});

const claudeAIProvider = createVercelAIProvider({
  model: createAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  })("claude-4-sonnet-20250514"),
  logger: console,
});

const geminiFlashAIProvider = createVercelAIProvider({
  model: createGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  })("gemini-2.5-flash"),
  logger: console,
});

const computerProvider = createAnchorBrowserComputerProvider({
  apiKey: process.env.ANCHOR_BROWSER_API_KEY,
});

const agent = createAgent({
  // Mixture of models (this is optional, you may also only have one "aiProvider")
  // e.g. (alternative - we recommend Sonnet 4 if using only one model):
  // aiProvider: claudeAIProvider,
  aiProvider: {
    ground: o3AIProvider,
    alternateGround: claudeAIProvider,
    evaluator: geminiFlashAIProvider,
  },
  computerProvider,
  logger: console,
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
});

await session.end();
console.log("results", JSON.stringify(task.result, null, 2));
```

## Examples

For more usage examples, check out [/examples](/examples/).

## Agent Design

Meka is created from lessons learned from experimentation and publicly available research. Our fundamental philosophy in creating this agent is to think like how humans would, from vision to tools to memory. 

For more details, [visit our blog post](https://blog.withmeka.com/introducing-meka-an-open-source-framework-for-building-autonomous-computer-agents/) on the Meka Agent.

## Key Features

- **Bring your own LLM**: Meka is inherently hackable and works with any Model that Vercel's ai-sdk supports. It is important that the model is a vision model that has good visual grounding. In our experiments, OpenAI o3, Sonnet 4, and Opus 4 are good candidates.
- **Extensible**: Meka is designed to be extensible. You can easily add your own tools and providers to the agent.
- **Open Source**: Meka is open source and builds on learnings that we've developed over testing ai agents on autonomous task completion.
- **Typesafe**: Meka is written in TypeScript and provides a typesafe API for building and interacting with agents.

## Contributing

We welcome contributions to Meka Agent! If you'd like to contribute, please read our [contributing guidelines](CONTRIBUTING.md) to get started.

## License

Meka Agent is licensed under the MIT License. See the [LICENSE](LICENSE) file for more information.
