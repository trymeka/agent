import { openai } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

export const o3: LanguageModel = openai("o3");
export const gpt4: LanguageModel = openai("gpt-4");
