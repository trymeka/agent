import type { AgentLog, PlanningData, UserMessage } from "../ai";

/**
 * @internal
 *
 * Creates a function that updates an agent's log with the details of a tool call.
 * This is a higher-order function that takes the context of a tool call and returns
 * a new function that can be used to update the agent's log. This approach is
 * useful for ensuring that log updates are consistent and contain all the necessary
 * information.
 * @param options - The options for creating the agent log update function.
 * @param options.toolCallId - The ID of the tool call.
 * @param options.toolName - The name of the tool that was called.
 * @param options.args - The arguments that were passed to the tool.
 * @param options.reasoning - The reasoning for calling the tool.
 * @param options.screenshot - An optional screenshot to include in the log.
 * @param options.response - The response from the tool.
 * @param options.planningData - Optional planning data to include in the log.
 * @returns A function that takes an `AgentLog` and returns an updated `AgentLog`.
 */
export function createAgentLogUpdate({
  toolCallId,
  toolName,
  args,
  reasoning,
  screenshot,
  response,
  planningData,
}: {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  reasoning?: string;
  screenshot?: {
    value: string;
    overrideLogScreenshot: boolean;
  };
  response: UserMessage;
  planningData?: PlanningData;
}) {
  return (log: AgentLog): AgentLog => {
    const toolCallEntry: AgentLog["modelOutput"]["done"][number] = {
      type: "tool_call",
      toolCallId,
      toolName,
      args,
      result: { type: "response", response },
    };

    if (reasoning) {
      toolCallEntry.reasoning = reasoning;
    }
    if (screenshot) {
      toolCallEntry.screenshot = screenshot.value;
    }
    const updatedLog: AgentLog = {
      ...log,
      modelOutput: {
        done: log.modelOutput.done.concat([toolCallEntry]),
      },
    };
    if (screenshot?.overrideLogScreenshot) {
      updatedLog.screenshot = screenshot.value;
    }
    if (planningData) {
      updatedLog.plan = planningData;
    }

    return updatedLog;
  };
}
