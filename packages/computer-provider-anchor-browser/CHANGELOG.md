# @trymeka/computer-provider-anchor-browser

## 0.0.10

### Patch Changes

- 56edb89: Default goto google.com if no initialUrl is set
- Updated dependencies [56edb89]
  - @trymeka/core@0.0.21
  - @trymeka/computer-provider-core@0.0.9

## 0.0.9

### Patch Changes

- Updated dependencies [7497b1d]
  - @trymeka/core@0.0.20
  - @trymeka/computer-provider-core@0.0.8

## 0.0.8

### Patch Changes

- Updated dependencies [c9a21ab]
  - @trymeka/core@0.0.19
  - @trymeka/computer-provider-core@0.0.7

## 0.0.7

### Patch Changes

- 83a4200: docs: add inline documentation to various functions
- Updated dependencies [83a4200]
- Updated dependencies [e4a41ec]
  - @trymeka/computer-provider-core@0.0.6
  - @trymeka/core@0.0.18

## 0.0.6

### Patch Changes

- 0a683d0: chore(computer-provider-core): refactor utility to get instance into core package
- Updated dependencies [0a683d0]
  - @trymeka/computer-provider-core@0.0.5

## 0.0.5

### Patch Changes

- 8ae8a42: chore(computer-provider-anchor-browser): add better support for keymap in anchor browser

## 0.0.4

### Patch Changes

- Updated dependencies [a20fc89]
  - @trymeka/core@0.0.17
  - @trymeka/computer-provider-core@0.0.4

## 0.0.3

### Patch Changes

- Updated dependencies [c07bc46]
  - @trymeka/core@0.0.16
  - @trymeka/computer-provider-core@0.0.3

## 0.0.2

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
