'use client';

import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { useChat, Message } from 'ai/react';

// --- Type Definitions ---
export interface Attachment {
  name: string;
  type: string;
  gcsUri: string;
  previewUrl: string;
}

export type ReasoningPreset = 'low' | 'middle' | 'high';
export type TemperaturePreset = 'precise' | 'balanced' | 'creative';

// Type for the configuration data fetched from the API
interface ModelConfigData {
  modelGroups: { label: string; models: Record<string, string> }[];
  modelConfig: Record<string, { type: 'reasoning' | 'normal'; maxTokens: number }>;
}

interface UsageInfo {
  limit: number | null;
  total_cost: number;
  isLimited: boolean;
  usageWarning: string | null;
}

interface AppContextType {
  messages: Message[];
  selectedModel: string;
  setSelectedModel: React.Dispatch<React.SetStateAction<string>>;
  isLoading: boolean;
  isConfigLoading: boolean; // To track config loading
  isFileProcessing: boolean;
  setIsFileProcessing: React.Dispatch<React.SetStateAction<boolean>>;
  systemPrompt: string;
  setSystemPrompt: React.Dispatch<React.SetStateAction<string>>;
  fileContent: string;
  setFileContent: React.Dispatch<React.SetStateAction<string>>;
  submitPrompt: (prompt: string) => void;
  clearConversation: () => void;
  input: string;
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement> | React.ChangeEvent<HTMLTextAreaElement>) => void;
  usageInfo: UsageInfo | null;
  error: string | null;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  temperaturePreset: TemperaturePreset;
  setTemperaturePreset: React.Dispatch<React.SetStateAction<TemperaturePreset>>;
  maxTokens: number;
  setMaxTokens: React.Dispatch<React.SetStateAction<number>>;
  reasoningPreset: ReasoningPreset;
  setReasoningPreset: React.Dispatch<React.SetStateAction<ReasoningPreset>>;
  currentModelConfig: { type: 'reasoning' | 'normal', maxTokens: number } | undefined;
  isWebSearchEnabled: boolean;
  setIsWebSearchEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  modelGroups: { label: string; models: Record<string, string> }[];
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [modelConfigData, setModelConfigData] = useState<ModelConfigData | null>(null);
  const [isConfigLoading, setIsConfigLoading] = useState(true);
  const [selectedModel, setSelectedModel] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [fileContent, setFileContent] = useState('');
  const [isFileProcessing, setIsFileProcessing] = useState(false);
  const [usageInfo, setUsageInfo] = useState<UsageInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [temperaturePreset, setTemperaturePreset] = useState<TemperaturePreset>('balanced');
  const [maxTokens, setMaxTokens] = useState(4096);
  const [reasoningPreset, setReasoningPreset] = useState<ReasoningPreset>('middle');
  const [isWebSearchEnabled, setIsWebSearchEnabled] = useState(false);

  const currentModelConfig = modelConfigData?.modelConfig[selectedModel];
  const modelGroups = modelConfigData?.modelGroups || [];

  useEffect(() => {
    const fetchModelConfig = async () => {
      setIsConfigLoading(true);
      try {
        const response = await fetch('/api/get-models-config');
        if (!response.ok) {
          throw new Error(`Failed to fetch model configuration: ${response.statusText}`);
        }
        const data: ModelConfigData = await response.json();
        setModelConfigData(data);

        // Set 'gpt-4.1' as the default model if it exists, otherwise fall back to the first available model.
        const gpt41Exists = data.modelGroups.some(group => 
          Object.values(group.models).includes('gpt-4.1')
        );

        if (gpt41Exists) {
          setSelectedModel('gpt-4.1');
        } else if (data.modelGroups.length > 0 && data.modelGroups[0].models) {
          const firstModelId = Object.values(data.modelGroups[0].models)[0];
          if (firstModelId) {
            setSelectedModel(firstModelId);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error fetching config');
      } finally {
        setIsConfigLoading(false);
      }
    };
    fetchModelConfig();
  }, []);

  const { messages, append, isLoading, input, setInput, setMessages } = useChat({
    api: '/api/chat',
    body: {
      modelId: selectedModel,
      systemPrompt: systemPrompt,
      temperaturePreset: currentModelConfig?.type === 'normal' ? temperaturePreset : undefined,
      maxTokens: currentModelConfig?.type === 'normal' ? maxTokens : undefined,
      reasoningPreset: currentModelConfig?.type === 'reasoning' ? reasoningPreset : undefined,
      webSearchEnabled: isWebSearchEnabled,
    },
    onError: (err) => {
      setError(err.message);
    },
    onFinish: () => {
      if (selectedModel) fetchUsage(selectedModel);
    }
  });

  const fetchUsage = async (modelId: string) => {
    try {
      const response = await fetch(`/api/get-usage?modelId=${modelId}`);
      if (!response.ok) {
        setUsageInfo(null);
        return;
      }
      const data = await response.json();
      let usageWarning: string | null = null;
      let isLimited = false;
      if (data.limit !== null) {
        if (data.total_cost >= data.limit) {
          usageWarning = '利用上限に達しました。別のモデルを使用してください。';
          isLimited = true;
        } else if (data.total_cost >= data.limit * 0.8) {
          usageWarning = '利用上限の8割に到達しました。';
        }
      }
      setUsageInfo({ ...data, isLimited, usageWarning });
    } catch (error) {
      console.error('Failed to fetch usage info:', error);
      setUsageInfo(null);
    }
  };

  useEffect(() => {
    if (selectedModel && modelConfigData) {
      fetchUsage(selectedModel);
      setIsWebSearchEnabled(false);
      const newMax = modelConfigData.modelConfig[selectedModel]?.maxTokens;
      if (newMax) {
        setMaxTokens(newMax);
      }
    }
  }, [selectedModel, modelConfigData]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement> | React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  const clearConversation = () => {
    setMessages([]);
    setFileContent('');
  };

  const submitPrompt = async (prompt: string) => {
    if (usageInfo?.isLimited || !selectedModel) return;
    setError(null);
    let combinedPrompt = prompt;
    if (fileContent) {
      combinedPrompt = `The user has uploaded a file. Its content is:\n\n${fileContent}\n\n---\n\nUser prompt:\n\n${prompt}`;
    }
    await append({ role: 'user', content: combinedPrompt });
    setInput('');
    setFileContent('');
  };

  return (
    <AppContext.Provider value={{ 
        messages,
        selectedModel, 
        setSelectedModel, 
        isLoading: isLoading || isFileProcessing,
        isConfigLoading,
        isFileProcessing, 
        setIsFileProcessing,
        systemPrompt, 
        setSystemPrompt, 
        fileContent,
        setFileContent,
        submitPrompt, 
        clearConversation,
        input,
        handleInputChange,
        usageInfo,
        error,
        setError,
        temperaturePreset,
        setTemperaturePreset,
        maxTokens,
        setMaxTokens,
        reasoningPreset,
        setReasoningPreset,
        currentModelConfig,
        isWebSearchEnabled,
        setIsWebSearchEnabled,
        modelGroups,
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};