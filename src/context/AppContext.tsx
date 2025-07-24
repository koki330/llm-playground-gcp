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

export const MODEL_CONFIG: { [key: string]: { type: 'reasoning' | 'normal', maxTokens: number } } = {
  'claude-sonnet4': { type: 'normal', maxTokens: 64000 },
  'gpt-4.1': { type: 'normal', maxTokens: 32768 },
  'gpt-4.1-mini': { type: 'normal', maxTokens: 32768 },
  'gpt-4.1-nano': { type: 'normal', maxTokens: 32768 },
  'o3': { type: 'reasoning', maxTokens: 100000 },
  'o4-mini': { type: 'reasoning', maxTokens: 100000 },
  'gemini-2.5-pro': { type: 'normal', maxTokens: 65536 },
  'gemini-2.5-flash': { type: 'normal', maxTokens: 65536 },
};

export const MODEL_GROUPS = [
  {
    label: "Anthropic",
    models: {
      'Claude Sonnet 4': 'claude-sonnet4',
    }
  },
  {
    label: "OpenAI",
    models: {
      'GPT-4.1': 'gpt-4.1',
      'GPT-4.1-mini': 'gpt-4.1-mini',
      'GPT-4.1-nano': 'gpt-4.1-nano',
      'O3': 'o3',
      'O4-mini': 'o4-mini',
    }
  }
  ,
  {
    label: "Gemini",
    models: {
      'Gemini 2.5 Pro': 'gemini-2.5-pro',
      'Gemini 2.5 Flash': 'gemini-2.5-flash',
    }
  }
];

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
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [selectedModel, setSelectedModel] = useState('gpt-4.1');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [fileContent, setFileContent] = useState('');
  const [isFileProcessing, setIsFileProcessing] = useState(false);
  const [usageInfo, setUsageInfo] = useState<UsageInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  // New model settings states
  const [temperaturePreset, setTemperaturePreset] = useState<TemperaturePreset>('balanced');
  const [maxTokens, setMaxTokens] = useState(4096);
  const [reasoningPreset, setReasoningPreset] = useState<ReasoningPreset>('middle');
  const [isWebSearchEnabled, setIsWebSearchEnabled] = useState(false);

  const currentModelConfig = MODEL_CONFIG[selectedModel];

  const { messages, append, isLoading, input, setInput, setMessages } = useChat({
    api: '/api/chat',
    body: {
      modelId: selectedModel,
      systemPrompt: systemPrompt,
      // Pass settings to the backend
      temperaturePreset: currentModelConfig?.type === 'normal' ? temperaturePreset : undefined,
      maxTokens: currentModelConfig?.type === 'normal' ? maxTokens : undefined,
      reasoningPreset: currentModelConfig?.type === 'reasoning' ? reasoningPreset : undefined,
      webSearchEnabled: isWebSearchEnabled,
    },
    onError: (err) => {
      setError(err.message);
    },
    onFinish: () => {
      fetchUsage(selectedModel);
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
    if (selectedModel) {
      fetchUsage(selectedModel);
      // Reset web search on model change
      setIsWebSearchEnabled(false);
      // Update maxTokens based on the selected model's config
      const newMax = MODEL_CONFIG[selectedModel]?.maxTokens;
      if (newMax) {
        setMaxTokens(newMax);
      }
    }
  }, [selectedModel]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement> | React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  const clearConversation = () => {
    setMessages([]);
    setFileContent('');
  };

  const submitPrompt = async (prompt: string) => {
    if (usageInfo?.isLimited) return;
    setError(null); // Clear previous errors
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