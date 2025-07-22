import { Buffer } from "node:buffer";
import * as fs from "node:fs/promises";
import { createOpenAI } from "@ai-sdk/openai";
import { createVercelAIProvider } from "@trymeka/ai-provider-vercel";
import { createScrapybaraComputerProvider } from "@trymeka/computer-provider-scrapybara";
import { createAgent } from "@trymeka/core/ai/agent";
import OpenAI from "openai";
import { z } from "zod";

interface WebVoyagerTask {
  web_name: string;
  id: string;
  ques: string;
  web: string;
}

interface EvaluationResult {
  taskId: string;
  success: boolean;
  completionTime: number;
  output: unknown;
  gpt4vValidation?: {
    success: boolean;
    reasoning: string;
  };
  finalScreenshots?: string[];
  error?: string;
  logs: unknown[];
}

if (!process.env.SCRAPYBARA_API_KEY) {
  throw new Error("SCRAPYBARA_API_KEY is not set");
}
if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is not set");
}

async function loadWebVoyagerTasks(
  tasksPath: string,
): Promise<WebVoyagerTask[]> {
  const data = await fs.readFile(tasksPath, "utf-8");
  return JSON.parse(data);
}

function createGenericOutputSchema() {
  return z.object({
    success: z
      .boolean()
      .describe("Whether the task was completed successfully"),
    result: z.string().describe("The result of the task execution"),
    explanation: z.string().describe("Explanation of what was accomplished"),
    evidence: z.string().describe("Evidence that the task was completed"),
  });
}

async function validateWithGPT4V(
  task: WebVoyagerTask,
  agentOutput: unknown,
  screenshots: string[],
  openaiClient: OpenAI,
): Promise<{ success: boolean; reasoning: string }> {
  console.log(
    `🔍 GPT-4V Validation: ${screenshots.length} screenshots provided`,
  );

  if (screenshots.length === 0) {
    return {
      success: false,
      reasoning:
        "No screenshots provided for validation. Cannot verify task completion without visual evidence.",
    };
  }

  const SYSTEM_PROMPT = `As an evaluator, you will be presented with three primary components to assist you in your role:

1. Web Task Instruction: This is a clear and specific directive provided in natural language, detailing the online activity to be carried out. These requirements may include conducting searches, verifying information, comparing prices, checking availability, or any other action relevant to the specified web service.

2. Result Screenshots: This is a visual representation of the screen showing the result or intermediate state of performing a web task. It serves as visual proof of the actions taken in response to the instruction.

3. Result Response: This is a textual response obtained after the execution of the web task. It serves as textual result in response to the instruction.

-- You DO NOT NEED to interact with web pages or perform actions such as booking flights or conducting searches on websites.
-- You SHOULD NOT make assumptions based on information not presented in the screenshot when comparing it to the instructions.
-- Your primary responsibility is to conduct a thorough assessment of the web task instruction against the outcome depicted in the screenshot and in the response, evaluating whether the actions taken align with the given instructions.
-- NOTE that the instruction may involve more than one task, for example, locating the garage and summarizing the review. Failing to complete either task, such as not providing a summary, should be considered unsuccessful.
-- NOTE that the screenshot is authentic, but the response provided by LLM is generated at the end of web browsing, and there may be discrepancies between the text and the screenshots.
-- Note the difference: 1) Result response may contradict the screenshot, then the content of the screenshot prevails, 2) The content in the Result response is not mentioned on the screenshot, choose to believe the content.

You should elaborate on how you arrived at your final evaluation and then provide a definitive verdict on whether the task has been successfully accomplished, either as 'SUCCESS' or 'NOT SUCCESS'.`;

  const USER_PROMPT = `TASK: ${task.ques}
Result Response: ${(agentOutput as { result?: string })?.result ?? ""}
${screenshots.length} screenshots at the end: `;

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        { type: "text", text: USER_PROMPT },
        ...screenshots.map((screenshot) => ({
          type: "image_url",
          image_url: { url: screenshot },
        })),
        { type: "text", text: "Your verdict:\n" },
      ],
    },
  ];

  console.log(
    `📤 Sending ${screenshots.length} screenshots to GPT-4V for validation`,
  );

  try {
    const response = await openaiClient.chat.completions.create({
      model: "o3",
      messages: messages as OpenAI.ChatCompletionMessageParam[],
      max_completion_tokens: 1000,
      seed: 42,
    });

    const reasoning = response.choices[0]?.message?.content || "";
    const success = !reasoning.includes("NOT SUCCESS");

    return { success, reasoning };
  } catch (error) {
    console.error("GPT-4V validation failed:", error);
    return { success: false, reasoning: "Validation failed" };
  }
}

type TaskLogger = {
  info: (message: string, data?: unknown) => void;
  error: (message: string, data?: unknown) => void;
  warn: (message: string, data?: unknown) => void;
  screenshot: (screenshotDataUrl: string, data?: unknown) => void;
};

async function evaluateTask(
  aiProvider: unknown,
  task: WebVoyagerTask,
  openaiClient: OpenAI,
): Promise<EvaluationResult> {
  const startTime = Date.now();
  const logs: unknown[] = [];

  try {
    console.log(`\n=== Starting Task: ${task.id} - ${task.web_name} ===`);
    console.log(`URL: ${task.web}`);
    console.log(`Question: ${task.ques}`);

    const taskLogger: TaskLogger = {
      info: (message: string, data?: unknown) => {
        logs.push({
          level: "info",
          message,
          data,
          timestamp: new Date().toISOString(),
        });
        if (data) {
          console.log(`[INFO] ${message}`, data);
        } else {
          console.log(`[INFO] ${message}`);
        }
      },
      error: (message: string, data?: unknown) => {
        logs.push({
          level: "error",
          message,
          data,
          timestamp: new Date().toISOString(),
        });
        if (data) {
          console.error(`[ERROR] ${message}`, data);
        } else {
          console.error(`[ERROR] ${message}`);
        }
      },
      warn: (message: string, data?: unknown) => {
        logs.push({
          level: "warn",
          message,
          data,
          timestamp: new Date().toISOString(),
        });
        if (data) {
          console.warn(`[WARN] ${message}`, data);
        } else {
          console.warn(`[WARN] ${message}`);
        }
      },
      screenshot: (screenshotDataUrl: string, data?: unknown) => {
        logs.push({
          level: "screenshot",
          message: "screenshot",
          screenshot: screenshotDataUrl,
          data,
          timestamp: new Date().toISOString(),
        });
        const preview =
          screenshotDataUrl && typeof screenshotDataUrl === "string"
            ? `${screenshotDataUrl.slice(0, 30)}...`
            : "";
        if (data) {
          console.log("[SCREENSHOT] Screenshot taken", { ...data, preview });
        } else {
          console.log("[SCREENSHOT] Screenshot taken", { preview });
        }
      },
    };

    const computerProvider = createScrapybaraComputerProvider({
      apiKey: process.env.SCRAPYBARA_API_KEY ?? "",
      initialUrl: task.web,
      uploadScreenshot: async ({ screenshotBase64, sessionId, step }) => {
        const buffer = Buffer.from(screenshotBase64, "base64");
        const dir = "logs/screenshots";
        const filename = `${dir}/screenshot-${sessionId}-${step}.png`;
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(filename, buffer);

        taskLogger.screenshot(`data:image/png;base64,${screenshotBase64}`, {
          sessionId,
          step,
        });

        return { url: `data:image/png;base64,${screenshotBase64}` };
      },
    });

    const taskAgent = createAgent({
      aiProvider,
      computerProvider,
      logger: taskLogger,
    });

    const session = await taskAgent.initializeSession();

    const result = await session.runTask({
      instructions: task.ques,
      outputSchema: createGenericOutputSchema(),
    });

    const completionTime = Date.now() - startTime;

    await session.end();

    console.log(`\n=== Task ${task.id} Completed ===`);
    console.log(`Time: ${completionTime}ms`);
    console.log(
      "Result:",
      JSON.stringify((result as { result: unknown }).result, null, 2),
    );

    const finalScreenshots = (logs as unknown[])
      .filter((log: unknown) => {
        const l = log as Record<string, unknown>;
        return (
          (l.data && typeof l.data === "object" && "screenshot" in l.data) ||
          (l.data && typeof l.data === "object" && "image" in l.data) ||
          (l.data &&
            typeof l.data === "object" &&
            typeof (l.data as Record<string, unknown>).url === "string" &&
            ((l.data as Record<string, unknown>).url as string).includes(
              "data:image",
            )) ||
          (l.data &&
            typeof l.data === "object" &&
            typeof (l.data as Record<string, unknown>).url === "string" &&
            ((l.data as Record<string, unknown>).url as string).includes(
              "http",
            )) ||
          "screenshot" in l ||
          (typeof l.message === "string" && l.message.includes("screenshot"))
        );
      })
      .map((log: unknown) => {
        const l = log as Record<string, unknown>;
        return (
          l.screenshot ||
          (l.data &&
            typeof l.data === "object" &&
            "screenshot" in l.data &&
            (l.data as Record<string, unknown>).screenshot) ||
          (l.data &&
            typeof l.data === "object" &&
            "image" in l.data &&
            (l.data as Record<string, unknown>).image) ||
          (l.data &&
            typeof l.data === "object" &&
            "url" in l.data &&
            (l.data as Record<string, unknown>).url) ||
          (l.data &&
            typeof l.data === "object" &&
            "data" in l.data &&
            (l.data as Record<string, unknown>).data) ||
          (typeof l.message === "string" &&
            l.message.match(/data:image[^"'\s]+/)?.[0]) ||
          (typeof l.message === "string" &&
            l.message.match(/https?:\/\/[^\s"']+/)?.[0])
        );
      })
      .filter(Boolean)
      .slice(-15);

    const finalDir = "logs/final_screenshots";
    await fs.mkdir(finalDir, { recursive: true });
    for (let i = 0; i < finalScreenshots.length; ++i) {
      const dataUrl = finalScreenshots[i];
      if (
        typeof dataUrl === "string" &&
        dataUrl.startsWith("data:image/png;base64,")
      ) {
        const base64 = dataUrl.replace("data:image/png;base64,", "");
        const buffer = Buffer.from(base64, "base64");
        const filename = `${finalDir}/final-${task.id}-${i + 1}.png`;
        await fs.writeFile(filename, buffer);
        console.log(`Saved final screenshot for evaluation: ${filename}`);
      } else {
        console.warn(`finalScreenshots[${i}] is not a valid PNG data URL.`);
      }
    }

    console.log(
      `📸 Found ${finalScreenshots.length} screenshots for validation`,
    );
    if (finalScreenshots.length === 0) {
      console.log("⚠️  No screenshots found in logs. Log entries:", logs.length);
    }

    let gpt4vValidation: { success: boolean; reasoning: string } | undefined;
    try {
      gpt4vValidation = await validateWithGPT4V(
        task,
        (result as { result: unknown }).result,
        finalScreenshots as string[],
        openaiClient,
      );
      console.log(
        `GPT-4V Validation: ${gpt4vValidation.success ? "SUCCESS" : "FAILED"}`,
      );
      console.log(`Reasoning: ${gpt4vValidation.reasoning}`);
    } catch (validationError) {
      console.error("Validation failed:", validationError);
      gpt4vValidation = { success: false, reasoning: "Validation error" };
    }

    const finalSuccess = gpt4vValidation?.success ?? false;

    console.log("\n=== Final Evaluation ===");
    console.log(
      `Agent Success: ${
        (result as { result: { success: boolean } }).result.success
      }`,
    );
    console.log(`GPT-4V Success: ${gpt4vValidation?.success}`);
    console.log(`Final Success: ${finalSuccess}`);

    return {
      taskId: task.id,
      success: finalSuccess,
      completionTime,
      output: (result as { result: unknown }).result,
      gpt4vValidation,
      finalScreenshots: finalScreenshots as string[],
      logs,
    };
  } catch (error) {
    const completionTime = Date.now() - startTime;
    console.error(`\n=== Task ${task.id} Failed ===`);
    console.error("Error:", error);

    return {
      taskId: task.id,
      success: false,
      completionTime,
      output: null,
      error: error instanceof Error ? error.message : String(error),
      logs,
    };
  }
}

async function runWebVoyagerEvaluation(
  tasksPath: string,
  outputPath: string,
  modelName = "o3",
) {
  console.log("\n🚀 Starting WebVoyager Benchmark Evaluation 🚀");

  const allTasks = await loadWebVoyagerTasks(tasksPath);

  const aiProvider = createVercelAIProvider({
    model: createOpenAI({
      apiKey: process.env.OPENAI_API_KEY ?? "",
    })(modelName),
  });

  const openaiClient = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY ?? "",
  });

  const results: EvaluationResult[] = [];
  const startTime = Date.now();

  for (let i = 0; i < allTasks.length; i++) {
    const task = allTasks[i];
    if (!task) {
      console.error(`Task ${i} is undefined`);
      continue;
    }
    console.log(`\n📊 Progress: ${i + 1}/${allTasks.length}`);

    const result = await evaluateTask(aiProvider, task, openaiClient);
    results.push(result);

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  const totalTime = Date.now() - startTime;
  const successfulTasks = results.filter((r) => r.success).length;
  const successRate = (successfulTasks / results.length) * 100;
  const avgCompletionTime =
    results.reduce((sum, r) => sum + r.completionTime, 0) / results.length;

  const summary = {
    totalTasks: results.length,
    successfulTasks,
    successRate: `${successRate.toFixed(2)}%`,
    totalTime: `${(totalTime / 1000).toFixed(2)}s`,
    avgCompletionTime: `${(avgCompletionTime / 1000).toFixed(2)}s`,
    model: modelName,
  };

  console.log("\n🎯 Evaluation Complete!");
  console.log("Summary:", summary);

  const finalOutput = {
    metadata: {
      ...summary,
      startTime: new Date(startTime).toISOString(),
      endTime: new Date().toISOString(),
    },
    results,
  };

  await fs.writeFile(outputPath, JSON.stringify(finalOutput, null, 2));
  console.log(`\n Results saved to: ${outputPath}`);

  return finalOutput;
}

async function main() {
  const args = process.argv.slice(2);
  const tasksPath = args[0] || "examples/webvoyager-tasks-sample.json";
  const outputPath = args[1] || "webvoyager-results.json";

  await runWebVoyagerEvaluation(tasksPath, outputPath);
}

main();

export { runWebVoyagerEvaluation, evaluateTask, loadWebVoyagerTasks };
