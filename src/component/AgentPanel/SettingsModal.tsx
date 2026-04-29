/**
 * ================================================================
 * SettingsModal — LLM 配置弹窗（预设标签模式）
 * ================================================================
 * 内置预设：智谱、DeepSeek、OpenAI 等。
 * 点击预设标签 → 只需填 API Key → 保存即重新初始化后端 LLM。
 * 支持添加自定义模型预设（存储到 localStorage）。
 */

import { useState, useEffect, useCallback } from "react";
import {
  Modal, Form, Select, Input, Button, Typography, Space, Divider,
  Tag, message,
} from "antd";
import { KeyOutlined, ApiOutlined, PlusOutlined } from "@ant-design/icons";
import { setAgentConfig, BUILTIN_PRESETS } from "@/api/aiApi";
import type { ModelConfig, ModelPreset } from "@/api/aiApi";

const STORAGE_KEY = "docagent_model_presets";

/** 从 localStorage 加载自定义预设 */
function loadCustomPresets(): ModelPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** 保存自定义预设到 localStorage */
function saveCustomPresets(presets: ModelPreset[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

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

  // 所有预设（内置 + 自定义）
  const [allPresets, setAllPresets] = useState<ModelPreset[]>(() => [
    ...BUILTIN_PRESETS,
    ...loadCustomPresets(),
  ]);

  // 当前选中的预设
  const [selectedPresetId, setSelectedPresetId] = useState<string>(() => {
    // 尝试匹配 currentConfig 到预设
    const matched = [...BUILTIN_PRESETS, ...loadCustomPresets()].find(
      p => p.provider === currentConfig.provider && p.model === currentConfig.model
    );
    return matched?.id || BUILTIN_PRESETS[0].id;
  });

  const [saving, setSaving] = useState(false);

  // 添加自定义
  const [addCustom, setAddCustom] = useState(false);
  const [customLabel, setCustomLabel] = useState("");
  const [customProvider, setCustomProvider] = useState("deepseek");
  const [customModel, setCustomModel] = useState("");

  const selectedPreset = allPresets.find(p => p.id === selectedPresetId);

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

    // 触发后端立即重新初始化
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
    const id = "custom-" + Date.now();
    const preset: ModelPreset = {
      id,
      label: customLabel.trim(),
      provider: customProvider,
      model: customModel.trim() || undefined,
    };
    const newPresets = [...allPresets, preset];
    setAllPresets(newPresets);
    saveCustomPresets(newPresets.filter(p => p.id.startsWith("custom-")));
    setSelectedPresetId(id);
    setAddCustom(false);
    setCustomLabel("");
    setCustomModel("");
    message.success("自定义模型已添加");
  }, [customLabel, customProvider, customModel, allPresets]);

  const handleDeleteCustom = useCallback((id: string) => {
    const newPresets = allPresets.filter(p => p.id !== id);
    setAllPresets(newPresets);
    saveCustomPresets(newPresets.filter(p => p.id.startsWith("custom-")));
    if (selectedPresetId === id) {
      setSelectedPresetId(BUILTIN_PRESETS[0].id);
    }
    message.success("已删除");
  }, [allPresets, selectedPresetId]);

  const isBuiltin = (id: string) => BUILTIN_PRESETS.some(p => p.id === id);

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
      destroyOnClose
    >
      {/* 预设标签 */}
      <div style={{ marginBottom: 16 }}>
        <Typography.Text type="secondary" style={{ fontSize: 11, display: "block", marginBottom: 8 }}>
          选择模型预设，填写 API Key，保存后立即生效
        </Typography.Text>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {allPresets.map(p => (
            <Tag
              key={p.id}
              color={selectedPresetId === p.id ? "blue" : "default"}
              style={{ cursor: "pointer", fontSize: 12, padding: "2px 8px" }}
              onClick={() => setSelectedPresetId(p.id)}
              closable={!isBuiltin(p.id)}
              onClose={(e) => { e.preventDefault(); handleDeleteCustom(p.id); }}
            >
              {p.label}
            </Tag>
          ))}
          {!addCustom ? (
            <Tag
              icon={<PlusOutlined />}
              style={{ cursor: "pointer", fontSize: 12, borderStyle: "dashed" }}
              onClick={() => setAddCustom(true)}
            >
              添加自定义
            </Tag>
          ) : null}
        </div>
      </div>

      {/* 添加自定义表单 */}
      {addCustom && (
        <div style={{ background: "#f5f5f5", padding: 12, borderRadius: 6, marginBottom: 12 }}>
          <Space direction="vertical" style={{ width: "100%" }} size="small">
            <Input
              size="small"
              placeholder="标签名，如 DeepSeek V4"
              value={customLabel}
              onChange={e => setCustomLabel(e.target.value)}
            />
            <Select
              size="small"
              value={customProvider}
              onChange={v => setCustomProvider(v)}
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
              onChange={e => setCustomModel(e.target.value)}
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
          <Typography.Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>
            ({selectedPreset.provider}{selectedPreset.model ? ` / ${selectedPreset.model}` : ""})
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
