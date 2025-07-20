import z from "zod";
import type { Tool } from ".";

const memoryToolSchema = z.object({
  key: z
    .string()
    .describe("Unique identifier for this piece of information (e.g., 'customer_counts', 'running_total')"),
  data: z
    .string()
    .describe("Information to store or update. Use structured text or JSON for complex data."),
  action: z
    .enum(["store", "update", "retrieve", "delete", "list"])
    .describe("Memory action: store (new), update (modify existing), retrieve (get), delete (remove), or list (show all keys)"),
});

export interface MemoryStore {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
  delete(key: string): boolean;
  list(): string[];
  clear(): void;
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
    return `PERSISTENT MEMORY:\n${entries.map(([key, value]) => `${key}: ${value}`).join('\n')}\n`;
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
          case "store":
            memoryStore.set(key, data);
            return {
              result: `Stored data under key '${key}'`,
              success: true,
            };

          case "update":
            const existing = memoryStore.get(key);
            if (existing === undefined) {
              // If key doesn't exist, treat as store
              memoryStore.set(key, data);
              return {
                result: `Key '${key}' didn't exist, stored new data`,
                success: true,
              };
            }
            memoryStore.set(key, data);
            return {
              result: `Updated data for key '${key}'`,
              success: true,
            };

          case "retrieve":
            const value = memoryStore.get(key);
            if (value === undefined) {
              return {
                result: `No data found for key '${key}'`,
                success: false,
              };
            }
            return {
              result: `Data for '${key}': ${value}`,
              success: true,
            };

          case "delete":
            const deleted = memoryStore.delete(key);
            return {
              result: deleted 
                ? `Deleted data for key '${key}'`
                : `No data found for key '${key}'`,
              success: deleted,
            };

          case "list":
            const keys = memoryStore.list();
            return {
              result: keys.length > 0 
                ? `Stored keys: ${keys.join(", ")}`
                : "No data stored in memory",
              success: true,
            };

          default:
            return {
              result: `Unknown action: ${action}`,
              success: false,
            };
        }
      } catch (error) {
        return {
          result: `Memory operation failed: ${error instanceof Error ? error.message : String(error)}`,
          success: false,
        };
      }
    },
  };
} 