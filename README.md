# DocAgent 前端

> 基于 React + TypeScript + Vite 的智能文档处理交互界面。

## 概述

DocAgent 前端是一个融合了 **SuperDoc 文档编辑器** 与 **AI Agent 对话面板** 的全栈文档处理界面。用户可以通过自然语言向 AI 描述文档操作需求，实时查看 AI 的思考过程、工具调用和生成结果，同时实时渲染文档编辑效果。

**核心体验**：拖拽上传文档 → AI 对话操控 → SuperDoc 实时编辑 → 流式输出全过程。

## 功能特性

### 文档编辑

- **SuperDoc 编辑器**：基于 `@superdoc-dev/react` 的 DOCX 预览与编辑
- **实时协作**：通过 `y-websocket` 连接协作服务端，支持多人实时协同编辑
- **拖拽上传**：支持拖拽 `.docx` 文件到界面任意位置
- **多标签页**：支持同时打开多个文档，标签页可拖拽排序
- **查找替换**：内置文档搜索和高亮替换面板

### AI Agent 对话

- **双模式切换**：Workflow 模式（四阶段工作流）/ Chat 模式（直接对话）
- **流式输出**：思考过程逐字实时展开，工具调用带 Loading 动画，生成内容流式渲染
- **思考内容**：AI 思考过程默认展开，使用 Markdown 渲染，自动过滤后端 JSON 数据
- **工具可视化**：查找文本、替换文本、读取全文、保存文档等操作清晰展示
- **取消操作**：支持中断正在执行的 AI 任务

### 交互体验

- **暗色主题**：整个面板采用暗色设计，对长时间使用友好
- **分屏布局**：文档编辑区 + Agent 对话面板，支持拖拽调整宽度
- **实时反馈**：闪烁光标提示流式输出中，状态栏显示操作结果

## 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | React 19 + TypeScript |
| 构建工具 | Vite 6 |
| UI 组件 | Ant Design 6 |
| 文档编辑 | `@superdoc-dev/react` (SuperDoc React SDK) |
| 实时协作 | `y-websocket` + `yjs` (CRDT) |
| Markdown | `react-markdown` + `remark-gfm` |
| 拖拽排序 | `@dnd-kit/core` + `@dnd-kit/sortable` |
| 图标 | `@ant-design/icons` |

## 快速开始

### 环境要求

- Node.js ≥ 18
- npm（包管理器）

### 安装与启动

```bash
cd doc-agent-react
npm install
npm run dev
```

开发服务器默认运行在 `http://localhost:5173`。

> **注意**：需同时启动后端服务（`http://localhost:3000`）和协作 WebSocket 服务（`ws://localhost:1234`）。

### 构建生产版本

```bash
npm run build
```

构建产物输出到 `dist/` 目录。

## 架构说明

```
src/
├── api/
│   ├── aiApi.ts              # AI Agent SSE 流式 API + 事件类型
│   └── docApi.ts             # 文档上传/操作 REST API
├── component/
│   ├── AgentPanel/
│   │   ├── AgentPanel.tsx    # ★ 核心：AI 对话面板（流式消息渲染）
│   │   └── AgentPanel.module.css
│   ├── Doc/
│   │   └── Doc.tsx           # SuperDoc 编辑器 + y-websocket 协作
│   ├── DocumentViewer/
│   │   └── DocumentViewer.tsx # 文档查看器容器
│   ├── FindReplace/
│   │   └── FindReplace.tsx   # 查找替换面板
│   ├── TabBar/
│   │   └── TabBar.tsx        # 文档标签页（可拖拽排序）
│   ├── ResizeHandle/
│   │   └── ResizeHandle.tsx  # 分屏拖拽分隔条
│   └── StatusBar/
│       └── StatusBar.tsx     # 状态通知栏
├── layout/
│   ├── AppLayout.tsx         # 主布局（分屏 + 拖拽上传）
│   └── AppLayout.module.css
├── App.tsx                   # 应用入口
├── main.tsx                  # React 挂载
└── vite-env.d.ts
```

### 数据流

```
用户输入
  → AgentPanel.handleSend()
    → sendAgentMessage() [POST /api/ai/agent/message]
      → fetch + ReadableStream reader
        → 逐行 parseEventLine() 解析 [type]content
          → handleEvent() 将事件转为 MsgBlock
            → commitRender() 快照提交 React 状态
              → React 渲染: text→ReactMarkdown, thought→Collapse, tool_call→Tag
```

### 前端事件类型

| 事件 | 渲染方式 |
|------|----------|
| `[thought]` | Collapse 折叠面板，默认展开，Markdown 渲染 |
| `[content]` | ReactMarkdown 文本块 |
| `[chat]` | Chat 模式流式文本（合并连续输出） |
| `[tool_start]` | 创建带 Spin 动画的 Loading 工具块 |
| `[tool]` | 更新工具块信息（去重处理） |
| `[tool_result]` | 更新工具块结果为 ✓/✗ |
| `[summary]` | ReactMarkdown 总结块 |
| `[phase:xxx]` | 仅日志记录，不渲染 |

### MsgBlock 数据结构

```typescript
type MsgBlock =
  | { type: "text"; content: string }
  | { type: "thought"; lines: string[] }
  | { type: "tool_call"; tool: string; args: string; result: string }
  | { type: "summary"; content: string };
```

## 界面布局

```
┌─────────── AppLayout ─────────────────────────────────┐
│ TabBar（文档标签栏，可拖拽排序）                          │
├───────────────────────────────────────────────────────┤
│ mainContainer                                          │
│ ┌────────────────── splitPanel ──────────────────────┐ │
│ │ documentPanel              │ ResizeHandle │ Agent  │ │
│ │ ┌── DocumentViewer ──────┐ │              │ Panel  │ │
│ │ │   SuperDoc 编辑器       │ │              │        │ │
│ │ │   查找替换面板           │ │              │ Agent  │ │
│ │ └────────────────────────┘ │              │ 对话   │ │
│ └────────────────────────────────────────────────────┘ │
│ StatusBar（上传/操作通知）                                │
└───────────────────────────────────────────────────────┘
```

## 核心依赖

| 依赖 | 用途 |
|------|------|
| `@superdoc-dev/react` | SuperDoc 文档编辑器 React 组件 |
| `y-websocket` + `yjs` | 实时协作数据同步 |
| `antd` | UI 组件库 |
| `react-markdown` | Markdown 渲染 |
| `remark-gfm` | GFM（表格/删除线等）扩展 |
| `@dnd-kit/*` | 标签页拖拽排序 |

## License

MIT
