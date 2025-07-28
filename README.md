# Meka Agent

Meka Agent is an open-source, autonomous computer-using agent that delivers state-of-the-art browsing capabilities. The agent works and acts in the same way humans do, by purely using vision as its eyes and acting within a full computer context.

It is designed as a simple, extensible, and customizable framework, allowing flexibility in the choice of models, tools, and infrastructure providers.

## Benchmarks

The agent primarily focuses on web browsing today, and achieved state-of-the-art benchmark results in the WebArena and WebVoyager benchmarks.

[benchmark bar graph images]

Read more about the details of the benchmark results here.

## Demo

Visit [trymeka/demo](https://github.com/trymeka/demo) for a functional demo.

<img width="863" height="707" alt="Screenshot 2025-07-22 at 10 22 14 PM" src="https://github.com/user-attachments/assets/0b5df858-82da-4b6e-b153-542f00456455" />

## Getting Started

To get started with Meka, we packaged various providers that we have extensively tested. There are two main pieces:

- A vision model that has **good visual grounding**. From our experimentation, OpenAI o3, Claude Sonnet 4, and Claude Opus 4 are the best US-based models. We have not experimented with Chinese-based models but would love to see contributions!
- An infrastructure provider that exposes OS-level controls, not just a browser layer with Playwright screenshots. This is important for performance as a number of common web elements are rendered at the system level, invisible to the browser page, severely handicapping the vision-first approach.

To get started, we choose OpenAI o3 as the model and Scrapybara as the VM-based infrastructure provider. We are open to submissions by other infra providers with OS-level controls!

1. Install the main components of the SDK

```bash
npm install @trymeka/core @trymeka/ai-provider-vercel @ai-sdk/openai @trymeka/computer-provider-e2b playwright-core
```

2. Create your .env file and enter your API keys from the starter providers

```bash
cp .env.example .env
```

3. Start the agent

```typescript
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

await session.end();
console.log("results", JSON.stringify(result, null, 2));
```

## Agent Design

Meka is created from lessons learned from experimentation and publicly available research. Our fundamental philosophy in creating this agent is to think like how humans would, from vision to tools to memory. Here are some of the most important learnings:

- **Vision-first Approach**: Captures complex websites more effectively than approaches that use DOM-based navigation or identification.
- **VM Controls Over Browser Layer**: Provides better handling of system-level elements and alerts.
- **Effective Memory Management**:
  - Avoid passing excessive context to maintain agent performance. Providing 5-7 past steps in each iteration of the loop was the sweet spot for us.
  - Track crucial memory separately for accumulating essential results.
- **Vision Model Selection**:
  - Vision models with strong visual grounding work effectively on their own.
  - Vision models without strong grounding benefit from additional tools (e.g., Omniparser) or a layered manager-executor model. This was tested but not implemented in this repo due to speed and cost concerns.
- **LLM as a Judge**: Employ LLM evaluation during iterations inspired by [Reflexion](https://arxiv.org/pdf/2303.11366) and [related research](https://arxiv.org/abs/2404.06474).
- **Stepwise Planning**: Consistent planning after each step significantly boosts performance ([source](https://arxiv.org/abs/2506.06698)).

## Key Features

- **Bring your own LLM**: Meka is inherently hackable and works with any Model that Vercel's ai-sdk supports. It is important that the model is a vision model that has good visual grounding. In our experiments, OpenAI o3, Sonnet 4, and Opus 4 are good candidates.
- **Extensible**: Meka is designed to be extensible. You can easily add your own tools and providers to the agent.
- **Open Source**: Meka is oepn and builds on learnings that we've developed over testing ai agents on autonomous task.
- **Typesafe**: Meka is written in TypeScript and provides a typesafe API for building and interacting with agents.

## Contributing

We welcome contributions to Meka Agent! If you'd like to contribute, please read our [contributing guidelines](CONTRIBUTING.md) to get started.

## License

Meka Agent is licensed under the MIT License. See the [LICENSE](LICENSE) file for more information.
