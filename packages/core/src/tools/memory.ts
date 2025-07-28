import z from "zod";
import type { Tool } from ".";
import { createAgentLogUpdate } from "../utils/agent-log";

const memoryToolSchema = z.object({
  key: z
    .string()
    .describe(
      "Unique identifier for this piece of information (e.g., 'customer_counts', 'running_total')",
    ),
  data: z
    .string()
    .describe(
      "Information to store or update. Use structured text or JSON for complex data.",
    ),
  action: z
    .enum(["store", "update", "retrieve", "delete", "list"])
    .describe(
      "Memory action: store (new), update (modify existing), retrieve (get), delete (remove), or list (show all keys)",
    ),
});

export interface MemoryStore {
  get(key: string): string | undefined | Promise<string | undefined>;
  set(key: string, value: string): void | Promise<void>;
  delete(key: string): boolean | Promise<boolean>;
  list(): string[] | Promise<string[]>;
  clear(): void | Promise<void>;
}

// Simple Map-based implementation for session memory
export class SessionMemoryStore implements MemoryStore {
  private store = new Map<string, string>();

  get(key: string): string | undefined {
    return this.store.get(key);
  }

  set(key: string, value: string): void {
    this.store.set(key, value);
  }

  delete(key: string): boolean {
    return this.store.delete(key);
  }

  list(): string[] {
    return Array.from(this.store.keys());
  }

  clear(): void {
    this.store.clear();
  }

  // Get all stored memory as formatted text for context injection
  getMemoryContext(): string {
    if (this.store.size === 0) {
      return "";
    }

    const entries = Array.from(this.store.entries());
    return `PERSISTENT MEMORY:\n${entries.map(([key, value]) => `${key}: ${value}`).join("\n")}\n`;
  }
}

export function createMemoryTool({
  memoryStore,
}: {
  memoryStore: MemoryStore;
}): Tool<typeof memoryToolSchema, { result: string; success: boolean }> {
  return {
    description:
      "Store, update, retrieve, or manage important information that persists across all steps. Use this to maintain running calculations, accumulated data, intermediate results, and any information you need to remember throughout the entire task.",
    schema: memoryToolSchema,
    execute: async (args, context) => {
      const { key, data, action } = args;

      try {
        switch (action) {
          case "store": {
            await memoryStore.set(key, data);
            const response = {
              role: "user" as const,
              content: [
                {
                  type: "text" as const,
                  text: `Successfully stored data under key '${key}'. 
Please proceed with the next step.`,
                },
              ],
            };
            return {
              type: "response",
              response,
              updateCurrentAgentLog: createAgentLogUpdate({
                toolCallId: context.toolCallId,
                toolName: "memory",
                args,
                response,
              }),
            };
          }
          case "update": {
            const existing = await memoryStore.get(key);
            await memoryStore.set(key, data);
            const response = {
              role: "user" as const,
              content: [
                {
                  type: "text" as const,
                  text: existing
                    ? `Successfully updated data for key '${key}'. 
Please proceed with the next step.`
                    : `Key '${key}' didn't exist, successfully stored new data. 
Please proceed with the next step.`,
                },
              ],
            };
            return {
              type: "response",
              response,
              updateCurrentAgentLog: createAgentLogUpdate({
                toolCallId: context.toolCallId,
                toolName: "memory",
                args,
                response,
              }),
            };
          }

          case "retrieve": {
            const value = await memoryStore.get(key);
            const response = {
              role: "user" as const,
              content: [
                {
                  type: "text" as const,
                  text:
                    value === undefined
                      ? `No data found for key '${key}'`
                      : `Successfully retrieved data for key '${key}': ${value}. 
Please proceed with the next step.`,
                },
              ],
            };
            return {
              type: "response",
              response,
              updateCurrentAgentLog: createAgentLogUpdate({
                toolCallId: context.toolCallId,
                toolName: "memory",
                args,
                response,
              }),
            };
          }

          case "delete": {
            const deleted = await memoryStore.delete(key);
            const response = {
              role: "user" as const,
              content: [
                {
                  type: "text" as const,
                  text: deleted
                    ? `Successfully deleted data for key '${key}'. Please proceed with the next step.`
                    : `No data found for key '${key}'. Please proceed with the next step.`,
                },
              ],
            };
            return {
              type: "response",
              response,
              updateCurrentAgentLog: createAgentLogUpdate({
                toolCallId: context.toolCallId,
                toolName: "memory",
                args,
                response,
              }),
            };
          }

          case "list": {
            const keys = await memoryStore.list();
            const response = {
              role: "user" as const,
              content: [
                {
                  type: "text" as const,
                  text:
                    keys.length > 0
                      ? `Successfully retrieved keys. Keys: ${keys.join(", ")}. Please proceed with the next step.`
                      : "No data stored in memory. Please proceed with the next step.",
                },
              ],
            };
            return {
              type: "response",
              response,
              updateCurrentAgentLog: createAgentLogUpdate({
                toolCallId: context.toolCallId,
                toolName: "memory",
                args,
                response,
              }),
            };
          }

          default:
            return {
              type: "completion",
              output: {
                result: `Unknown action for key '${key}' in memory tool: ${action}`,
                success: false,
              },
            };
        }
      } catch (error) {
        return {
          type: "completion",
          output: {
            result: `Memory operation failed: ${error instanceof Error ? error.message : String(error)}`,
            success: false,
          },
        };
      }
    },
  };
}
