'use client';

import React, { useEffect, useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';

interface ChatWindowProps {
  messages: string[]; // Raw JSON string messages from WebSocket
}

interface DisplayMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
}

export function ChatWindow({ messages: rawMessages }: ChatWindowProps) {
  const [history, setHistory] = useState<DisplayMessage[]>([]);
  const [currentAiResponse, setCurrentAiResponse] = useState('');
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    rawMessages.forEach(rawMsg => {
      try {
        const msg = JSON.parse(rawMsg);
        if (msg.type === 'chunk') {
          setCurrentAiResponse(prev => prev + msg.data);
        } else if (msg.type === 'end') {
          setHistory(prev => {
            const newHistory = [...prev];
            // Simple way to add the completed AI message
            // A robust implementation would use message IDs
            newHistory.push({ id: Date.now().toString(), sender: 'ai', text: currentAiResponse });
            return newHistory;
          });
          setCurrentAiResponse('');
        } else if (msg.type === 'user_message') { // Assuming we might send user messages via WS too
           setHistory(prev => [...prev, { id: msg.id, sender: 'user', text: msg.text}]);
        }
      } catch (e) {
        console.error('Failed to parse WebSocket message', e);
      }
    });
    // This dependency array is simplified. In a real app, you might clear rawMessages after processing.
  }, [rawMessages]);

  useEffect(() => {
    // Auto-scroll to bottom
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [history, currentAiResponse]);


  return (
    <div ref={scrollAreaRef} className="flex-1 p-4 overflow-y-auto">
      <div className="h-full border rounded-lg p-4 space-y-4">
        {history.map((msg) => (
          <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`p-2 rounded-lg max-w-2xl ${msg.sender === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
              <ReactMarkdown>{msg.text}</ReactMarkdown>
            </div>
          </div>
        ))}
        {currentAiResponse && (
          <div className="flex justify-start">
            <div className="p-2 rounded-lg max-w-2xl bg-muted">
              <ReactMarkdown>{currentAiResponse}</ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
