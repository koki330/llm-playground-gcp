'use client';

import { useState } from 'react';
import { useAppContext } from '@/context/AppContext';

const ChatInput = () => {
  const [prompt, setPrompt] = useState('');
  const { submitPrompt, isLoading } = useAppContext();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isLoading) return;
    submitPrompt(prompt);
    setPrompt('');
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 bg-gray-800 border-t border-gray-700">
      <div className="relative">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
          placeholder="Message a model..."
          className="w-full p-2 pr-20 rounded-lg bg-gray-700 text-white resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          rows={1}
          disabled={isLoading}
        />
        <button 
          type="submit"
          className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-500 text-white font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          disabled={!prompt.trim() || isLoading}
        >
          {isLoading ? '...' : 'Send'}
        </button>
      </div>
    </form>
  );
};

export default ChatInput;
