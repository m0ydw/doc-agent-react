/**
 * 应用集中配置
 * 所有 URL 通过环境变量管理，开发环境默认指向 localhost
 */
export const config = {
  /** 后端 API 基础地址 */
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || "http://localhost:3000",

  /** 文档上传/管理 API */
  docsApiUrl: import.meta.env.VITE_DOCS_API_URL || "http://localhost:3000/api/docs",

  /** 文档操作 API（查找/替换） */
  docOpsApiUrl:
    import.meta.env.VITE_DOC_OPS_API_URL ||
    "http://localhost:3000/api/doc-operations",

  /** AI Agent API */
  aiApiUrl: import.meta.env.VITE_AI_API_URL || "http://localhost:3000/api/ai",

  /** Agent WebSocket */
  wsAgentUrl: import.meta.env.VITE_WS_AGENT_URL || "ws://localhost:3000/ws/agent",

  /** 协作 WebSocket（y-websocket） */
  collabWsUrl: import.meta.env.VITE_COLLAB_WS_URL || "ws://localhost:1234",

  /** 最大文件上传大小 (MB) */
  maxFileSizeMB: Number(import.meta.env.VITE_MAX_FILE_SIZE_MB) || 10,
} as const;
