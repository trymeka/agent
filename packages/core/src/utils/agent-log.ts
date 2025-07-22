import type { AgentLog, PlanningData, UserMessage } from "../ai";

export function createAgentLogUpdate({
  toolCallId,
  toolName,
  args,
  reasoning,
  screenshot,
  response,
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

    return updatedLog;
  };
}
