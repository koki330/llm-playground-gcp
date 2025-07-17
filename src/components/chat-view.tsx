'use client';

import { useEffect, useRef } from 'react';
import { useAppContext } from '@/context/AppContext';
import ChatInput from "./chat-input";
import { cn } from '@/lib/utils';

const ChatView = () => {
  const { messages } = useAppContext();
  const endOfMessagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <p className="text-center text-gray-500">Select a model and start chatting.</p>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                'flex items-start gap-3',
                msg.role === 'user' ? 'justify-end' : 'justify-start'
              )}
            >
              <div
                className={cn(
                  'p-3 rounded-lg max-w-xl whitespace-pre-wrap',
                  msg.role === 'user'
                    ? 'bg-blue-600'
                    : 'bg-gray-700'
                )}
              >
                {/* The content from useChat is a simple string */}
                <p>{msg.content}</p>
              </div>
            </div>
          ))
        )}
        <div ref={endOfMessagesRef} />
      </div>
      <ChatInput />
    </div>
  );
};

export default ChatView;