/**
 * AI Agent API 封装 — 结构化事件版本
 *
 * 后端输出的事件格式（每行一个事件）：
 *   [phase:analyze]          → 阶段开始
 *   [thought]xxx             → 思考过程（实时展开）
 *   [content]xxx             → 用户可见内容
 *   [chat]xxx                → React Agent 模式纯文本流式输出
 *   [tool]name|args          → 工具调用
 *   [tool_result]xxx         → 工具执行结果
 *   [phase:analyze:end]      → 阶段结束
 *   [phase:start]doc_target| → 文档目标
 *   [summary]{json}          → 最终总结
 *   [error]xxx               → 错误
 *   [retry]N                 → 重试
 *
 * AgentMode: "workflow"（4阶段工作流）| "chat"（React Agent 对话模式）
 */

const AI_BASE_URL = "http://localhost:3000/api/ai";

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
}

/** 文档目标信息 */
export interface DocTargetEvent {
  type: "doc_target";
  fileName: string;
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

/** 联合事件类型 */
export type AgentEvent =
  | PhaseEvent | PhaseEndEvent
  | ThoughtEvent | ContentEvent | ChatContentEvent
  | ToolCallEvent | ToolStartEvent | ToolResultEvent
  | DocTargetEvent
  | SummaryEvent
  | ErrorEvent;

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

/**
 * 发送消息到 AI Agent，SSE 流式读取并按事件类型回调
 *
 * @param message      用户输入
 * @param contextDocId 当前文档 ID（可选）
 * @param mode         Agent 工作模式（"workflow" | "chat"），默认 "workflow"
 * @param onEvent      收到结构化事件的回调
 * @param onDone       流结束的回调
 * @param onError      错误回调
 * @returns AbortController，用于取消
 */
export function sendAgentMessage(
  message: string,
  contextDocId?: string,
  mode?: AgentMode,
  onEvent?: (event: AgentEvent) => void,
  onDone?: () => void,
  onError?: (error: string) => void
): AbortController {
  const controller = new AbortController();

  fetch(`${AI_BASE_URL}/agent/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      contextDocId: contextDocId || undefined,
      mode: mode || "workflow",
    }),
    signal: controller.signal,
  })
    .then(async (response) => {
      if (!response.ok) {
        const text = await response.text().catch(() => "未知错误");
        throw new Error(`请求失败 (${response.status}): ${text}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("响应体不可读");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // 按行分割，逐行解析
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const event = parseEventLine(trimmed);
          if (event) onEvent?.(event);
        }
      }

      // 处理剩余 buffer
      if (buffer.trim()) {
        const event = parseEventLine(buffer.trim());
        if (event) onEvent?.(event);
      }
      onDone?.();
    })
    .catch((err) => {
      if (err.name === "AbortError") return;
      onError?.(err.message || "请求失败");
    });

  return controller;
}

/**
 * 解析一行 SSE 事件文本为结构化事件对象
 *
 * 后端事件格式: [type]content
 */
function parseEventLine(line: string): AgentEvent | null {
  // 匹配 [prefix]content
  const match = line.match(/^\[([^\]]+)\](.*)$/);
  if (!match) return null;

  const prefix = match[1];
  const content = match[2].trim();

  switch (prefix) {
    // 阶段开始 — [phase:analyze]
    case "phase:analyze":
    case "phase:plan":
    case "phase:execute":
    case "phase:validate": {
      const phase = prefix.split(":")[1];
      return { type: "phase_start", phase };
    }

    // 阶段结束 — [phase:analyze:end]
    case "phase:analyze:end":
    case "phase:plan:end":
    case "phase:execute:end":
    case "phase:validate:end": {
      const phase = prefix.split(":")[1];
      return { type: "phase_end", phase };
    }

    // 文档目标 — [phase:start]doc_target|filename
    case "phase:start": {
      if (content.startsWith("doc_target|")) {
        return { type: "doc_target", fileName: content.slice(11) };
      }
      return null;
    }

    // 思考过程
    case "thought":
      return { type: "thought", content };

    // 用户可见内容
    case "content":
      return { type: "content", content };

    // React Agent 模式纯文本流式内容
    case "chat":
      return { type: "chat_content", content };

    // 工具调用开始 — [tool_start]name|args
    case "tool_start": {
      const sep = content.indexOf("|");
      if (sep > 0) {
        return { type: "tool_start", tool: content.slice(0, sep), args: content.slice(sep + 1) };
      }
      return { type: "tool_start", tool: content, args: "" };
    }

    // 工具调用 — [tool]name|args
    case "tool": {
      const sep = content.indexOf("|");
      if (sep > 0) {
        return { type: "tool_call", tool: content.slice(0, sep), args: content.slice(sep + 1) };
      }
      return { type: "tool_call", tool: content, args: "" };
    }

    // 工具执行结果
    case "tool_result":
      return { type: "tool_result", content };

    // 最终总结 — [summary]{json}
    case "summary": {
      try {
        const data = JSON.parse(content);
        return {
          type: "summary",
          result: data.result || "failed",
          summary_text: data.summary_text || "",
          detail: data.detail || "",
          failed_tasks: data.failed_tasks || [],
        };
      } catch {
        return null;
      }
    }

    // 错误
    case "error":
      return { type: "error", message: content };

    default:
      return null;
  }
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
