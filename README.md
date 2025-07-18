# Meka Agent

Meka Agent is a framework for building, running, and deploying autonomous Computer use AI agents. It's designed to be simple, extensible, and easy to use.

## Key Features

- **Bring your own LLM**: Meka is inherently hackable and works with any Modal that vercel AI sdk supports today.
- **Extensible**: Meka is designed to be extensible. You can easily add your own tools and providers to the agent.
- **Open Source**: Meka is oepn and builds on learnings that we've developed over testing ai agents on autonomous task.
- **Typesafe**: Meka is written in TypeScript and provides a typesafe API for building and interacting with agents.

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

## Contributing

We welcome contributions to Meka Agent! If you'd like to contribute, please read our [contributing guidelines](CONTRIBUTING.md) to get started.

## License

Meka Agent is licensed under the MIT License. See the [LICENSE](LICENSE) file for more information.
