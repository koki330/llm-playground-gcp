'use client';

import { useEffect } from 'react';
import { useAppContext, ReasoningPreset, TemperaturePreset } from "@/context/AppContext";
import { FileText, SlidersHorizontal, BrainCircuit, Globe, AlertTriangle } from 'lucide-react';

const supportedFiles = [
  'PDF', 'PNG', 'DOCX', 'XLSX', 'TXT', 'JSON'
];

const Sidebar = () => {
  const {
    selectedModel, 
    setSelectedModel, 
    isLoading, 
    systemPrompt, 
    setSystemPrompt, 
    fileContent,
    usageInfo,
    temperaturePreset,
    setTemperaturePreset,
    maxTokens,
    setMaxTokens,
    reasoningPreset,
    setReasoningPreset,
    currentModelConfig,
    isConfigLoading,
    isWebSearchEnabled,
    setIsWebSearchEnabled,
    modelGroups,
    gpt5ReasoningEffort,
    setGpt5ReasoningEffort,
    gpt5Verbosity,
    setGpt5Verbosity,
    gemini3ThinkingLevel,
    setGemini3ThinkingLevel,
    gpt5GroundingEnabled,
    setGpt5GroundingEnabled,
  } = useAppContext();

  const MIN_GEMINI_TOKENS = 2000;

  // Adjust maxTokens only when the selected model changes
  useEffect(() => {
    if (selectedModel.startsWith('gemini') && maxTokens < MIN_GEMINI_TOKENS) {
      setMaxTokens(MIN_GEMINI_TOKENS);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedModel]);

  const handleMaxTokensChange = (value: string) => {
    const num = parseInt(value, 10);
    if (isNaN(num)) {
      setMaxTokens(0);
    } else if (currentModelConfig && num > currentModelConfig.maxTokens) {
      setMaxTokens(currentModelConfig.maxTokens);
    } else {
      setMaxTokens(num);
    }
  };

  // On losing focus, validate the input for Gemini models
  const handleTokenInputBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    if (selectedModel.startsWith('gemini')) {
      const num = parseInt(e.target.value, 10);
      if (!isNaN(num) && num < MIN_GEMINI_TOKENS) {
        setMaxTokens(MIN_GEMINI_TOKENS);
      }
    }
  };

  const renderModelSettings = () => {
    if (isConfigLoading || !currentModelConfig) {
      return (
        <div className="text-sm text-gray-400">モデル設定を読み込み中...</div>
      );
    }

    if (currentModelConfig.type === 'gemini3') {
      return (
        <div className="space-y-4">
          <div>
            <label htmlFor="gemini3ThinkingLevel" className="block text-sm font-medium text-gray-700">思考レベル</label>
            <select
              id="gemini3ThinkingLevel"
              value={gemini3ThinkingLevel}
              onChange={(e) => setGemini3ThinkingLevel(e.target.value as 'low' | 'high')}
              className="w-full p-2 mt-1 bg-white border border-[#E0E0E0] rounded-md text-black"
              disabled={isLoading}
            >
              <option value="high">高</option>
              <option value="low">低</option>
            </select>
          </div>
        </div>
      );
    }

    if (currentModelConfig.type === 'gpt5') {
      return (
        <div className="space-y-4">
          <div>
            <label htmlFor="gpt5ReasoningEffort" className="block text-sm font-medium text-gray-700">リーゾニング精度</label>
            <select
              id="gpt5ReasoningEffort"
              value={gpt5ReasoningEffort}
              onChange={(e) => setGpt5ReasoningEffort(e.target.value as 'none' | 'minimal' | 'low' | 'medium' | 'high')}
              className="w-full p-2 mt-1 bg-white border border-[#E0E0E0] rounded-md text-black"
              disabled={isLoading}
            >
              {selectedModel === 'gpt-5.1' ? (
                <>
                  <option value="none">None</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </>
              ) : (
                <>
                  <option value="minimal">Minimal</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </>
              )}
            </select>
          </div>
          <div>
            <label htmlFor="gpt5Verbosity" className="block text-sm font-medium text-gray-700">回答の冗長性</label>
            <select
              id="gpt5Verbosity"
              value={gpt5Verbosity}
              onChange={(e) => setGpt5Verbosity(e.target.value as 'low' | 'medium' | 'high')}
              className="w-full p-2 mt-1 bg-white border border-[#E0E0E0] rounded-md text-black"
              disabled={isLoading}
            >
              <option value="low">低</option>
              <option value="medium">中</option>
              <option value="high">高</option>
            </select>
          </div>

          <div className="pt-4 border-t border-[#E0E0E0]">
            <h3 className="flex items-center gap-2 text-md font-semibold mb-3 text-gray-800">
              <Globe size={18} />
              Tools
            </h3>
            <div className="flex items-center justify-between">
              <label htmlFor="gpt5Grounding" className="text-sm font-medium text-gray-800">Web検索を有効にする</label>
              <input
                type="checkbox"
                id="gpt5Grounding"
                checked={gpt5GroundingEnabled}
                onChange={(e) => setGpt5GroundingEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 bg-gray-100 text-[#A61C4B] focus:ring-[#A61C4B]"
                disabled={isLoading}
              />
            </div>
            <div className="mt-3 flex items-start gap-2 p-2 text-xs text-red-800 bg-red-100 border border-red-200 rounded-lg">
              <AlertTriangle size={24} className="flex-shrink-0" />
              <span>Web検索機能は公開情報を対象とします。機密情報や個人情報は入力しないでください。</span>
            </div>
          </div>
        </div>
      );
    }

    if (currentModelConfig.type === 'normal') {
      const minTokens = selectedModel.startsWith('gemini') ? MIN_GEMINI_TOKENS : 0;

      return (
        <div className="space-y-4">
          <div>
            <label htmlFor="temperaturePreset" className="block text-sm font-medium text-gray-700">回答のスタイル</label>
            <select
              id="temperaturePreset"
              value={temperaturePreset}
              onChange={(e) => setTemperaturePreset(e.target.value as TemperaturePreset)}
              className="w-full p-2 mt-1 bg-white border border-[#E0E0E0] rounded-md text-black"
              disabled={isLoading}
            >
              <option value="precise">堅実</option>
              <option value="balanced">標準</option>
              <option value="creative">創造的</option>
            </select>
          </div>
          <div>
            <label htmlFor="maxTokens" className="block text-sm font-medium text-gray-700">最大トークン: {maxTokens}</label>
            <input
              id="maxTokensRange"
              type="range"
              min={minTokens}
              max={currentModelConfig.maxTokens}
              step="128"
              value={maxTokens}
              onChange={(e) => handleMaxTokensChange(e.target.value)}
              className="w-full h-2 bg-gray-100 rounded-lg appearance-none cursor-pointer mt-1 accent-[#A61C4B]"
              disabled={isLoading}
            />
             <input
              id="maxTokensNumber"
              type="number"
              min={minTokens}
              max={currentModelConfig.maxTokens}
              value={maxTokens}
              onChange={(e) => handleMaxTokensChange(e.target.value)}
              onBlur={handleTokenInputBlur}
              className="w-full p-2 mt-2 bg-white border border-[#E0E0E0] rounded-md text-black"
              disabled={isLoading}
            />
          </div>
        </div>
      );
    }

    if (currentModelConfig.type === 'reasoning') {
      return (
        <div className="space-y-4">
          <div>
            <label htmlFor="reasoningPreset" className="block text-sm font-medium text-gray-700">リーゾニング精度</label>
            <select
              id="reasoningPreset"
              value={reasoningPreset}
              onChange={(e) => setReasoningPreset(e.target.value as ReasoningPreset)}
              className="w-full p-2 mt-1 bg-white border border-[#E0E0E0] rounded-md text-black"
              disabled={isLoading}
            >
              <option value="low">Low</option>
              <option value="middle">Middle</option>
              <option value="high">High</option>
            </select>
          </div>

          {selectedModel === 'o3' && (
            <div className="pt-4 border-t border-[#E0E0E0]">
               <h3 className="flex items-center gap-2 text-md font-semibold mb-3 text-gray-800">
                <Globe size={18} />
                Tools
              </h3>
              <div className="flex items-center justify-between">
                <label htmlFor="webSearch" className="text-sm font-medium text-gray-800">Web検索を有効にする</label>
                <input
                  type="checkbox"
                  id="webSearch"
                  checked={isWebSearchEnabled}
                  onChange={(e) => setIsWebSearchEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 bg-gray-100 text-[#A61C4B] focus:ring-[#A61C4B]"
                  disabled={isLoading}
                />
              </div>
              <div className="mt-3 flex items-start gap-2 p-2 text-xs text-red-800 bg-red-100 border border-red-200 rounded-lg">
                <AlertTriangle size={24} className="flex-shrink-0" />
                <span>Web検索機能は公開情報を対象とします。機密情報や個人情報は入力しないでください。</span>
              </div>
            </div>
          )}
        </div>
      );
    }

    return null;
  };

  return (
    <aside className="w-64 p-4 bg-white border-r border-[#E0E0E0] overflow-y-auto">
      <h2 className="text-lg font-semibold mb-2">Model</h2>
      {isConfigLoading ? (
        <div className="w-full p-2 rounded-lg bg-gray-100 text-gray-500">
          読み込み中...
        </div>
      ) : (
        <select
          value={selectedModel}
          onChange={(e) => setSelectedModel(e.target.value)}
          disabled={isLoading}
          className="w-full p-2 rounded-lg bg-white border border-[#E0E0E0] text-black focus:outline-none focus:ring-2 focus:ring-[#A61C4B] disabled:opacity-50"
        >
          {modelGroups.map(group => (
            <optgroup key={group.label} label={group.label}>
              {Object.entries(group.models).map(([key, value]) => (
                <option key={key} value={value}>
                  {key}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      )}
      {usageInfo?.usageWarning && (
        <div className="mt-2 p-2 text-sm text-yellow-800 bg-yellow-100 border border-yellow-200 rounded-lg">
          {usageInfo.usageWarning}
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-[#E0E0E0]">
        <h3 className="flex items-center gap-2 text-md font-semibold mb-3 text-gray-800">
          {currentModelConfig?.type === 'reasoning' ? <BrainCircuit size={18} /> : <SlidersHorizontal size={18} />}
          Model Settings
        </h3>
        {renderModelSettings()}
      </div>

      <div className="mt-4 pt-4 border-t border-[#E0E0E0]">
        <h3 className="flex items-center gap-2 text-md font-semibold mb-2 text-gray-800">
          <FileText size={18} />
          対応ファイル
        </h3>
        <div className="flex flex-wrap gap-2">
          {supportedFiles.map(format => (
            <span key={format} className="px-2 py-1 text-xs bg-gray-200 text-black rounded-md">
              {format}
            </span>
          ))}
        </div>
      </div>

      <h2 className="text-lg font-semibold mt-6 mb-4">System Prompt</h2>
      <textarea
        value={systemPrompt}
        onChange={(e) => setSystemPrompt(e.target.value)}
        disabled={isLoading}
        placeholder="e.g., You are a helpful assistant."
        className="w-full p-2 rounded-lg bg-gray-100 border border-[#E0E0E0] text-black resize-y focus:outline-none focus:ring-2 focus:ring-[#A61C4B] disabled:opacity-50 h-32"
      />

      <h2 className="text-lg font-semibold mt-6 mb-4">File Content</h2>
      <textarea
        value={fileContent}
        readOnly
        placeholder="Text extracted from uploaded files will appear here..."
        className="w-full p-2 rounded-lg bg-gray-100 border border-[#E0E0E0] text-gray-600 resize-y focus:outline-none focus:ring-1 focus:ring-gray-400 h-48"
      />
    </aside>
  );
};

export default Sidebar;
