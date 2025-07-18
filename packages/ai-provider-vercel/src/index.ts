import type { StandardSchemaV1 } from "@standard-schema/spec";
import type {
  AIProvider,
  AgentMessage,
  GenerateObjectResult,
  GenerateTextResult,
} from "@trymeka/core";
import {
  type CoreMessage,
  type LanguageModel,
  generateObject,
  generateText,
  jsonSchema,
} from "ai";

function toCoreMessages(messages: AgentMessage[]): CoreMessage[] {
  return messages.map((message) => {
    if (message.role === "user") {
      return {
        role: "user",
        content: message.content,
      };
    }
    return {
      role: "assistant",
      content: message.content,
      toolInvocations: message.toolCalls?.map((tc) => ({
        toolCallId: tc.toolCallId,
        toolName: tc.toolName,
        args: tc.args,
      })),
    };
  });
}

export function createVercelAIProvider({
  model,
}: { model: LanguageModel }): AIProvider {
  return {
    get modelName() {
      return model.modelId;
    },
    async generateText(options: {
      systemPrompt?: string;
      messages: AgentMessage[];
    }): Promise<GenerateTextResult> {
      const result = await generateText({
        model,
        ...(options.systemPrompt ? { system: options.systemPrompt } : {}),
        messages: toCoreMessages(options.messages),
      });

      return {
        text: result.text,
        toolCalls: result.toolCalls.map((tc) => ({
          toolCallId: tc.toolCallId,
          toolName: tc.toolName,
          args: tc.args,
        })),
        usage: result.usage,
      };
    },
    async generateObject<T extends StandardSchemaV1>(options: {
      schema: T;
      prompt: string;
      systemPrompt?: string;
      messages?: AgentMessage[];
    }): Promise<GenerateObjectResult<T>> {
      const result = await generateObject({
        model,
        schema: jsonSchema<StandardSchemaV1.InferOutput<T>>(options.schema),
        ...(options.systemPrompt ? { system: options.systemPrompt } : {}),
        messages: toCoreMessages(options.messages ?? []),
      });
      return {
        object: result.object,
        usage: result.usage,
      };
    },
  };
}
