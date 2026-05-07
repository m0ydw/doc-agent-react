/**
 * SettingsModal — LLM 配置弹窗
 *
 * 预设管理逻辑委托给 useModelPresets hook，本组件只负责 UI 渲染。
 */

import { useState, useEffect, useCallback } from "react";
import {
  Modal,
  Form,
  Select,
  Input,
  Button,
  Typography,
  Space,
  Divider,
  Tag,
  message,
} from "antd";
import { KeyOutlined, ApiOutlined, PlusOutlined } from "@ant-design/icons";
import { setAgentConfig } from "@/api/aiApi";
import type { ModelConfig } from "@/api/aiApi";
import { useModelPresets } from "./useModelPresets";

interface SettingsModalProps {
  open: boolean;
  currentConfig: ModelConfig;
  onSave: (config: ModelConfig) => void;
  onCancel: () => void;
}

export default function SettingsModal({
  open,
  currentConfig,
  onSave,
  onCancel,
}: SettingsModalProps) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  // 预设管理移入 hook
  const {
    allPresets,
    selectedPresetId,
    setSelectedPresetId,
    selectedPreset,
    addCustom,
    deleteCustom,
    isBuiltin,
  } = useModelPresets(currentConfig);

  // 添加自定义表单
  const [addCustomOpen, setAddCustomOpen] = useState(false);
  const [customLabel, setCustomLabel] = useState("");
  const [customProvider, setCustomProvider] = useState("deepseek");
  const [customModel, setCustomModel] = useState("");

  // 当预设变化时重置表单
  useEffect(() => {
    if (open && selectedPreset) {
      form.setFieldsValue({
        apiKey: currentConfig.apiKey || selectedPreset.apiKey || "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectedPresetId]);

  const handleSave = useCallback(async () => {
    if (!selectedPreset) return;
    try {
      await form.validateFields();
    } catch {
      return;
    }
    setSaving(true);
    const values = form.getFieldsValue();

    const config: ModelConfig = {
      provider: selectedPreset.provider,
      apiKey: values.apiKey || undefined,
      model: selectedPreset.model,
      modelKwargs: selectedPreset.modelKwargs,
    };

    const ok = await setAgentConfig(config);
    if (ok) {
      message.success(`已切换至 ${selectedPreset.label}`);
      onSave(config);
    } else {
      message.error("后端配置失败，请检查 API Key");
    }
    setSaving(false);
  }, [selectedPreset, form, onSave]);

  const handleAddCustom = useCallback(() => {
    if (!customLabel.trim() || !customProvider) return;
    addCustom(customLabel, customProvider, customModel);
    setAddCustomOpen(false);
    setCustomLabel("");
    setCustomModel("");
    message.success("自定义模型已添加");
  }, [customLabel, customProvider, customModel, addCustom]);

  return (
    <Modal
      title={
        <Space>
          <ApiOutlined />
          <span>LLM 模型设置</span>
        </Space>
      }
      open={open}
      onOk={handleSave}
      onCancel={onCancel}
      okText="保存并应用"
      cancelText="取消"
      confirmLoading={saving}
      width={480}
    >
      {/* 预设标签 */}
      <div style={{ marginBottom: 16 }}>
        <Typography.Text
          type="secondary"
          style={{ fontSize: 11, display: "block", marginBottom: 8 }}
        >
          选择模型预设，填写 API Key，保存后立即生效
        </Typography.Text>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {allPresets.map((p) => (
            <Tag
              key={p.id}
              color={selectedPresetId === p.id ? "blue" : "default"}
              style={{ cursor: "pointer", fontSize: 12, padding: "2px 8px" }}
              onClick={() => setSelectedPresetId(p.id)}
              closable={!isBuiltin(p.id)}
              onClose={(e) => {
                e.preventDefault();
                deleteCustom(p.id);
                message.success("已删除");
              }}
            >
              {p.label}
            </Tag>
          ))}
          {!addCustomOpen && (
            <Tag
              icon={<PlusOutlined />}
              style={{ cursor: "pointer", fontSize: 12, borderStyle: "dashed" }}
              onClick={() => setAddCustomOpen(true)}
            >
              添加自定义
            </Tag>
          )}
        </div>
      </div>

      {/* 添加自定义表单 */}
      {addCustomOpen && (
        <div
          style={{
            background: "#f5f5f5",
            padding: 12,
            borderRadius: 6,
            marginBottom: 12,
          }}
        >
          <Space direction="vertical" style={{ width: "100%" }} size="small">
            <Input
              size="small"
              placeholder="标签名，如 DeepSeek V4"
              value={customLabel}
              onChange={(e) => setCustomLabel(e.target.value)}
            />
            <Select
              size="small"
              value={customProvider}
              onChange={(v) => setCustomProvider(v)}
              style={{ width: "100%" }}
              options={[
                { value: "deepseek", label: "DeepSeek" },
                { value: "zhipu", label: "智谱 (Zhipu)" },
                { value: "openai", label: "OpenAI" },
              ]}
            />
            <Input
              size="small"
              placeholder="模型名，如 deepseek-v4-flash（可选）"
              value={customModel}
              onChange={(e) => setCustomModel(e.target.value)}
            />
            <Button type="primary" size="small" block onClick={handleAddCustom}>
              添加
            </Button>
          </Space>
        </div>
      )}

      <Divider style={{ margin: "8px 0" }} />

      {/* 详情 */}
      {selectedPreset && (
        <>
          <Typography.Text strong style={{ fontSize: 13 }}>
            {selectedPreset.label}
          </Typography.Text>
          <Typography.Text
            type="secondary"
            style={{ fontSize: 11, marginLeft: 8 }}
          >
            ({selectedPreset.provider}
            {selectedPreset.model ? ` / ${selectedPreset.model}` : ""})
          </Typography.Text>

          <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
            <Form.Item
              name="apiKey"
              label={
                <Space>
                  <KeyOutlined />
                  <span>API Key</span>
                </Space>
              }
              rules={[{ required: true, message: "请输入 API Key" }]}
            >
              <Input.Password placeholder="输入 API Key" allowClear />
            </Form.Item>
          </Form>
        </>
      )}

      <Typography.Text type="secondary" style={{ fontSize: 11 }}>
        提示：Key 保存在浏览器中（localStorage），不会上传到服务器。
        切换模型后立即生效，无需重启。
      </Typography.Text>
    </Modal>
  );
}
