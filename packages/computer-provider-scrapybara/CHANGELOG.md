# @trymeka/computer-provider-scrapybara

## 0.0.12

### Patch Changes

- Updated dependencies [bd97980]
  - @trymeka/core@0.0.12

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

- Updated dependencies [b43b762]
  - @trymeka/core@0.0.11

## 0.0.10

### Patch Changes

- Updated dependencies [68d74d0]
  - @trymeka/core@0.0.10

## 0.0.9

### Patch Changes

- Updated dependencies [55b3f48]
  - @trymeka/core@0.0.9

## 0.0.8

### Patch Changes

- 5f937ba: feat(core): add ability to navigate to an initial url per task
  feat(computer-provider-scrapybara): add ability to navigate to a url
- Updated dependencies [5f937ba]
- Updated dependencies [d26d44b]
- Updated dependencies [16ad3f9]
  - @trymeka/core@0.0.8

## 0.0.7

### Patch Changes

- Updated dependencies [bcc0ad0]
  - @trymeka/core@0.0.7

## 0.0.6

### Patch Changes

- 95463e8: chore(computer-provider-scrapybara): move playwright-core into peer dependency due to installation error when trying to package as regular deps

  feat(core): Update api surface area when instantiating and managing sessions

- Updated dependencies [95463e8]
  - @trymeka/core@0.0.6
