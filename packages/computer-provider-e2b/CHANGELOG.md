# @trymeka/computer-provider-e2b

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

## 0.0.12

### Patch Changes

- b015dcd: Add wait tool within computer_action
- Updated dependencies [b015dcd]
  - @trymeka/computer-provider-core@0.0.15
  - @trymeka/core@0.0.27

## 0.0.11

### Patch Changes

- Updated dependencies [15bdfbc]
  - @trymeka/core@0.0.26
  - @trymeka/computer-provider-core@0.0.14

## 0.0.10

### Patch Changes

- 5992f16: Add ability to persist sessions (save state & load / restore)
- Updated dependencies [5992f16]
  - @trymeka/computer-provider-core@0.0.13
  - @trymeka/core@0.0.25

## 0.0.9

### Patch Changes

- fd2cbff: feat: add support for retries on E2B SDK calls
- Updated dependencies [fd2cbff]
  - @trymeka/core@0.0.24
  - @trymeka/computer-provider-core@0.0.12

## 0.0.8

### Patch Changes

- Updated dependencies [a07dae7]
  - @trymeka/core@0.0.23
  - @trymeka/computer-provider-core@0.0.11

## 0.0.7

### Patch Changes

- Updated dependencies [348f1fc]
  - @trymeka/core@0.0.22
  - @trymeka/computer-provider-core@0.0.10

## 0.0.6

### Patch Changes

- Updated dependencies [56edb89]
  - @trymeka/core@0.0.21
  - @trymeka/computer-provider-core@0.0.9

## 0.0.5

### Patch Changes

- Updated dependencies [7497b1d]
  - @trymeka/core@0.0.20
  - @trymeka/computer-provider-core@0.0.8

## 0.0.4

### Patch Changes

- Updated dependencies [c9a21ab]
  - @trymeka/core@0.0.19
  - @trymeka/computer-provider-core@0.0.7

## 0.0.3

### Patch Changes

- 83a4200: docs: add inline documentation to various functions
- Updated dependencies [83a4200]
- Updated dependencies [e4a41ec]
  - @trymeka/computer-provider-core@0.0.6
  - @trymeka/core@0.0.18

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
