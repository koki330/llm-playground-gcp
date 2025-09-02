'use client';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { useAppContext } from '@/context/AppContext';
import { X, Loader2, FileText, Copy, Check } from 'lucide-react';
import ChatInput from "./chat-input";
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import dynamic from 'next/dynamic';

const CodeBlock = dynamic(() => import('./code-block'), { ssr: false });

const ChatView = () => {
  const { messages, error, setError, isLoading, isFileProcessing } = useAppContext();
  const endOfMessagesRef = useRef<HTMLDivElement>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  const handleCopy = (text: string, messageId: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedMessageId(messageId);
      setTimeout(() => setCopiedMessageId(null), 2000);
    });
  };

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <p className="text-center text-gray-500">Select a model and start chatting.</p>
        ) : (
          messages.map((msg) => {
            const hasPreviewUrl = (data: unknown): data is { previewUrl: string } => {
              return (
                typeof data === 'object' &&
                data != null &&
                'previewUrl' in data &&
                typeof (data as { previewUrl: unknown }).previewUrl === 'string'
              );
            };

            const messageContent = (
              <>
                {Array.isArray(msg.parts) && msg.parts.length > 0 ? (
                  msg.parts.map((part, index) => {
                    switch (part.type) {
                      case 'text':
                        return (
                          <ReactMarkdown
                            key={index}
                            remarkPlugins={[remarkGfm, remarkBreaks]}
                            components={{
                              code(props) {
                                const { children, className } = props;
                                const match = /language-(\w+)/.exec(className || '');
                                return match ? (
                                  <CodeBlock className={className} isLoading={isLoading}>{children}</CodeBlock>
                                ) : (
                                  <code className={className}>{children}</code>
                                );
                              },
                            }}
                          >
                            {part.text}
                          </ReactMarkdown>
                        );
                      default:
                        return null;
                    }
                  })
                ) : typeof msg.content === 'string' ? (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkBreaks]}
                    components={{
                      code(props) {
                        const { children, className } = props;
                        const match = /language-(\w+)/.exec(className || '');
                        return match ? (
                          <CodeBlock className={className} isLoading={isLoading}>{children}</CodeBlock>
                        ) : (
                          <code className={className}>{children}</code>
                        );
                      },
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                ) : null}
              </>
            );

            const rawText = Array.isArray(msg.parts)
              ? msg.parts.map(p => p.type === 'text' ? p.text : '').join('')
              : (typeof msg.content === 'string' ? msg.content : '');

            return (
              <div
                key={msg.id}
                className={cn(
                  'flex items-start gap-3',
                  msg.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                <div
                  className={cn(
                  'p-3 rounded-lg max-w-4xl break-words relative group',
                  'prose',
                  msg.role === 'user'
                    ? 'bg-blue-100'
                    : 'bg-gray-100'
                )}
                >
                  {msg.role === 'assistant' && rawText && (
                    <button 
                      onClick={() => handleCopy(rawText, msg.id)}
                      className="absolute top-2 right-2 p-1 rounded-md bg-black/5 text-gray-500 hover:bg-black/10 hover:text-gray-800 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Copy Markdown"
                    >
                      {copiedMessageId === msg.id ? <Check size={16} /> : <Copy size={16} />}
                    </button>
                  )}
                  <div className="space-y-2">
                    {hasPreviewUrl(msg.data) && (
                      <Image
                        src={msg.data.previewUrl}
                        alt="User uploaded content"
                        width={500}
                        height={500}
                        className="h-auto rounded-lg max-w-xs lg:max-w-sm xl:max-w-md"
                        unoptimized
                      />
                    )}
                    {messageContent}
                  </div>
                </div>
              </div>
            );
          })
        )}
        {isFileProcessing && (
          <div className="flex items-start gap-3 justify-start">
            <div className="p-3 rounded-lg bg-gray-100 text-gray-700 flex items-center space-x-2">
              <FileText className="h-5 w-5 animate-pulse" />
              <span className="text-sm">ファイルを処理中です...</span>
            </div>
          </div>
        )}
        {!isFileProcessing && isLoading && (
          <div className="flex items-start gap-3 justify-start">
            <div className="p-3 rounded-lg bg-gray-100 text-gray-700 flex items-center space-x-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">回答を生成中です...</span>
            </div>
          </div>
        )}
        <div ref={endOfMessagesRef} />
      </div>
      {error && (
        <div className="p-4 border-t border-gray-700 bg-red-900/50 text-red-300">
          <div className="flex items-center justify-between">
            <p><span className="font-bold">Error:</span> {error}</p>
            <button onClick={() => setError(null)} className="p-1 rounded-full hover:bg-red-200">
              <X size={18} />
            </button>
          </div>
        </div>
      )}
      <ChatInput />
    </div>
  );
};

export default ChatView;
