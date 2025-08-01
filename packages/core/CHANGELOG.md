# @trymeka/core

## 0.0.24

### Patch Changes

- fd2cbff: chore: add better logging and visibility

## 0.0.23

### Patch Changes

- a07dae7: feat: add lru cache to manually parse images before sending to AI providers to reduce download timeout errors on their end.

## 0.0.22

### Patch Changes

- 348f1fc: Update system prompt to emphasize using up to date information

## 0.0.21

### Patch Changes

- 56edb89: Default goto google.com if no initialUrl is set

## 0.0.20

### Patch Changes

- 7497b1d: Update system prompt to have agent better consider elements in focus and not deprioritize its own reasoning for information

## 0.0.19

### Patch Changes

- c9a21ab: chore(core): update system prompt to include today's date

## 0.0.18

### Patch Changes

- 83a4200: docs: add inline documentation to various functions
- e4a41ec: feat(core): add screenshot after waiting

## 0.0.17

### Patch Changes

- a20fc89: fix(core): type output from agent

## 0.0.16

### Patch Changes

- c07bc46: chore(core): update system prompt to mention new wait tool

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

- 3a16921: chore(core): update typing for the listeners to support async functions

## 0.0.14

### Patch Changes

- 143394d: feat(core): Add support for listeners.

  ```typescript
  import { createOpenAI } from "@ai-sdk/openai";
  import { createVercelAIProvider } from "@trymeka/ai-provider-vercel";
  import { createScrapybaraComputerProvider } from "@trymeka/computer-provider-scrapybara";
  import { createAgent } from "@trymeka/core/ai/agent";
  import { z } from "zod";

  const aiProvider = createVercelAIProvider({
    model: createOpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })("o3"),
  });
  const computerProvider = createScrapybaraComputerProvider({
    apiKey: process.env.SCRAPYBARA_API_KEY,
  });
  const agent = createAgent({
    aiProvider,
    computerProvider,
  });

  const session = await agent.initializeSession();
  const task = await session.runTask({
    instructions: "Summarize the top 3 articles",
    initialUrl: "https://news.ycombinator.com",
    outputSchema: z.object({
      articles: z.array(
        z.object({
          title: z.string(),
          url: z.string(),
          summary: z.string(),
        })
      ),
    }),
    onStep: (args) => {
      console.log("Step", JSON.stringify(args, null, 2));
    },
    onComplete: (args) => {
      console.log("Complete", JSON.stringify(args, null, 2));
    },
  });
  ```

## 0.0.13

### Patch Changes

- 0a1d1f7: fix(core): update parsing of params for tool call

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
