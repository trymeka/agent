# @trymeka/computer-provider-scrapybara

## 0.1.3

### Patch Changes

- 4ffcc79: Wait between computer actions and update fallback text on reasoning
- Updated dependencies [4ffcc79]
  - @trymeka/computer-provider-core@0.1.3
  - @trymeka/core@0.1.3

## 0.1.2

### Patch Changes

- 8565249: Give the agent clarity on screenshot numbers
- Updated dependencies [8565249]
  - @trymeka/computer-provider-core@0.1.2
  - @trymeka/core@0.1.2

## 0.1.1

### Patch Changes

- 9acfbf5: Fix computer use "screenshot" tool call problem and add smarter waiting between steps
- Updated dependencies [9acfbf5]
  - @trymeka/computer-provider-core@0.1.1
  - @trymeka/core@0.1.1

## 0.1.0

### Minor Changes

- 0cf3957: Bump major version on vercel ai sdk

### Patch Changes

- b0467db: refactor: Use standard `ScreenSize` type imports
- Updated dependencies [b0467db]
- Updated dependencies [76ef044]
- Updated dependencies [0cf3957]
  - @trymeka/core@0.1.0
  - @trymeka/computer-provider-core@0.1.0

## 0.0.28

### Patch Changes

- b015dcd: Add wait tool within computer_action
- Updated dependencies [b015dcd]
  - @trymeka/computer-provider-core@0.0.15
  - @trymeka/core@0.0.27

## 0.0.27

### Patch Changes

- Updated dependencies [15bdfbc]
  - @trymeka/core@0.0.26
  - @trymeka/computer-provider-core@0.0.14

## 0.0.26

### Patch Changes

- 5992f16: Add ability to persist sessions (save state & load / restore)
- Updated dependencies [5992f16]
  - @trymeka/computer-provider-core@0.0.13
  - @trymeka/core@0.0.25

## 0.0.25

### Patch Changes

- Updated dependencies [fd2cbff]
  - @trymeka/core@0.0.24
  - @trymeka/computer-provider-core@0.0.12

## 0.0.24

### Patch Changes

- Updated dependencies [a07dae7]
  - @trymeka/core@0.0.23
  - @trymeka/computer-provider-core@0.0.11

## 0.0.23

### Patch Changes

- Updated dependencies [348f1fc]
  - @trymeka/core@0.0.22
  - @trymeka/computer-provider-core@0.0.10

## 0.0.22

### Patch Changes

- Updated dependencies [56edb89]
  - @trymeka/core@0.0.21
  - @trymeka/computer-provider-core@0.0.9

## 0.0.21

### Patch Changes

- Updated dependencies [7497b1d]
  - @trymeka/core@0.0.20
  - @trymeka/computer-provider-core@0.0.8

## 0.0.20

### Patch Changes

- Updated dependencies [c9a21ab]
  - @trymeka/core@0.0.19
  - @trymeka/computer-provider-core@0.0.7

## 0.0.19

### Patch Changes

- 83a4200: docs: add inline documentation to various functions
- Updated dependencies [83a4200]
- Updated dependencies [e4a41ec]
  - @trymeka/computer-provider-core@0.0.6
  - @trymeka/core@0.0.18

## 0.0.18

### Patch Changes

- Updated dependencies [0a683d0]
  - @trymeka/computer-provider-core@0.0.5

## 0.0.17

### Patch Changes

- Updated dependencies [a20fc89]
  - @trymeka/core@0.0.17
  - @trymeka/computer-provider-core@0.0.4

## 0.0.16

### Patch Changes

- Updated dependencies [c07bc46]
  - @trymeka/core@0.0.16
  - @trymeka/computer-provider-core@0.0.3

## 0.0.15

### Patch Changes

- 6e8ccd9: fix(core): Update `computer_action` tool to support fixing missing fields in JSON object
  fix(computer-provider-scrapybara): Prevent scrolling by 0 from throwing errors
  feat(computer-provider-anchor-browser): Add support for anchor browser as underlying computer provider. See `examples/src/anchor-browser.ts` for a full example.

  ```typescript
  const aiProvider = createVercelAIProvider({
    model: createAnthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    })("claude-4-sonnet-20250514"),
  });
  const computerProvider = createAnchorBrowserComputerProvider({
    apiKey: process.env.ANCHOR_BROWSER_API_KEY,
  });
  const agent = createAgent({
    aiProvider,
    computerProvider,
  });
  // initialize session and run task
  ```

- Updated dependencies [6e8ccd9]
- Updated dependencies [3a16921]
  - @trymeka/core@0.0.15
  - @trymeka/computer-provider-core@0.0.2

## 0.0.14

### Patch Changes

- Updated dependencies [143394d]
  - @trymeka/core@0.0.14

## 0.0.13

### Patch Changes

- Updated dependencies [0a1d1f7]
  - @trymeka/core@0.0.13

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
