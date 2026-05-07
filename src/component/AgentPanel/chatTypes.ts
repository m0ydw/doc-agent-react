/**
 * Agent 对话相关类型定义
 */

/** 消息块 — 阶段卡片内的最小内容单元 */
export type MsgBlock =
  | { type: "text"; content: string }
  | { type: "thought"; lines: string[] }
  | { type: "tool_call"; tool: string; args: string; result: string; success?: boolean }
  | { type: "summary"; content: string }
  | { type: "todo"; tasks: Array<{ id: string; goal: string; status: string }> };

/** 阶段卡片 */
export interface PhaseCard {
  phase: string;
  label: string;
  status: "running" | "done";
  blocks: MsgBlock[];
}

/** Assistant 消息 */
export interface AssistantMsg {
  role: "assistant";
  phases: PhaseCard[];
  streaming: boolean;
}

/** 聊天消息 */
export type Message = { role: "user"; content: string } | AssistantMsg;

// ================================================================
// Reducer 状态 & Action
// ================================================================

export interface ChatState {
  messages: Message[];
  phases: PhaseCard[];
  /** 当前活跃阶段名称（用名称替代引用，避免不可变更新时引用断裂） */
  activePhaseName: string | null;
  currentThought: string[] | null;
  /** 流式输出是否已完成（SUMMARY 或 ERROR 触发时设为 true） */
  completed: boolean;
}

export type ChatAction =
  | { type: "USER_MSG"; content: string }
  | { type: "PHASE_START"; phase: string; label: string }
  | { type: "PHASE_END" }
  | { type: "THOUGHT"; content: string }
  | { type: "CONTENT"; content: string }
  | { type: "CHAT_CONTENT"; content: string }
  | { type: "TOOL_START"; tool: string; args: string }
  | { type: "TOOL_RESULT"; content: string; success: boolean }
  | { type: "DOC_TARGET"; fileName: string }
  | { type: "SUMMARY"; summaryText: string; detail: string; failedTasks: string[] }
  | { type: "TODO_LIST"; tasks: Array<{ id: string; goal: string }> }
  | { type: "TODO_DONE"; id: string }
  | { type: "ERROR"; message: string };
