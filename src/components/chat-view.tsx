'use client';

import { useEffect, useRef } from 'react';
import { useAppContext } from '@/context/AppContext';
import ChatInput from "./chat-input";
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import dynamic from 'next/dynamic';

const CodeBlock = dynamic(() => import('./code-block'), { ssr: false });

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
                  'p-3 rounded-lg max-w-4xl break-words',
                  msg.role === 'user'
                    ? 'bg-blue-600'
                    : 'bg-gray-700',
                  'prose prose-invert'
                )}
              >
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    code(props) {
                      const { children, className } = props;
                      const match = /language-(\w+)/.exec(className || '');
                      return match ? (
                        <CodeBlock className={className}>{children}</CodeBlock>
                      ) : (
                        <code className={className}>
                          {children}
                        </code>
                      );
                    },
                  }}
                >
                  {msg.content}
                </ReactMarkdown>
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