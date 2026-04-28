/**
 * AI Agent API 封装
 *
 * 【接口说明】
 * POST /api/ai/agent/message  — 发送消息，SSE 流式返回
 * GET  /api/ai/agent/status   — 查询 Agent 状态
 * POST /api/ai/agent/reset    — 重置 Agent 记忆
 */

const AI_BASE_URL = "http://localhost:3000/api/ai";

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
 * 发送消息到 AI Agent，SSE 流式读取响应
 *
 * @param message  用户输入
 * @param contextDocId 当前文档 ID（可选）
 * @param onChunk  收到每个文本块的回调
 * @param onDone   流结束的回调
 * @param onError  错误回调
 * @returns AbortController，用于取消请求
 *
 * 【使用示例】
 *   const ctrl = sendAgentMessage("加粗标题", "doc-123", 
 *     (chunk) => setOutput(prev => prev + chunk),
 *     () => setIsDone(true),
 *     (err) => setError(err),
 *   );
 *   // 取消：ctrl.abort()
 */
export function sendAgentMessage(
  message: string,
  contextDocId?: string,
  onChunk?: (chunk: string) => void,
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

        // 按行分割，逐行回调（SSE 以 \n 分隔）
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // 不完整的行保留

        for (const line of lines) {
          if (line.trim()) onChunk?.(line + "\n");
        }
      }

      // 处理剩余的 buffer
      if (buffer.trim()) onChunk?.(buffer);
      onDone?.();
    })
    .catch((err) => {
      if (err.name === "AbortError") return;
      onError?.(err.message || "请求失败");
    });

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
