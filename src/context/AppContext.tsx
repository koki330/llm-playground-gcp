'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';

// Updated ContentPart to reference a GCS URI for images
export interface ContentPart {
  type: 'text' | 'image';
  text?: string;
  image?: {
    gcsUri: string;
    mediaType: string;
    previewUrl?: string; // For frontend display
  };
}

export interface Message {
  id: string;
  role: 'user' | 'model';
  content: ContentPart[];
}

// Attachment now includes the previewUrl for the UI
export interface Attachment {
  name: string;
  type: string;
  gcsUri: string;
  previewUrl: string;
}

export const MODEL_GROUPS = [
  {
    label: "Anthropic",
    models: {
      'Claude 3.7 Sonnet': 'claude-3-7-sonnet-20250219',
      'Claude 3.5 Sonnet': 'claude-3-5-sonnet-20240620',
      'Claude 3.5 Haiku': 'claude-3-5-haiku-20241022',
      'Claude 3 Opus': 'claude-3-opus-20240229',
      'Claude 3 Sonnet': 'claude-3-sonnet-20240229',
      'Claude 3 Haiku': 'claude-3-haiku-20240307',
    }
  },
  {
    label: "OpenAI",
    models: {
      'GPT-4.1': 'gpt-4.1',
      'GPT-4o': 'gpt-4o',
      'GPT-4o mini': 'gpt-4o-mini',
      'GPT-3.5 Turbo': 'gpt-3.5-turbo',
      'O1': 'o1',
      'O3-mini': 'o3-mini',
    }
  },
  {
    label: "Gemini",
    models: {
      'Gemini 2.5 Pro': 'gemini-2.5-pro',
      'Gemini 2.5 Flash': 'gemini-2.5-flash',
      'Gemini 1.5 Pro': 'gemini-1.5-pro',
      'Gemini 1.5 Flash': 'gemini-1.5-flash',
    }
  }
];

export const AVAILABLE_MODELS = MODEL_GROUPS.reduce((acc, group) => {
  return { ...acc, ...group.models };
}, {});

interface AppContextType {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  selectedModel: string;
  setSelectedModel: React.Dispatch<React.SetStateAction<string>>;
  isLoading: boolean;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  systemPrompt: string;
  setSystemPrompt: React.Dispatch<React.SetStateAction<string>>;
  fileContent: string;
  setFileContent: React.Dispatch<React.SetStateAction<string>>;
  submitPrompt: (prompt: string, attachments: Attachment[]) => void;
  clearConversation: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedModel, setSelectedModel] = useState('claude-3-7-sonnet-20250219');
  const [isLoading, setIsLoading] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [fileContent, setFileContent] = useState(''); // Re-add state for extracted text

  const clearConversation = () => {
    setMessages([]);
    setFileContent(''); // Clear file content as well
  };

  const submitPrompt = async (prompt: string, attachments: Attachment[] = []) => {
    setIsLoading(true);

    const content: ContentPart[] = [];

    // Combine file content with the user's prompt if it exists
    let combinedPrompt = prompt;
    if (fileContent) {
      combinedPrompt = `Extracted File Content:\n\n${fileContent}\n\n---\n\nUser Prompt:\n\n${prompt}`;
    }
    content.push({ type: 'text', text: combinedPrompt });

    // Add image attachments if any
    if (attachments.length > 0) {
      attachments.forEach(file => {
        if (file.type.startsWith('image')) {
          content.push({
            type: 'image',
            image: { 
              gcsUri: file.gcsUri, 
              mediaType: file.type, 
              previewUrl: file.previewUrl 
            },
          });
        }
      });
    }

    const newUserMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: content,
    };

    const newMessages = [...messages, newUserMessage];
    setMessages(newMessages);
    setFileContent(''); // Clear file content after sending

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages,
          modelId: selectedModel,
          systemPrompt: systemPrompt,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`API error: ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let modelResponse = '';
      const modelMessageId = Date.now().toString() + '-model';

      setMessages(prev => [...prev, { id: modelMessageId, role: 'model', content: [{ type: 'text', text: '...' }] }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        modelResponse += decoder.decode(value, { stream: true });
        setMessages(prev => prev.map(msg =>
          msg.id === modelMessageId ? { ...msg, content: [{ type: 'text', text: modelResponse }] } : msg
        ));
      }

    } catch (error) {
      console.error('Failed to fetch chat response:', error);
      const errorMsg = error instanceof Error ? error.message : 'An unknown error occurred.';
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', content: [{ type: 'text', text: `Error: ${errorMsg}` }] }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AppContext.Provider value={{ messages, setMessages, selectedModel, setSelectedModel, isLoading, setIsLoading, systemPrompt, setSystemPrompt, fileContent, setFileContent, submitPrompt, clearConversation }}>
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