'use client';

import { useEffect, useRef } from 'react';
import Image from 'next/image';
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
    <div className="flex-1 flex flex-col p-4 overflow-y-auto">
      <div className="flex-1 space-y-4">
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
                <div>
                  {msg.content.map((part, index) => {
                    if (part.type === 'text') {
                      return <p key={index}>{part.text}</p>;
                    } else if (part.type === 'image' && part.image?.previewUrl) {
                      return (
                        <div key={index} className="my-2">
                          <Image 
                            src={part.image.previewUrl} 
                            alt="User upload"
                            width={300} // Provide appropriate dimensions
                            height={200}
                            className="rounded-lg"
                          />
                        </div>
                      );
                    }
                    return null;
                  })}
                </div>
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
