# Meka Agent

Meka Agent is an autonomous computer-using agent that delivers state-of-the-art browsing capabilities. The agent works and acts in the same way humans do, by purely using vision as its eyes and acting within a full computer context. 

It is designed as a simple, extensible, and customizable framework, allowing flexibility in the choice of models, tools, and infrastructure providers.

## Benchmarks

The agent primarily focuses on web browsing today, and achieved state-of-the-art benchmark results in the WebArena and WebVoyager benchmarks.

[benchmark bar graph images]

Read more about the details of the benchmark results here.


## Getting Started

To get started with Meka, we packaged various providers that we have extensively tested. There are two main pieces:
 - A vision model that has **good visual grounding**. From our experimentation, OpenAI o3, Claude Sonnet 4, and Claude Opus 4 are the best US-based models. We have not experimented with Chinese-based models but would love to see contributions!
 - An infrastructure provider that exposes OS-level controls, not just a browser layer with Playwright screenshots. This is important for performance as a number of common web elements are rendered at the system level, invisible to the browser page, severely handicapping the vision-first approach.

To get started, we choose OpenAI o3 as the model and Scrapybara as the VM-based infrastructure provider. We are open to submissions by other infra providers with OS-level controls!

1. Install the main components of the SDK
```bash
npm install @trymeka/core @trymeka/ai-provider-vercel @ai-sdk/openai @trymeka/computer-provider-scrapybara playwright-core
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
  initialUrl: "https://www.guardiandentistry.com/our-network",
});

const agent = createAgent({
  aiProvider,
  computerProvider,
  logger: console,
});

const session = await agent.session.initialize();
agent.session.run({
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
}).then(async (result) => {
    console.log("results", JSON.stringify(result, null, 2));
    await session.end();
    process.exit(0);
  });

// getting session status
setInterval(() => {
  const current = session.get();
  console.log("current session", current);
}, 5_000);
```

## Key Features

- **Bring your own LLM**: Meka is inherently hackable and works with any Modal that vercel AI sdk supports today.
- **Extensible**: Meka is designed to be extensible. You can easily add your own tools and providers to the agent.
- **Open Source**: Meka is oepn and builds on learnings that we've developed over testing ai agents on autonomous task.
- **Typesafe**: Meka is written in TypeScript and provides a typesafe API for building and interacting with agents.

## Approach

Meka is created from lessons learned from experimentation and publicly available research. Our fundamental philosophy in creating this agent is to think like how humans would, from vision to tools to memory. Here are some of the most important learnings:

- **Vision-first Approach**: Captures complex websites more effectively than approaches that use DOM-based navigation or identification. The best vision models today with good visual grounding 
- **VM Controls Over Browser Layer**: Provides better handling of system-level elements and alerts.
- **Effective Memory Management**:
  - Avoid passing excessive context to maintain agent performance.
  - Track crucial memory separately for accumulating essential results.
- **Vision Model Selection**:
  - Vision models with strong visual grounding work effectively on their own.
  - Vision models without strong grounding benefit from additional tools (e.g., Omniparser) or a layered manager-executor model.
- **Sampling for Iteration**: Faster iterations through targeted sampling rather than full benchmarks.
- **LLM as a Judge**: Employ LLM evaluation during iterations inspired by [Reflexion](https://arxiv.org/pdf/2303.11366) and [related research](https://arxiv.org/abs/2404.06474).
- **Stepwise Planning**: Consistent planning after each step significantly boosts performance ([source](https://arxiv.org/abs/2506.06698)).

## Contributing

We welcome contributions to Meka Agent! If you'd like to contribute, please read our [contributing guidelines](CONTRIBUTING.md) to get started.

## License

Meka Agent is licensed under the MIT License. See the [LICENSE](LICENSE) file for more information.
