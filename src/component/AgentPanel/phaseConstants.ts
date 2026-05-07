/**
 * 阶段常量 — 标签映射 + 暗色主题
 */

import { theme } from "antd";
import type { ConfigProvider } from "antd";

/** 阶段名称 → 中文标签 */
export const PHASE_LABELS: Record<string, string> = {
  docTarget: "文档定位",
  analyze: "需求分析",
  plan: "任务规划",
  execute: "文档处理",
  generate: "内容生成",
  validate: "结果验证",
};

/** Agent 面板暗色主题配置 */
export const agentTheme: Parameters<typeof ConfigProvider>[0]["theme"] = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary: "#0066cc",
    colorBgContainer: "#1a1a2e",
    colorBgElevated: "#222244",
    colorBorder: "#3a3a5a",
    colorText: "#e0e0e0",
    colorTextSecondary: "#888888",
    borderRadius: 6,
    fontSize: 13,
  },
};
