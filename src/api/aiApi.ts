/**
 * AI Agent API 封装 — WebSocket 版本
 *
 * 传输层：
 *   WebSocket (ws://localhost:3000/ws/agent) — 替代旧的 HTTP SSE
 *
 * 事件类型定义与旧版完全兼容，前端 AgentPanel 无需任何改动。
 */

import { sendAgentMessage as wsSendAgentMessage } from "./wsAgentClient";
import { config } from "@/config";

const AI_BASE_URL = config.aiApiUrl;

// ================================================================
// 结构化事件类型定义
// ================================================================

/** Agent 工作模式 */
export type AgentMode = "workflow" | "chat";

/** 阶段事件 */
export interface PhaseEvent {
  type: "phase_start";
  phase: string;       // "analyze" | "plan" | "execute" | "validate"
}

/** 阶段结束事件 */
export interface PhaseEndEvent {
  type: "phase_end";
  phase: string;
}

/** 思考过程 */
export interface ThoughtEvent {
  type: "thought";
  content: string;
}

/** 用户可见内容 */
export interface ContentEvent {
  type: "content";
  content: string;
}

/** React Agent 模式的纯文本流式内容（逐 token） */
export interface ChatContentEvent {
  type: "chat_content";
  content: string;
}

/** 工具调用 */
export interface ToolCallEvent {
  type: "tool_call";
  tool: string;
  args: string;
}

/** 工具调用开始（中间 loading 状态） */
export interface ToolStartEvent {
  type: "tool_start";
  tool: string;
  args: string;
}

/** 工具执行结果 */
export interface ToolResultEvent {
  type: "tool_result";
  content: string;
  /** 工具执行是否成功（避免前端用 includes("失败") 中文推断） */
  success: boolean;
}

/** 文档目标信息 */
export interface DocTargetEvent {
  type: "doc_target";
  fileName: string;
}

/** 阶段内容（如阶段分析文本） */
export interface PhaseContentEvent {
  type: "phase_content";
  phase: string;
  content: string;
}

/** Todo 列表 */
export interface TodoListEvent {
  type: "todo_list";
  tasks: Array<{ id: string; goal: string }>;
}

/** Todo 项完成 */
export interface TodoDoneEvent {
  type: "todo_done";
  id: string;
}

/** 最终总结 */
export interface SummaryEvent {
  type: "summary";
  result: "success" | "failed" | "intervention" | "retry";
  summary_text: string;
  detail: string;
  failed_tasks: string[];
}

/** 错误事件 */
export interface ErrorEvent {
  type: "error";
  message: string;
}

/** 警告事件（改进项5 — 降级通知，不影响流程） */
export interface WarningEvent {
  type: "warning";
  message: string;
}

/** 阶段状态事件 */
export interface PhaseStatusEvent {
  type: "phase_status";
  text: string;
}

/** 联合事件类型 */
export type AgentEvent =
  | PhaseEvent | PhaseEndEvent
  | ThoughtEvent | ContentEvent | ChatContentEvent
  | ToolCallEvent | ToolStartEvent | ToolResultEvent
  | DocTargetEvent | PhaseStatusEvent
  | SummaryEvent | PhaseContentEvent
  | TodoListEvent | TodoDoneEvent
  | ErrorEvent | WarningEvent;

// ================================================================
// API 函数
// ================================================================

export interface AgentStatus {
  initialized: boolean;
  availableDocs: number;
  memoryEntries: number;
}

export interface StatusResponse {
  success: boolean;
  data: AgentStatus;
}

export interface ModelConfig {
  provider: "zhipu" | "deepseek" | "openai" | string;
  apiKey?: string;
  model?: string;
  modelKwargs?: Record<string, unknown>;
}

/**
 * 模型预设（标签化存储）
 */
export interface ModelPreset {
  id: string;
  label: string;
  provider: string;
  model?: string;
  modelKwargs?: Record<string, unknown>;
  apiKey?: string;
}

/** 内置预设 */
export const BUILTIN_PRESETS: ModelPreset[] = [
  { id: "zhipu-glm4",  label: "智谱 GLM-4-Flash", provider: "zhipu",   model: "glm-4-flash" },
  { id: "deepseek-chat", label: "DeepSeek Chat",   provider: "deepseek", model: "deepseek-chat" },
  { id: "deepseek-v4", label: "DeepSeek V4-Flash", provider: "deepseek", model: "deepseek-v4-flash", modelKwargs: { thinking: { type: "disabled" } } },
  { id: "openai-gpt4o", label: "OpenAI GPT-4o-mini", provider: "openai", model: "gpt-4o-mini" },
];

/**
 * 发送消息到 AI Agent，SSE 流式读取并按事件类型回调
 *
 * @param message      用户输入
 * @param contextDocId 当前文档 ID（可选）
 * @param mode         Agent 工作模式（"workflow" | "chat"），默认 "workflow"
 * @param modelConfig  模型配置（厂商/模型），可选
 * @param onEvent      收到结构化事件的回调
 * @param onDone       流结束的回调
 * @param onError      错误回调
 * @returns AbortController，用于取消
 */
export function sendAgentMessage(
  message: string,
  contextDocId?: string,
  mode?: AgentMode,
  modelConfig?: ModelConfig,
  onEvent?: (event: AgentEvent) => void,
  onDone?: () => void,
  onError?: (error: string) => void
): AbortController {
  const ws = wsSendAgentMessage(message, contextDocId, mode, modelConfig, onEvent, onDone, onError);
  
  // 包装为 AbortController 以保持接口兼容
  const controller = new AbortController();
  controller.signal.addEventListener("abort", () => ws.close());
  return controller;
}

/**
 * 查询 Agent 状态
 */
export async function getAgentStatus(): Promise<AgentStatus | null> {
  try {
    const res = await fetch(`${AI_BASE_URL}/agent/status`);
    const data: StatusResponse = await res.json();
    return data.success ? data.data : null;
  } catch {
    return null;
  }
}

/**
 * 重置 Agent 记忆
 */
export async function resetAgent(): Promise<boolean> {
  try {
    const res = await fetch(`${AI_BASE_URL}/agent/reset`, { method: "POST" });
    const data = await res.json();
    return data.success === true;
  } catch {
    return false;
  }
}

/**
 * 设置 Agent LLM 配置（立即重新初始化全局 LLM）
 */
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
