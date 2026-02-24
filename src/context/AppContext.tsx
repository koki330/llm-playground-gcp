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

export interface FileContentItem {
  name: string;
  content: string;
}

export type TemperaturePreset = 'precise' | 'balanced' | 'creative';

// Type for the configuration data fetched from the API
interface ModelConfigData {
  modelGroups: { label: string; models: Record<string, string> }[];
  modelConfig: Record<string, { type: 'normal' | 'gpt5' | 'gemini3'; maxTokens: number; supportsPdf?: boolean }>;
}

interface UsageInfo {
  limit: number | null;
  total_cost: number;
  total_input_tokens: number;
  total_output_tokens: number;
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
  fileContents: FileContentItem[];
  setFileContents: React.Dispatch<React.SetStateAction<FileContentItem[]>>;
  imageUris: string[];
  setImageUris: React.Dispatch<React.SetStateAction<string[]>>;
  pdfUris: string[];
  setPdfUris: React.Dispatch<React.SetStateAction<string[]>>;
  submitPrompt: (prompt: string, previewUrls?: string[], pdfFileNames?: string[], docFileNames?: string[]) => void;
  clearConversation: () => void;
  input: string;
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement> | React.ChangeEvent<HTMLTextAreaElement>) => void;
  stopGeneration: () => void;
  usageInfo: UsageInfo | null;
  error: string | null;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  temperaturePreset: TemperaturePreset;
  setTemperaturePreset: React.Dispatch<React.SetStateAction<TemperaturePreset>>;
  maxTokens: number;
  setMaxTokens: React.Dispatch<React.SetStateAction<number>>;
  currentModelConfig: { type: 'normal' | 'gpt5' | 'gemini3', maxTokens: number, supportsPdf?: boolean } | undefined;
  modelGroups: { label: string; models: Record<string, string> }[];
  gpt5ReasoningEffort: 'none' | 'minimal' | 'low' | 'medium' | 'high';
  setGpt5ReasoningEffort: React.Dispatch<React.SetStateAction<'none' | 'minimal' | 'low' | 'medium' | 'high'>>;
  gpt5Verbosity: 'low' | 'medium' | 'high';
  setGpt5Verbosity: React.Dispatch<React.SetStateAction<'low' | 'medium' | 'high'>>;
  gemini3ThinkingLevel: 'low' | 'high';
  setGemini3ThinkingLevel: React.Dispatch<React.SetStateAction<'low' | 'high'>>;
  gpt5GroundingEnabled: boolean;
  setGpt5GroundingEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  geminiGroundingEnabled: boolean;
  setGeminiGroundingEnabled: React.Dispatch<React.SetStateAction<boolean>>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [modelConfigData, setModelConfigData] = useState<ModelConfigData | null>(null);
  const [isConfigLoading, setIsConfigLoading] = useState(true);
  const [selectedModel, setSelectedModel] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [fileContents, setFileContents] = useState<FileContentItem[]>([]);
  const [imageUris, setImageUris] = useState<string[]>([]);
  const [pdfUris, setPdfUris] = useState<string[]>([]);
  const [isFileProcessing, setIsFileProcessing] = useState(false);
  const [usageInfo, setUsageInfo] = useState<UsageInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [temperaturePreset, setTemperaturePreset] = useState<TemperaturePreset>('balanced');
  const [maxTokens, setMaxTokens] = useState(4096);
  const [gpt5ReasoningEffort, setGpt5ReasoningEffort] = useState<'none' | 'minimal' | 'low' | 'medium' | 'high'>('medium');
  const [gpt5Verbosity, setGpt5Verbosity] = useState<'low' | 'medium' | 'high'>('medium');
  const [gemini3ThinkingLevel, setGemini3ThinkingLevel] = useState<'low' | 'high'>('high');
  const [gpt5GroundingEnabled, setGpt5GroundingEnabled] = useState(false);
  const [geminiGroundingEnabled, setGeminiGroundingEnabled] = useState(false);

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

        // Set 'gpt-5-mini' as the default model if it exists, otherwise fall back to the first available model.
        const gpt5MiniExists = data.modelGroups.some(group =>
          Object.values(group.models).includes('gpt-5-mini')
        );

        if (gpt5MiniExists) {
          setSelectedModel('gpt-5-mini');
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

  const { messages, append, isLoading, input, setInput, setMessages, stop } = useChat({
    api: '/api/chat',
    body: {
      modelId: selectedModel,
      systemPrompt: systemPrompt,
      temperaturePreset: currentModelConfig?.type === 'normal' ? temperaturePreset : undefined,
      maxTokens: currentModelConfig?.type === 'normal' ? maxTokens : undefined,
      gpt5ReasoningEffort: selectedModel.startsWith('gpt-5') ? gpt5ReasoningEffort : undefined,
      gpt5Verbosity: selectedModel.startsWith('gpt-5') ? gpt5Verbosity : undefined,
      gpt5GroundingEnabled: selectedModel.startsWith('gpt-5') ? gpt5GroundingEnabled : undefined,
      geminiGroundingEnabled: selectedModel.startsWith('gemini') ? geminiGroundingEnabled : undefined,
      gemini3ThinkingLevel: selectedModel === 'gemini-3-pro-preview' ? gemini3ThinkingLevel : undefined,
      // imageUri is now passed directly in submitPrompt
    },
    onError: (err) => {
      setError(err.message);
    },
    onFinish: () => {
      setImageUris([]);
      setPdfUris([]);
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
      if (data.limit !== null && data.total_cost > 0) { // Only show warning if there is usage
        const percentage = Math.round((data.total_cost / data.limit) * 100);
        if (percentage >= 100) {
          usageWarning = `【利用上限超過】このモデルは月の利用上限に達しました。`;
          isLimited = true;
        } else if (percentage >= 80) {
          usageWarning = `【警告】月の利用上限の${percentage}%に達しています。`;
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
      setGpt5GroundingEnabled(false);
      setGeminiGroundingEnabled(false);
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
    // Type guard to check for previewUrls in a type-safe way
    const hasPreviewUrls = (data: unknown): data is { previewUrls: string[] } => {
      return typeof data === 'object' && data != null && 'previewUrls' in data;
    };

    // Revoke any object URLs to prevent memory leaks
    messages.forEach(msg => {
      if (hasPreviewUrls(msg.data)) {
        msg.data.previewUrls.forEach(url => URL.revokeObjectURL(url));
      }
    });
    setMessages([]);
    setFileContents([]);
    setImageUris([]);
    setPdfUris([]);
  };

  const submitPrompt = async (prompt: string, previewUrls?: string[], pdfFileNames?: string[], docFileNames?: string[]) => {
    if (usageInfo?.isLimited || !selectedModel) return;
    setError(null);

    // Validate PDF support for the selected model
    if (pdfUris.length > 0 && !currentModelConfig?.supportsPdf) {
      setError('選択中のモデルはPDFのネイティブ処理に対応していません。別のモデルを選択してください。');
      return;
    }

    // Let the `useChat` hook handle the message creation and state update.
    // We pass all necessary info, including UI data, directly to `append`.
    const data: { previewUrls?: string[]; pdfFileNames?: string[]; docFileNames?: string[] } = {};
    if (previewUrls && previewUrls.length > 0) data.previewUrls = previewUrls;
    if (pdfFileNames && pdfFileNames.length > 0) data.pdfFileNames = pdfFileNames;
    if (docFileNames && docFileNames.length > 0) data.docFileNames = docFileNames;

    await append(
      {
        role: 'user',
        content: prompt,
        data: Object.keys(data).length > 0 ? data : undefined,
      },
      { body: { imageUris, pdfUris, fileContents: fileContents.length > 0 ? fileContents : undefined } }
    );

    // Reset input states after the submission is complete.
    // The core message state is managed by the hook.
    setInput('');
    setFileContents([]);
    // imageUri and imageUris are reset in onFinish to ensure they're available for the request
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
        fileContents,
        setFileContents,
        imageUris,
        setImageUris,
        pdfUris,
        setPdfUris,
        submitPrompt,
        clearConversation,
        input,
        handleInputChange,
        stopGeneration: stop,
        usageInfo,
        error,
        setError,
        temperaturePreset,
        setTemperaturePreset,
        maxTokens,
        setMaxTokens,
        currentModelConfig,
        modelGroups,
        gpt5ReasoningEffort,
        setGpt5ReasoningEffort,
        gpt5Verbosity,
        setGpt5Verbosity,
        gemini3ThinkingLevel,
        setGemini3ThinkingLevel,
        gpt5GroundingEnabled,
        setGpt5GroundingEnabled,
        geminiGroundingEnabled,
        setGeminiGroundingEnabled,
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
