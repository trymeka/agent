# Meka Agent

Meka Agent is an autonomous computer-using agent that delivers state-of-the-art browsing capabilities.

The agent works and acts in the same way a human would, by using vision as its eyes and acting on a full computer context. 

It is designed as a simple, extensible, and customizable framework, allowing flexibility in the choice of models, tools, and infrastructure providers.

## Benchmarks

The agent primarily focuses on web browsing today, and achieved state-of-the-art benchmark results in the WebArena and WebVoyager benchmarks.



Read more about the details of the benchmark results here.


## Getting Started

To get started with Meka, install the various providers

```bash
npm install @trymeka/core @trymeka/ai-provider-vercel @ai-sdk/openai @trymeka/computer-provider-scrapybara playwright-core
```

Grab API keys from OpenAI and scrapybara, the computer provider.

Then instantiate the agent.

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

We adopted a lot of lessons from experimentation and publicly available research. Some of the most important lessons we learned that are packed into this agent:

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
- 

## Contributing

We welcome contributions to Meka Agent! If you'd like to contribute, please read our [contributing guidelines](CONTRIBUTING.md) to get started.

## License

Meka Agent is licensed under the MIT License. See the [LICENSE](LICENSE) file for more information.
