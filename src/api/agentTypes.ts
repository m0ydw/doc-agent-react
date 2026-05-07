/**
 * Agent 相关类型定义 — 事件类型、配置类型、预设类型
 */

/** Agent 工作模式 */
export type AgentMode = "workflow" | "chat";

/** 阶段事件 */
export interface PhaseEvent {
  type: "phase_start";
  phase: string;
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

/** 流式内容（逐 token） */
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

/** 工具调用开始 */
export interface ToolStartEvent {
  type: "tool_start";
  tool: string;
  args: string;
}

/** 工具执行结果 */
export interface ToolResultEvent {
  type: "tool_result";
  content: string;
  success: boolean;
}

/** 文档目标信息 */
export interface DocTargetEvent {
  type: "doc_target";
  fileName: string;
}

/** 阶段内容 */
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

/** 警告事件 */
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
  | PhaseEvent
  | PhaseEndEvent
  | ThoughtEvent
  | ContentEvent
  | ChatContentEvent
  | ToolCallEvent
  | ToolStartEvent
  | ToolResultEvent
  | DocTargetEvent
  | PhaseStatusEvent
  | SummaryEvent
  | PhaseContentEvent
  | TodoListEvent
  | TodoDoneEvent
  | ErrorEvent
  | WarningEvent;

// ================================================================
// 配置 & 预设类型
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
  { id: "zhipu-glm4", label: "智谱 GLM-4-Flash", provider: "zhipu", model: "glm-4-flash" },
  { id: "deepseek-chat", label: "DeepSeek Chat", provider: "deepseek", model: "deepseek-chat" },
  {
    id: "deepseek-v4",
    label: "DeepSeek V4-Flash",
    provider: "deepseek",
    model: "deepseek-v4-flash",
    modelKwargs: { thinking: { type: "disabled" } },
  },
  { id: "openai-gpt4o", label: "OpenAI GPT-4o-mini", provider: "openai", model: "gpt-4o-mini" },
];
