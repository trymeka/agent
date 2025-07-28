# @trymeka/computer-provider-e2b

## 0.0.2

### Patch Changes

- 0a683d0: feat(E2B): add support for E2B `ComputerProvider`

  Usage is similar to Scapybara` today:

  ```typescript
  const computerProvider = createE2BComputerProvider({
    apiKey: process.env.E2B_API_KEY,
    initialUrl: "https://news.ycombinator.com/news",
  });
  const agent = createAgent({
    aiProvider: createVercelAIProvider({...}),
    computerProvider,
  });
  ```

- Updated dependencies [0a683d0]
  - @trymeka/computer-provider-core@0.0.5
