# Agent NPM Package: Implementation Plan

This document outlines the architecture for a standalone, tree-shakable, and extensible NPM agent package. The design is based on a monorepo structure with a lean core and pluggable adapters, providing a robust foundation that is both powerful and easy for consumers to adopt.

## Core Requirements

1. **LLM Orchestration**: The core logic handles the agent loop (message history, tool calls, responses) and uses the Vercel AI SDK via an adapter.
2. **Swappable Models**: Consumers can switch LLM models easily through the adapter interface without needing to interact directly with the underlying AI SDK.
3. **Structured Logging**: The package provides a hook for consumers to inject a structured logger (like `pino` or `winston`) for observability.
4. **Standard Schema Validation**: Tool and output validation use `StandardSchema` to remain library-agnostic. ([`standard-schema/standard-schema`](https://github.com/standard-schema/standard-schema))
5. **Pluggable Interaction Tools**: The agent interacts with virtual environments through a well-defined `ComputerProvider` interface, which includes a standard set of computer actions and a `task_completion` tool.

---

## Package Architecture: Monorepo with Adapters

The architecture provides a lean `@agent/core` package containing the essential logic and interfaces, paired with separate, installable "adapter" packages for specific implementations (like the Vercel SDK, different computer providers, etc.).

- **Structure**: A monorepo containing multiple packages.
  - `@agent/core`: Contains the main agent factory function and interfaces (`AIProvider`, `Logger`, `ComputerProvider`, `Tool`). No dependencies on specific AI SDKs.
  - `@agent/adapter-vercel`: An implementation of the `AIProvider` interface using the Vercel AI SDK.
  - `@agent/computer-provider-mock`: A mock computer provider for testing.
  - `@agent/computer-provider-scrapybara`: A simplified implementation based on the original `scrapybara.ts`.
- **Usage**:

    ```typescript
    import { createAgent } from '@agent/core';
    import { VercelAIProvider } from '@agent/adapter-vercel';
    import { openai} from '@ai-sdk/openai';
    import { createScrapybaraProvider } from '@agent/computer-provider-scrapybara';
    import { myLogger } from './logger';
    import { myScreenshotUploader } from './uploader';


    // Provider is now instantiated with the model directly.
    const vercelProvider = new VercelAIProvider({ model: openai('o3') });

    // Computer provider is instantiated via a factory, injecting dependencies.
    const computerProvider = createScrapybaraProvider({
      uploadScreenshot: myScreenshotUploader,
    });

    const agent = createAgent({
      aiProvider: vercelProvider,
      computerProvider: computerProvider,
      logger: myLogger,
    });

    agent.run(task);
    ```

### How it meets the requirements

1. **LLM Orchestration**: The `createAgent` function in `@agent/core` contains the execution loop. It calls `aiProvider.generate(...)`, delegating the actual SDK call to the installed adapter (e.g., `@agent/adapter-vercel`).
2. **Swappable Models**: The `@agent/adapter-vercel` package exports model objects. The consumer instantiates the provider with a specific model, and the agent core remains agnostic to the model implementation.
3. **Structured Logging**: The `createAgent` function accepts a `logger` object conforming to a `Logger` interface. It defaults to a no-op logger if none is provided.
4. **Standard Schema Validation**: `@agent/core` depends on `@standard-schema/spec`. Tool definitions and structured outputs use `StandardSchemaV1`, allowing consumers to use Zod, Valibot, etc.
5. **Pluggable Interaction Tools**: `@agent/core` defines a `ComputerProvider` interface. The consumer installs a package that implements this interface and passes an instance to `createAgent`. Core tools like `computer_action` and `task_completion` are pre-defined to call methods on the provided `computerProvider`.

### 1. Monorepo Structure (pnpm)

```plaintext
/agent-package-mono
  /packages
    /core
      - src/
        /agent          # The core agent logic and factory function
          - index.ts
        /ai             # AI Provider abstraction
          - index.ts
        /computer       # Computer interaction abstraction
          - index.ts
        /tools          # Tool definitions and handling
          - index.ts
        /logger         # Logging interface
          - index.ts
        - index.ts      # Main package entry point, re-exporting from features
      - package.json    # Depends on: @standard-schema/spec
    /adapter-vercel
      - src/
        - provider.ts      # VercelAIProvider implementation
        - models.ts        # Model identifiers (o3, geminiPro, etc.)
        - index.ts
      - package.json       # Depends on: @agent/core, ai
    /computer-provider-scrapybara
      - src/
        - provider.ts      # Simplified Scrapybara provider
        - index.ts
      - package.json       # Depends on: @agent/core, scrapybara-client
  - package.json
  - pnpm-workspace.yaml
  - tsconfig.base.json
```

---

### 2. Core Feature Interfaces (`packages/core/src/ai/index.ts`)

The AI provider interface is designed to be lean and flexible, focusing on core generation capabilities.

```typescript
import { StandardSchemaV1 } from '@standard-schema/spec';
import { Tool } from '../tools';

/**
 * Defines the structured messages used for conversations.
 */
export interface UserMessage {
  role: 'user';
  content: Array<{ type: 'text', text: string } | { type: 'image', image: URL|string }>;
}

export interface ToolCall {
    toolCallId: string, toolName: string, args: any
}
export interface AssistantMessage {
  role: 'assistant';
  content: Array<{ type: 'text', text: string }>;
  toolCalls?: ToolCall[];
}



export type AgentMessage = UserMessage | AssistantMessage;

/**
 * The result of a `generateText` call.
 */
export interface GenerateTextResult {
  text: string;
  toolCalls?: Array<ToolCall>;
  // ... other metadata like usage, finishReason
}

/**
 * The result of a `generateObject` call.
 */
export interface GenerateObjectResult<T> {
  object: T;
  // ... other metadata
}

/**
 * The primary interface for an AI Provider.
 */
export interface AIProvider {
  /**
   * Generates a textual response from the model.
   */
  generateText(options: {
      systemPrompt?: string;
    messages: AgentMessage[];
    tools?: Record<string, Tool<any>>;
  }): Promise<GenerateTextResult>;

  /**
   * Generates a structured object that conforms to a given schema.
   */
  generateObject<T extends StandardSchemaV1>(options: {
    schema: T,
    prompt: string,
    messages?: AgentMessage[],
  }): Promise<GenerateObjectResult<StandardSchemaV1.InferOutput<T>>>;
}
```

**Tool Interface (`packages/core/src/tools/index.ts`)**:

```typescript
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { ComputerProvider } from '../computer';

/**
 * Defines a tool that the agent can execute.
 */
export interface Tool<T extends StandardSchemaV1> {
  /** A description of what the tool does, for use by the AI model. */
  description: string;

  /** The schema that defines and validates the tool's arguments. */
  schema: T;

  /** The function to execute when the tool is called. */
  execute(
    args: StandardSchemaV1.InferOutput<T>,
  ): Promise<{ output: string; [key: string]: any }>;
}

// The tools feature also provides a factory for the core tools.
export function createCoreTools(computerProvider: ComputerProvider): Map<string, Tool<any>> {
  // `computer_action` tool delegates to the provided computer provider.
  const computerActionTool: Tool<...> = {
    description: "Performs an action on the computer screen.",
    // A Standard Schema object (e.g., from Zod, Valibot) defines arguments.
    schema: z.object({ /* ... action properties ... */ }),
    execute: async (args) => {
      const result = await computerProvider.performAction(args);
      return { output: result.result };
    }
  };

  // The `task_completion` tool is also defined here.
  const taskCompletionTool: Tool<...> = { /* ... */ };

  return new Map(Object.entries({
    computer_action: computerActionTool,
    task_completion: taskCompletionTool,
  }));
}
```

**Computer Provider Interface (`packages/core/src/computer/index.ts`)**:

```typescript
/** A discriminated union of all possible computer actions. */
export type ComputerAction =
  | { type: 'click'; x: number; y: number; button: 'left' | 'right' | 'wheel' }
  | { type: 'double_click'; x: number; y: number }
  | { type: 'drag'; path: { x: number; y: number }[] }
  | { type: 'keypress'; keys: string[] }
  | { type: 'move'; x: number; y: number }
  | { type: 'scroll'; x: number; y: number; scroll_x: number; scroll_y: number }
  | { type: 'type'; text: string }
  | { type: 'wait'; duration: number };


export interface ComputerProvider {
  /** Takes a screenshot of the environment. */
  takeScreenshot(): Promise<string>; // Returns base64 image string

  /** Uploads a screenshot and returns its public URL. */
  uploadScreenshot(options: {
    screenshotBase64: string;
    sessionId: string;
    step: number;
  }): Promise<{url: string}>;

  /** Executes a standard computer action. */
  performAction(action: ComputerAction): Promise<{ result: string }>;

  /** Any necessary setup or teardown logic. */
  start(sessionId: string): Promise<void>;
  stop(sessionId: string): Promise<void>;
}
```

### 3. Functional Agent Creation (`packages/core/src/agent/index.ts`)

To maximize tree-shakability, the agent itself is composed using factory functions rather than classes. This approach avoids `this` context and prototypes, allowing bundlers to more effectively eliminate unused code. The consumer interacts with a simple `agent` object that exposes a `run` method.

```typescript
// A simplified view of the functional agent creator
import { AIProvider, AgentMessage, GenerateTextResult } from '../ai';
import { ComputerProvider } from '../computer';
import { Logger } from '../logger';
import { Tool, createCoreTools } from '../tools';

export function createAgent(options: {
  aiProvider: AIProvider;
  computerProvider: ComputerProvider;
  logger?: Logger;
  customTools?: Map<string, Tool<any>>;
}) {
  // Dependencies are destructured and composed.
  const { aiProvider, computerProvider } = options;
  const logger = options.logger ?? createNoOpLogger();

  // Combine core and custom tools.
  const coreTools = createCoreTools(computerProvider);
  const allTools = new Map([...coreTools, ...(options.customTools?.entries() ?? [])]);

  // The `run` function closes over its dependencies.
  async function run(task: { instructions: string }) {
    logger.info(`Starting agent for task: ${task.instructions}`);

    const messages: AgentMessage[] = [
      { role: 'user', content: [{ type: 'text', text: task.instructions }] }
    ];

    const result: GenerateTextResult = await aiProvider.generateText({
      messages,
      tools: Object.fromEntries(allTools.entries()),
    });

    // Process the result, call tools, and continue the loop...
    logger.info('Agent finished running.', { result });
  }

  // The public API is a plain object.
  return {
    run,
  };
}
```
