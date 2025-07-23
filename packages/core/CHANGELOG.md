# @trymeka/core

## 0.0.12

### Patch Changes

- bd97980: fix(ai-provider-vercel): update repair tool calling to better support computer action for claude

## 0.0.11

### Patch Changes

- b43b762: feat(core): add function to expose underlying computer provider

  ```typescript
  const computerProvider = createScrapybaraComputerProvider({
    apiKey: process.env.SCRAPYBARA_API_KEY,
  });
  const sessionId = randomUUID(); // make sure this is valid
  const instance = await computer.getInstance(sessionId);
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
      evaluator: ground,
    },
  });
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
    },
  });
  ```

  To disable using evaluator, simply pass in `undefined` to the `evaluator` model

  ```typescript
  const agent = createAgent({
    aiProvider: {
      ground,
      evaluator: undefined,
    },
  });
  ```

## 0.0.10

### Patch Changes

- 68d74d0: fix(core): redact base64 image from logs

## 0.0.9

### Patch Changes

- 55b3f48: fix(core): empty schema for `runTask` should not throw

## 0.0.8

### Patch Changes

- 5f937ba: feat(core): add ability to navigate to an initial url per task
  feat(computer-provider-scrapybara): add ability to navigate to a url
- d26d44b: feat(core): add support for judge model before task completion
  feat(core): add support for alternate grounding model as per <https://xbow.com/blog/alloy-agents/>
- 16ad3f9: feat(core): add support for planning when executing computer actions

## 0.0.7

### Patch Changes

- bcc0ad0: Add persistent memory for important information and update system prompt

## 0.0.6

### Patch Changes

- 95463e8: chore(computer-provider-scrapybara): move playwright-core into peer dependency due to installation error when trying to package as regular deps

  feat(core): Update api surface area when instantiating and managing sessions
