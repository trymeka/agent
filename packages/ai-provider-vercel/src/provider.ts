import type { StandardSchemaV1 } from "@standard-schema/spec";
import type {
  AIProvider,
  AgentMessage,
  GenerateTextResult,
} from "@trymeka/core";
import { type CoreMessage, type LanguageModel, generateText } from "ai";

export class VercelAIProvider implements AIProvider {
  constructor(private model: LanguageModel) {}

  private toCoreMessages(messages: AgentMessage[]): CoreMessage[] {
    return messages.map((message) => {
      if (message.role === "user") {
        return {
          role: "user",
          content: message.content.map(
            (
              c:
                | { type: "text"; text: string }
                | { type: "image"; image: string },
            ) => {
              if (c.type === "text") {
                return { type: "text", text: c.text };
              }
              return { type: "image", image: c.image };
            },
          ),
        };
      }
      return {
        role: "assistant",
        content: message.content.map((c: { type: "text"; text: string }) => ({
          type: "text",
          text: c.text,
        })),
        toolInvocations: message.toolCalls?.map(
          (tc: { toolCallId: string; toolName: string; args: unknown }) => ({
            toolCallId: tc.toolCallId,
            toolName: tc.toolName,
            args: tc.args,
          }),
        ),
      };
    });
  }

  async generateText(options: {
    systemPrompt?: string;
    messages: AgentMessage[];
  }): Promise<GenerateTextResult> {
    const result = await generateText({
      model: this.model,
      system: options.systemPrompt ?? "",
      messages: this.toCoreMessages(options.messages),
    });

    return {
      text: result.text,
      toolCalls: result.toolCalls.map(
        (tc: { toolCallId: string; toolName: string; args: unknown }) => ({
          toolCallId: tc.toolCallId,
          toolName: tc.toolName,
          args: tc.args,
        }),
      ),
    };
  }
  generateObject<T extends StandardSchemaV1>(options: {
    schema: T;
    prompt: string;
    messages?: AgentMessage[];
  }): Promise<StandardSchemaV1.InferOutput<T>> {
    return Promise.reject(new Error("generateObject not implemented yet"));
  }
}
