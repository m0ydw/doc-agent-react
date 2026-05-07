import { useState, useCallback } from "react";
import { Input, Button, Typography, Flex } from "antd";
import { findText, replaceText } from "@/api/docApi";
import type { FindResult, ReplaceResult } from "@/api/docApi";

interface Props {
  activeDocId: string | null;
}

export default function FindReplacePanel({ activeDocId }: Props) {
  const [findPattern, setFindPattern] = useState("");
  const [replaceWith, setReplaceWith] = useState("");
  const [findResult, setFindResult] = useState<FindResult | null>(null);
  const [replaceResult, setReplaceResult] = useState<ReplaceResult | null>(null);
  const [findStatus, setFindStatus] = useState("");

  const getErrorMessage = (error: unknown): string => {
    return error instanceof Error ? error.message : "未知错误";
  };

  const handleFind = useCallback(async () => {
    if (!activeDocId || !findPattern.trim()) {
      setFindStatus("请先选择文档并输入查找内容");
      return;
    }
    setFindStatus("正在查找...");
    try {
      const result = await findText(activeDocId, findPattern);
      setFindResult(result);
      setReplaceResult(null);
      setFindStatus(`找到 ${result.count} 处匹配`);
    } catch (error: unknown) {
      setFindStatus("查找失败: " + getErrorMessage(error));
    }
  }, [activeDocId, findPattern]);

  const handleReplaceFirst = useCallback(async () => {
    if (!activeDocId || !findPattern.trim() || !replaceWith.trim()) {
      setFindStatus("请输入查找内容和替换内容");
      return;
    }
    setFindStatus("正在替换...");
    try {
      const result = await replaceText(activeDocId, findPattern, replaceWith, false);
      setReplaceResult(result);
      setFindStatus(result.success ? "替换完成 (1处)" : "替换失败: " + (result.message || ""));
    } catch (error: unknown) {
      setFindStatus("替换失败: " + getErrorMessage(error));
    }
  }, [activeDocId, findPattern, replaceWith]);

  const handleReplaceAll = useCallback(async () => {
    if (!activeDocId || !findPattern.trim() || !replaceWith.trim()) {
      setFindStatus("请输入查找内容和替换内容");
      return;
    }
    setFindStatus("正在替换全部...");
    try {
      const result = await replaceText(activeDocId, findPattern, replaceWith, true);
      setReplaceResult(result);
      setFindStatus(
        result.success
          ? `替换完成 (${result.replaced}处)`
          : "替换失败: " + (result.message || "")
      );
    } catch (error: unknown) {
      setFindStatus("替换失败: " + getErrorMessage(error));
    }
  }, [activeDocId, findPattern, replaceWith]);

  return (
    <Flex vertical gap={8} style={{ padding: 12, fontSize: 13 }}>
      <Flex gap={8} align="center">
        <Typography.Text style={{ width: 60, flexShrink: 0 }}>查找:</Typography.Text>
        <Input
          size="small"
          value={findPattern}
          onChange={(e) => setFindPattern(e.target.value)}
          placeholder="输入要查找的内容"
        />
      </Flex>
      <Flex gap={8} align="center">
        <Typography.Text style={{ width: 60, flexShrink: 0 }}>替换为:</Typography.Text>
        <Input
          size="small"
          value={replaceWith}
          onChange={(e) => setReplaceWith(e.target.value)}
          placeholder="输入替换内容"
        />
      </Flex>
      <Flex gap={6}>
        <Button size="small" type="primary" onClick={handleFind}>
          查找
        </Button>
        <Button
          size="small"
          style={{ borderColor: "#ff9800", color: "#ff9800" }}
          onClick={handleReplaceFirst}
        >
          替换第一个
        </Button>
        <Button size="small" danger onClick={handleReplaceAll}>
          替换全部
        </Button>
      </Flex>
      {findStatus && (
        <Typography.Text
          style={{ padding: "4px 8px", background: "#e8f5e9", borderRadius: 4, fontSize: 12 }}
        >
          {findStatus}
        </Typography.Text>
      )}
      {findResult && (
        <div style={{ padding: "4px 8px", background: "#e3f2fd", borderRadius: 4, fontSize: 12 }}>
          <Typography.Text strong>查找结果:</Typography.Text> 找到 {findResult.count} 处匹配
          {findResult.positions.length > 0 && (
            <ul style={{ margin: "4px 0 0 0", paddingLeft: 16 }}>
              {findResult.positions.slice(0, 5).map((pos, i) => (
                <li key={i}>
                  [{pos.index}] {pos.text?.substring(0, 50) ?? "(无文本内容)"}...
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {replaceResult && (
        <Typography.Text
          style={{
            padding: "4px 8px",
            borderRadius: 4,
            fontSize: 12,
            background: replaceResult.success ? "#fff3e0" : "#ffebee",
          }}
        >
          <Typography.Text strong>替换结果:</Typography.Text>{" "}
          {replaceResult.success
            ? `已替换 ${replaceResult.replaced ?? 0} 处`
            : `失败：${replaceResult.message ?? "未知错误"}`}
        </Typography.Text>
      )}
    </Flex>
  );
}
