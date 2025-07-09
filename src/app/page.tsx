'use client';

import { Sidebar } from "@/components/custom/sidebar";
import { ChatWindow } from "@/components/custom/chat-window";
import { ChatInput } from "@/components/custom/chat-input";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useState } from "react";

export interface Message {
  id: string;
  sender: 'user' | 'ai';
  text: string;
}

export default function Home() {
  const { messages: wsMessages, isConnected, clientId } = useWebSocket();
  const [chatHistory, setChatHistory] = useState<Message[]>([]);
  const [currentAiResponse, setCurrentAiResponse] = useState('');

  // This is a simplified way to handle streaming messages.
  // A more robust solution would handle message IDs and ordering.
  // For now, we just append new chunks.
  // Note: This effect is illustrative. A better implementation would be needed for production.
  // We will refine this in the polishing phase.

  const [selectedModel, setSelectedModel] = useState<string>('gpt-4o'); // Default model

  const handleSendMessage = async (prompt: string, fileUrl?: string, contentType?: string) => {
    if ((!prompt && !fileUrl) || !isConnected) return;

    // Add user message to history
    const userMessage: Message = { id: Date.now().toString(), sender: 'user', text: prompt };
    setChatHistory(prev => [...prev, userMessage]);
    setCurrentAiResponse(''); // Clear previous AI response

    // Call the chat API
    await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        prompt, 
        clientId, 
        modelId: selectedModel, // Pass the selected model ID
        fileUrl,
        contentType,
      }),
    });
  };

  return (
    <main className="flex h-screen bg-background text-foreground">
      <Sidebar onSelectModel={setSelectedModel} selectedModel={selectedModel} />
      <div className="flex flex-col flex-1">
        <ChatWindow messages={wsMessages} />
        <ChatInput onSendMessage={handleSendMessage} />
      </div>
    </main>
  );
}
