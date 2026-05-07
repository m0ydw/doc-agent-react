/**
 * useModelPresets — 模型预设管理 hook
 *
 * 封装预设的增删改查逻辑 + localStorage 持久化，
 * SettingsModal 只需使用 hook 返回的数据和操作方法。
 */

import { useState, useCallback } from "react";
import { BUILTIN_PRESETS } from "@/api/aiApi";
import type { ModelConfig, ModelPreset } from "@/api/aiApi";

const STORAGE_KEY = "docagent_model_presets";

function loadCustomPresets(): ModelPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCustomPresets(presets: ModelPreset[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

export function useModelPresets(currentConfig: ModelConfig) {
  const [allPresets, setAllPresets] = useState<ModelPreset[]>(() => [
    ...BUILTIN_PRESETS,
    ...loadCustomPresets(),
  ]);

  const [selectedPresetId, setSelectedPresetId] = useState<string>(() => {
    const matched = [...BUILTIN_PRESETS, ...loadCustomPresets()].find(
      (p) => p.provider === currentConfig.provider && p.model === currentConfig.model
    );
    return matched?.id || BUILTIN_PRESETS[0].id;
  });

  const selectedPreset = allPresets.find((p) => p.id === selectedPresetId);

  const addCustom = useCallback(
    (label: string, provider: string, model: string) => {
      if (!label.trim() || !provider) return;
      const id = "custom-" + Date.now();
      const preset: ModelPreset = {
        id,
        label: label.trim(),
        provider,
        model: model.trim() || undefined,
      };
      const newPresets = [...allPresets, preset];
      setAllPresets(newPresets);
      saveCustomPresets(newPresets.filter((p) => p.id.startsWith("custom-")));
      setSelectedPresetId(id);
      return id;
    },
    [allPresets]
  );

  const deleteCustom = useCallback(
    (id: string) => {
      const newPresets = allPresets.filter((p) => p.id !== id);
      setAllPresets(newPresets);
      saveCustomPresets(newPresets.filter((p) => p.id.startsWith("custom-")));
      if (selectedPresetId === id) {
        setSelectedPresetId(BUILTIN_PRESETS[0].id);
      }
    },
    [allPresets, selectedPresetId]
  );

  const isBuiltin = useCallback(
    (id: string) => BUILTIN_PRESETS.some((p) => p.id === id),
    []
  );

  return {
    allPresets,
    selectedPresetId,
    setSelectedPresetId,
    selectedPreset,
    addCustom,
    deleteCustom,
    isBuiltin,
  };
}
