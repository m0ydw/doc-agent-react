/**
 * AI Agent API 封装
 */

import { sendAgentMessage as wsSendAgentMessage } from "./wsAgentClient";
import { config } from "@/config";
import type {
  AgentEvent,
  AgentMode,
  AgentStatus,
  StatusResponse,
  ModelConfig,
} from "./agentTypes";

export type {
  AgentEvent,
  AgentMode,
  AgentStatus,
  StatusResponse,
  ModelConfig,
  ModelPreset,
} from "./agentTypes";

export { BUILTIN_PRESETS } from "./agentTypes";

const AI_BASE_URL = config.aiApiUrl;

/** 发送消息到 AI Agent，返回 AbortController 用于取消 */
export function sendAgentMessage(
  message: string,
  contextDocId?: string,
  mode?: AgentMode,
  modelConfig?: ModelConfig,
  onEvent?: (event: AgentEvent) => void,
  onDone?: () => void,
  onError?: (error: string) => void
): AbortController {
  const ws = wsSendAgentMessage(
    message,
    contextDocId,
    mode,
    modelConfig,
    onEvent,
    onDone,
    onError
  );
  const controller = new AbortController();
  controller.signal.addEventListener("abort", () => ws.close());
  return controller;
}

/** 查询 Agent 状态 */
export async function getAgentStatus(): Promise<AgentStatus | null> {
  try {
    const res = await fetch(`${AI_BASE_URL}/agent/status`);
    const data: StatusResponse = await res.json();
    return data.success ? data.data : null;
  } catch {
    return null;
  }
}

/** 重置 Agent 记忆 */
export async function resetAgent(): Promise<boolean> {
  try {
    const res = await fetch(`${AI_BASE_URL}/agent/reset`, { method: "POST" });
    const data = await res.json();
    return data.success === true;
  } catch {
    return false;
  }
}

/** 设置 Agent LLM 配置 */
export async function setAgentConfig(config: ModelConfig): Promise<boolean> {
  try {
    const res = await fetch(`${AI_BASE_URL}/agent/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    const data = await res.json();
    return data.success === true;
  } catch {
    return false;
  }
}
