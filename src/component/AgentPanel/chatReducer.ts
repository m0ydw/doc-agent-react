/**
 * chatReducer — Agent 对话状态机
 *
 * 使用不可变状态更新，通过 phase 名称（而非对象引用）关联活动阶段。
 * 这是 React useReducer 的标准模式，与 Redux entityAdapter 通过 id 定位同理。
 */

import type { ChatState, ChatAction, PhaseCard, MsgBlock } from "./chatTypes";

// ================================================================
// 初始状态
// ================================================================

export const initialChatState: ChatState = {
  messages: [],
  phases: [],
  activePhaseName: null,
  currentThought: null,
  completed: false,
};

// ================================================================
// Reducer — 核心修复：phase 名称匹配替代对象引用
// ================================================================

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  const activeName = state.activePhaseName;

  switch (action.type) {
    case "USER_MSG":
      return {
        messages: [
          ...state.messages,
          { role: "user", content: action.content },
          { role: "assistant", phases: [], streaming: true },
        ],
        phases: [],
        activePhaseName: null,
        currentThought: null,
        completed: false,
      };

    case "PHASE_START": {
      const card: PhaseCard = {
        phase: action.phase,
        label: action.label,
        status: "running",
        blocks: [],
      };
      return {
        ...state,
        phases: [...state.phases, card],
        activePhaseName: action.phase,
        currentThought: null,
      };
    }

    case "PHASE_END": {
      const newPhases = state.phases.map((p) =>
        p.phase === activeName ? { ...p, status: "done" as const } : p
      );
      return { ...state, phases: newPhases, activePhaseName: null, currentThought: null };
    }

    case "THOUGHT": {
      if (!activeName) return state;
      const newPhases = state.phases.map((p) => {
        if (p.phase !== activeName) return p;
        const lastBlock = p.blocks[p.blocks.length - 1];
        // 如果上一个 block 也是 thought → 追加到它；否则新建一段
        if (lastBlock?.type === "thought") {
          return {
            ...p,
            blocks: p.blocks.map((b, i) =>
              i === p.blocks.length - 1
                ? { ...b, lines: [...(b as { lines: string[] }).lines, action.content] }
                : b
            ),
          };
        }
        return { ...p, blocks: [...p.blocks, { type: "thought" as const, lines: [action.content] }] };
      });
      return { ...state, phases: newPhases, currentThought: null };
    }

    case "CONTENT": {
      const targetName = activeName || state.phases[state.phases.length - 1]?.phase;
      if (!targetName) return state;
      const newPhases = state.phases.map((p) => {
        if (p.phase !== targetName) return p;
        const lastBlock = p.blocks[p.blocks.length - 1];
        if (lastBlock?.type === "text") {
          return {
            ...p,
            blocks: p.blocks.map((b, i) =>
              i === p.blocks.length - 1
                ? { ...b, content: (b as { content: string }).content + action.content }
                : b
            ),
          };
        }
        return { ...p, blocks: [...p.blocks, { type: "text" as const, content: action.content }] };
      });
      return { ...state, phases: newPhases, currentThought: null };
    }

    case "CHAT_CONTENT": {
      if (state.phases.length === 0) return state;
      const lastPhase = state.phases[state.phases.length - 1];
      const lastBlock = lastPhase.blocks[lastPhase.blocks.length - 1];
      const newPhases = state.phases.map((p, i) => {
        if (i !== state.phases.length - 1) return p;
        if (lastBlock?.type === "text") {
          return {
            ...p,
            blocks: p.blocks.map((b, j) =>
              j === p.blocks.length - 1
                ? { ...b, content: (b as { content: string }).content + action.content }
                : b
            ),
          };
        }
        return { ...p, blocks: [...p.blocks, { type: "text" as const, content: action.content }] };
      });
      return { ...state, phases: newPhases, currentThought: null };
    }

    case "TOOL_START": {
      // 工具操作仅发生在 execute 阶段，按名称定位而非依赖 activePhaseName
      // （PHASE_END 可能先于工具事件到达，activePhaseName 已被清空）
      const toolPhase = state.phases.find((p) => p.phase === "execute");
      if (!toolPhase) return state;
      const newPhases = state.phases.map((p) => {
        if (p.phase !== "execute") return p;
        return {
          ...p,
          blocks: [...p.blocks, { type: "tool_call" as const, tool: action.tool, args: action.args, result: "" }],
        };
      });
      return { ...state, phases: newPhases, currentThought: null };
    }

    case "TOOL_RESULT": {
      const toolPhase = state.phases.find((p) => p.phase === "execute");
      if (!toolPhase) return state;
      const newPhases = state.phases.map((p) => {
        if (p.phase !== "execute") return p;
        const newBlocks = [...p.blocks];
        for (let i = newBlocks.length - 1; i >= 0; i--) {
          const block = newBlocks[i]; // const 触发 TypeScript 类型窄化
          if (block.type === "tool_call" && block.result === "") {
            newBlocks[i] = { ...block, result: action.content, success: action.success } as MsgBlock;
            break;
          }
        }
        return { ...p, blocks: newBlocks };
      });
      return { ...state, phases: newPhases };
    }

    case "DOC_TARGET": {
      if (state.phases.length === 0) return state;
      const newPhases = state.phases.map((p, i) => {
        if (i !== 0) return p;
        return { ...p, blocks: [...p.blocks, { type: "text" as const, content: "目标文档：" + action.fileName }] };
      });
      return { ...state, phases: newPhases, currentThought: null };
    }

    case "SUMMARY": {
      const detail = action.detail ? "\n\n" + action.detail : "";
      const failed = action.failedTasks.length > 0 ? "\n\n失败：" + action.failedTasks.join("、") : "";
      const newPhases = state.phases.map((p, i) => {
        if (i !== state.phases.length - 1) return p;
        return {
          ...p,
          blocks: [...p.blocks, { type: "summary" as const, content: action.summaryText + detail + failed }],
        };
      });
      return { ...state, phases: newPhases, activePhaseName: null, currentThought: null, completed: true };
    }

    case "TODO_LIST": {
      const targetName = activeName || state.phases[state.phases.length - 1]?.phase;
      if (!targetName) return state;
      const tasks = action.tasks.map((t) => ({ id: t.id, goal: t.goal, status: "pending" as const }));
      const newPhases = state.phases.map((p) => {
        if (p.phase !== targetName) return p;
        return { ...p, blocks: [...p.blocks, { type: "todo" as const, tasks }] };
      });
      return { ...state, phases: newPhases, currentThought: null };
    }

    case "TODO_DONE": {
      const targetName = activeName || state.phases[state.phases.length - 1]?.phase;
      if (!targetName) return state;
      const newPhases = state.phases.map((p) => {
        if (p.phase !== targetName) return p;
        const newBlocks = p.blocks.map((b) => {
          if (b.type !== "todo") return b;
          return {
            ...b,
            tasks: (b as { tasks: Array<{ id: string; goal: string; status: string }> }).tasks.map(
              (t) => (t.id === action.id ? { ...t, status: "done" as const } : t)
            ),
          };
        });
        return { ...p, blocks: newBlocks };
      });
      return { ...state, phases: newPhases };
    }

    case "ERROR": {
      const newPhases = state.phases.map((p, i) => {
        if (i !== state.phases.length - 1) return p;
        return { ...p, blocks: [...p.blocks, { type: "text" as const, content: "错误：" + action.message }] };
      });
      return { ...state, phases: newPhases, activePhaseName: null, currentThought: null, completed: true };
    }

    default:
      return state;
  }
}

// ================================================================
// 派生函数：同步 phases 到 messages
// ================================================================

import type { Message } from "./chatTypes";

export function syncMessages(state: ChatState): Message[] {
  const updated = [...state.messages];
  const last = updated[updated.length - 1];
  if (last && last.role === "assistant") {
    updated[updated.length - 1] = {
      ...last,
      phases: state.phases,
      streaming: !state.completed,
    };
  }
  return updated;
}
