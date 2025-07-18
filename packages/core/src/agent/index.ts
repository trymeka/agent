import type { StandardSchemaV1 } from "@standard-schema/spec";
// A simplified view of the functional agent creator
import type { AIProvider, AgentMessage, GenerateTextResult } from "../ai";
import type { ComputerProvider } from "../computer";
import type { Logger } from "../logger";
import { type Tool, createCoreTools } from "../tools";

function createNoOpLogger(): Logger {
  return {
    info: console.log,
    error: console.error,
    warn: console.warn,
  };
}

export function createAgent(options: {
  aiProvider: AIProvider;
  computerProvider: ComputerProvider;
  logger?: Logger;
  customTools?: Map<string, Tool<StandardSchemaV1>>;
}) {
  // Dependencies are destructured and composed.
  const { aiProvider, computerProvider } = options;
  const logger = options.logger ?? createNoOpLogger();

  // Combine core and custom tools.
  const coreTools = createCoreTools(computerProvider);
  const allTools = new Map([
    ...coreTools,
    ...(options.customTools?.entries() ?? []),
  ]);

  // The `run` function closes over its dependencies.
  async function run(task: { instructions: string }) {
    logger.info(`Starting agent for task: ${task.instructions}`);

    const messages: AgentMessage[] = [
      { role: "user", content: [{ type: "text", text: task.instructions }] },
    ];

    const result: GenerateTextResult = await aiProvider.generateText({
      messages,
      tools: Object.fromEntries(allTools.entries()),
    });

    // Process the result, call tools, and continue the loop...
    logger.info("Agent finished running.", { result });
  }

  // The public API is a plain object.
  return {
    run,
  };
}
