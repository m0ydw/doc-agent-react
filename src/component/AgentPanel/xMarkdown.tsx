/**
 * ================================================================
 * @ant-design/x Markdown 渲染组件（暗色主题 + HTML 支持）
 * ================================================================
 */

import type { Components } from "react-markdown";

const xMarkdownComponents: Components = {
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: "#66b3ff" }}>
      {children}
    </a>
  ),
  code: ({ className, children, ...props }) => {
    const isInline = !className;
    if (isInline) {
      return (
        <code style={{ background: "#2a2a4a", padding: "1px 5px", borderRadius: 3, fontSize: "0.9em", color: "#e0e0e0" }}>
          {children}
        </code>
      );
    }
    return (
      <pre style={{ background: "#2a2a4a", padding: 10, borderRadius: 6, overflow: "auto", fontSize: 12, lineHeight: 1.5 }}>
        <code className={className} {...props}>{children}</code>
      </pre>
    );
  },
  ul: ({ children }) => <ul style={{ paddingLeft: 20, margin: "4px 0" }}>{children}</ul>,
  ol: ({ children }) => <ol style={{ paddingLeft: 20, margin: "4px 0" }}>{children}</ol>,
  li: ({ children }) => <li style={{ margin: "2px 0" }}>{children}</li>,
  p: ({ children }) => <div style={{ margin: "4px 0", lineHeight: 1.6 }}>{children}</div>,
  h1: ({ children }) => <div style={{ fontSize: 15, fontWeight: 600, margin: "8px 0 4px", color: "#fff" }}>{children}</div>,
  h2: ({ children }) => <div style={{ fontSize: 14, fontWeight: 600, margin: "6px 0 4px", color: "#fff" }}>{children}</div>,
  h3: ({ children }) => <div style={{ fontSize: 13, fontWeight: 600, margin: "4px 0", color: "#fff" }}>{children}</div>,
};

export default xMarkdownComponents;
