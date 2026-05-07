/**
 * ================================================================
 * wsAgentClient — WebSocket Agent 客户端
 * ================================================================
 *
 * 替代原来的 HTTP SSE（fetch + ReadableStream）。
 * 使用 reconnecting-websocket 库实现自动重连。
 *
 * 【接口】与旧 aiApi.ts 中的 sendAgentMessage 完全兼容。
 */

import ReconnectingWebSocket from "reconnecting-websocket";
import type { AgentEvent, AgentMode, ModelConfig } from "./aiApi";
import { config } from "@/config";

const WS_URL = config.wsAgentUrl;

// ================================================================
// WebSocket 消息类型
// ================================================================

interface WsMessage {
  type: string;
  data?: Record<string, unknown>;
}

// ================================================================
// 单例 WS 连接
// ================================================================

let ws: ReconnectingWebSocket | null = null;

function getWs(): ReconnectingWebSocket {
  if (!ws) {
    ws = new ReconnectingWebSocket(WS_URL, [], {
      maxReconnectionDelay: 5000,
      minReconnectionDelay: 500,
      reconnectionDelayGrowFactor: 1.5,
      maxRetries: Infinity,
    });

    ws.addEventListener("open", () => {
      console.log("[WS-CLIENT] 已连接", WS_URL);
    });

    ws.addEventListener("close", () => {
      console.log("[WS-CLIENT] 已断开");
    });

    ws.addEventListener("error", (e) => {
      console.log("[WS-CLIENT] 错误", e);
    });
  }
  return ws;
}

// ================================================================
// 发送消息（与旧 sendAgentMessage 接口兼容）
// ================================================================

export function sendAgentMessage(
  message: string,
  contextDocId?: string,
  mode?: AgentMode,
  modelConfig?: ModelConfig,
  onEvent?: (event: AgentEvent) => void,
  onDone?: () => void,
  onError?: (error: string) => void
): { close: () => void } {
  const socket = getWs();
  const msgId = "msg-" + Date.now();
  let done = false;

  const handler = (e: MessageEvent) => {
    let msg: WsMessage;
    try {
      msg = JSON.parse(e.data);
    } catch {
      console.log("[WS-CLIENT] 无法解析消息", e.data.slice(0, 100));
      return;
    }

    console.log("[WS-CLIENT]", msg.type, JSON.stringify(msg.data || "").slice(0, 100));

    if (msg.type === "done" && msg.data?.id === msgId) {
      done = true;
      socket.removeEventListener("message", handler);
      onDone?.();
      return;
    }

    if (msg.type === "error") {
      onError?.((msg.data?.message as string) || "未知错误");
      return;
    }

    // 映射到 AgentEvent（类型与旧 aiApi.ts 完全一致）
    const event = msgToAgentEvent(msg);
    if (event) onEvent?.(event);
  };

  socket.addEventListener("message", handler);

  // 发送消息
  socket.send(JSON.stringify({
    type: "agent_message",
    id: msgId,
    data: { message, docId: contextDocId, mode, modelConfig },
  }));

  return {
    close: () => {
      if (!done) {
        socket.removeEventListener("message", handler);
        onDone?.();
      }
    },
  };
}

// ================================================================
// 消息 → AgentEvent 映射
// ================================================================

function msgToAgentEvent(msg: WsMessage): AgentEvent | null {
  const data = msg.data || {};

  switch (msg.type) {
    case "thought":
      return { type: "thought", content: data.content as string };
    case "content":
      return { type: "content", content: data.content as string };
    case "chat_content":
      return { type: "chat_content", content: data.content as string };
    case "phase_start":
      return { type: "phase_start", phase: data.phase as string };
    case "phase_end":
      return { type: "phase_end", phase: data.phase as string };
    case "phase_status":
      return { type: "phase_status", text: data.text as string };
    case "doc_target":
      return { type: "doc_target", fileName: data.fileName as string };
    case "tool_start":
      return { type: "tool_start", tool: data.tool as string, args: data.args as string };
    case "tool_result":
      return {
        type: "tool_result",
        success: data.success as boolean,
        content: data.success
          ? `✓ ${data.tool}：${data.result || ""}`
          : `✗ ${data.tool}：${data.result || ""}`,
      };
    case "tool_call":
      return { type: "tool_call", tool: data.tool as string, args: data.args as string };
    case "summary":
      return {
        type: "summary",
        result: (data.result as string) || "failed",
        summary_text: (data.summary_text as string) || "",
        detail: (data.detail as string) || "",
        failed_tasks: (data.failed_tasks as string[]) || [],
      };
    case "todo_list":
      return { type: "todo_list", tasks: (data.tasks as Array<{ id: string; goal: string }>) || [] };
    case "todo_done":
      return { type: "todo_done", id: data.id as string };
    case "error":
      return { type: "error", message: data.message as string };
    case "warning":
      return { type: "warning", message: data.message as string };
    default:
      return null;
  }
}
