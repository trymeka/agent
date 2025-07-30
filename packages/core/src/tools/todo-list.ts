import z from "zod";
import type { Tool } from ".";
import { createAgentLogUpdate } from "../utils/agent-log";

const ToDoListToolSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("add"),
    tasks: z
      .array(
        z.object({
          description: z
            .string()
            .describe("The description of the task to add."),
        }),
      )
      .describe("An array of tasks to add to the list."),
  }),
  z.object({
    action: z.literal("update"),
    tasks: z
      .array(
        z.object({
          id: z.string().describe("The ID of the task to update."),
          status: z
            .enum(["pending", "in-progress", "completed", "cancelled"])
            .describe("The new status of the task."),
          description: z
            .string()
            .optional()
            .describe("A new description for the task."),
        }),
      )
      .describe("An array of tasks to update."),
  }),
  z.object({
    action: z.literal("list"),
  }),
]);

export interface ToDo {
  id: string;
  description: string;
  status: "pending" | "in-progress" | "completed" | "cancelled";
}

export interface ToDoListStore {
  get(id: string): ToDo | undefined | Promise<ToDo | undefined>;
  add(tasks: { description: string }[]): ToDo[] | Promise<ToDo[]>;
  update(
    updates: {
      id: string;
      status?: "pending" | "in-progress" | "completed" | "cancelled";
      description?: string | undefined;
    }[],
  ): (ToDo | undefined)[] | Promise<(ToDo | undefined)[]>;
  list(): ToDo[] | Promise<ToDo[]>;
  clear(): void | Promise<void>;
}

export class SessionToDoListStore implements ToDoListStore {
  private store = new Map<string, ToDo>();
  private nextId = 1;

  private generateId(): string {
    return (this.nextId++).toString();
  }

  add(tasks: { description: string }[]): ToDo[] {
    const newTasks: ToDo[] = [];
    for (const task of tasks) {
      const newTask: ToDo = {
        id: this.generateId(),
        description: task.description,
        status: "pending",
      };
      this.store.set(newTask.id, newTask);
      newTasks.push(newTask);
    }
    return newTasks;
  }

  update(
    updates: {
      id: string;
      status?: "pending" | "in-progress" | "completed" | "cancelled";
      description?: string;
    }[],
  ): (ToDo | undefined)[] {
    return updates.map((update) => {
      const task = this.store.get(update.id);
      if (task) {
        if (update.status) {
          task.status = update.status;
        }
        if (update.description) {
          task.description = update.description;
        }
        this.store.set(task.id, task);
        return task;
      }
      return undefined;
    });
  }

  get(id: string): ToDo | undefined {
    return this.store.get(id);
  }

  list(): ToDo[] {
    return Array.from(this.store.values());
  }

  clear(): void {
    this.store.clear();
  }

  // Get all tasks as formatted text for context injection
  getTaskListContext(): string {
    if (this.store.size === 0) {
      return "";
    }

    const tasks = Array.from(this.store.values());
    return `CURRENT TASK LIST:\n${tasks
      .map((task) => `[${task.status}] ${task.id}: ${task.description}`)
      .join("\n")}\n`;
  }
}

export function createToDoListTool({
  toDoListStore,
}: {
  toDoListStore: ToDoListStore;
}): Tool<typeof ToDoListToolSchema, { result: string; success: boolean }> {
  return {
    description:
      "Create, manage, and track a list of tasks to complete the user's request. Use this to break down complex tasks into smaller steps and track your progress.",
    schema: ToDoListToolSchema,
    execute: async (args, context) => {
      try {
        switch (args.action) {
          case "add": {
            const newTasks = await toDoListStore.add(args.tasks);
            const response = {
              role: "user" as const,
              content: [
                {
                  type: "text" as const,
                  text: `Successfully added ${
                    newTasks.length
                  } task(s). Here is the updated task list:
${(await toDoListStore.list())
  .map((t) => `[${t.status}] ${t.id}: ${t.description}`)
  .join("\n")}
Please proceed with the next step.`,
                },
              ],
            };
            return {
              type: "response",
              response,
              updateCurrentAgentLog: createAgentLogUpdate({
                toolCallId: context.toolCallId,
                toolName: "task_list",
                args,
                response,
              }),
            };
          }
          case "update": {
            await toDoListStore.update(args.tasks);
            const response = {
              role: "user" as const,
              content: [
                {
                  type: "text" as const,
                  text: `Successfully updated task(s). Here is the updated task list:
${(await toDoListStore.list())
  .map((t) => `[${t.status}] ${t.id}: ${t.description}`)
  .join("\n")}
Please proceed with the next step.`,
                },
              ],
            };
            return {
              type: "response",
              response,
              updateCurrentAgentLog: createAgentLogUpdate({
                toolCallId: context.toolCallId,
                toolName: "task_list",
                args,
                response,
              }),
            };
          }

          case "list": {
            const tasks = await toDoListStore.list();
            const response = {
              role: "user" as const,
              content: [
                {
                  type: "text" as const,
                  text:
                    tasks.length > 0
                      ? `Current task list:\n${tasks
                          .map((t) => `[${t.status}] ${t.id}: ${t.description}`)
                          .join("\n")}\nPlease proceed with the next step.`
                      : "The task list is empty. Please add tasks to get started.",
                },
              ],
            };
            return {
              type: "response",
              response,
              updateCurrentAgentLog: createAgentLogUpdate({
                toolCallId: context.toolCallId,
                toolName: "task_list",
                args,
                response,
              }),
            };
          }
          default:
            return {
              type: "completion",
              output: {
                // @ts-expect-error - action is never
                result: `Unknown action in task list tool: ${args.action}`,
                success: false,
              },
            };
        }
      } catch (error) {
        return {
          type: "completion",
          output: {
            result: `Task list operation failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
            success: false,
          },
        };
      }
    },
  };
}
