import type { AgentLog, AgentMessage } from "./index";

/**
 * Serializable session state for persistence across task restarts
 */
export interface SerializableSessionState {
  sessionId: string;
  currentStep: number;

  // Session metadata
  instructions: string;
  initialUrl?: string;

  // Browser connection info
  computerProviderId: string;
  liveUrl?: string;
  cdpUrl?: string;

  // Current task state
  task: {
    id: string;
    logs: AgentLog[];
  };

  // Conversation state (last 7 steps due to CONVERSATION_LOOK_BACK)
  conversationChunks: Record<number, AgentMessage[]>;

  // Memory store data
  memoryData: Record<string, string>;

  // Timestamps
  createdAt: string;
  lastSavedAt: string;
}

/**
 * Session restoration result
 */
export interface SessionRestorationResult {
  success: boolean;
  action: "resumed" | "restarted" | "failed";
  message: string;
  sessionState?: SerializableSessionState;
}
