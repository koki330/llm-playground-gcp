'use client';

import { useEffect, useRef, useState, memo } from 'react';
import { useAppContext } from '@/context/AppContext';
import ChatInput from "./chat-input";
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import { codeToHtml } from 'shiki';

interface CodeBlockProps {
  className?: string;
  children: React.ReactNode;
}

const CodeBlock = memo(({ className, children }: CodeBlockProps) => {
  const [highlightedCode, setHighlightedCode] = useState('');
  const lang = className?.replace(/language-/, '') || 'text';
  const codeString = String(children).replace(/\n$/, '');

  useEffect(() => {
    const highlight = async () => {
      try {
        const html = await codeToHtml(codeString, {
          lang,
          theme: 'vsc-dark-plus'
        });
        setHighlightedCode(html);
      } catch (error) {
        console.error('Error highlighting code:', error);
        // In case of error, fallback to plain text
        setHighlightedCode(`<pre><code>${codeString}</code></pre>`);
      }
    };
    highlight();
  }, [codeString, lang]);

  // Use a key to force re-render when highlightedCode changes
  return <div key={highlightedCode} dangerouslySetInnerHTML={{ __html: highlightedCode }} />;
});

CodeBlock.displayName = 'CodeBlock';

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
                    : 'bg-gray-700',
                  'prose prose-invert max-w-none'
                )}
              >
                <ReactMarkdown
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
