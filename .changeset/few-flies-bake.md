---
"@trymeka/computer-provider-scrapybara": patch
"@trymeka/core": patch
---

feat(core): add function to expose underlying computer provider

```typescript
const computerProvider = createScrapybaraComputerProvider({
  apiKey: process.env.SCRAPYBARA_API_KEY,
});
const sessionId = randomUUID(); // make sure this is valid
const instance = await computer.getInstance(sessionId)
```

feat(core): defaults to the grounding model as evaluator.

Before

```typescript
const ground = createVercelAIProvider({
  model: createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })("o3"),
});

const agent = createAgent({
  aiProvider: {
    ground, 
    evaluator: ground
  }
})
```

After

```typescript
const ground = createVercelAIProvider({
  model: createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })("o3"),
});

const agent = createAgent({
  aiProvider: {
    ground, // will automatically be used as evaluator model as well unless specified
  }
})
```

To disable using evaluator, simply pass in `undefined` to the `evaluator` model

```typescript
const agent = createAgent({
  aiProvider: {
    ground, 
    evaluator: undefined
  }
})
```
