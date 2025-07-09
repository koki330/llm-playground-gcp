'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';

// Define the shape of a message
export interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
}

// Define the models that can be selected
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

// For convenience, create a flat map of all models for easy lookup
export const AVAILABLE_MODELS = MODEL_GROUPS.reduce((acc, group) => {
  return { ...acc, ...group.models };
}, {});

// Define the shape of the context
interface AppContextType {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  selectedModel: string;
  setSelectedModel: React.Dispatch<React.SetStateAction<string>>;
  isLoading: boolean;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  systemPrompt: string;
  setSystemPrompt: React.Dispatch<React.SetStateAction<string>>;
  submitPrompt: (prompt: string) => void;
  clearConversation: () => void; // Add this line
}

// Create the context
const AppContext = createContext<AppContextType | undefined>(undefined);

// Create the provider component
export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedModel, setSelectedModel] = useState('claude-3-7-sonnet-20250219');
  const [isLoading, setIsLoading] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState(''); // Add state for system prompt

  const clearConversation = () => {
    setMessages([]);
  };

  const submitPrompt = async (prompt: string) => {
    setIsLoading(true);
    const newUserMessage: Message = { id: Date.now().toString(), role: 'user', content: prompt };
    setMessages(prev => [...prev, newUserMessage]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          messages: [...messages, newUserMessage], 
          modelId: selectedModel,
          systemPrompt: systemPrompt, // Send system prompt to backend
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`API error: ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let modelResponse = '';
      const modelMessageId = Date.now().toString() + '-model';

      // Add a placeholder for the model's response
      setMessages(prev => [...prev, { id: modelMessageId, role: 'model', content: '...' }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        modelResponse += decoder.decode(value, { stream: true });
        // Update the placeholder message with the streaming content
        setMessages(prev => prev.map(msg => 
          msg.id === modelMessageId ? { ...msg, content: modelResponse } : msg
        ));
      }

    } catch (error) {
      console.error('Failed to fetch chat response:', error);
      const errorMsg = error instanceof Error ? error.message : 'An unknown error occurred.';
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', content: `Error: ${errorMsg}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AppContext.Provider value={{ messages, setMessages, selectedModel, setSelectedModel, isLoading, setIsLoading, systemPrompt, setSystemPrompt, submitPrompt, clearConversation }}>
      {children}
    </AppContext.Provider>
  );
};

// Create a custom hook to use the context
export const useAppContext = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};
