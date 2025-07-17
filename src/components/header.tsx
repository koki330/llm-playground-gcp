'use client';

import { useState, useRef } from 'react';
import { Trash2, Info } from 'lucide-react';
import { useAppContext } from '@/context/AppContext';
import { useOnClickOutside } from '@/hooks/useOnClickOutside';

const modelInfoLinks = [
  { name: 'OpenAI', url: 'https://platform.openai.com/docs/overview' },
  { name: 'Anthropic', url: 'https://docs.anthropic.com/en/api/overview' },
  { name: 'Gemini', url: 'https://ai.google.dev/gemini-api/docs/models?hl=ja' },
];

const Header = () => {
  const { clearConversation } = useAppContext();
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useOnClickOutside(dropdownRef, () => setIsInfoOpen(false));

  return (
    <header className="flex items-center justify-between p-4 bg-gray-800 border-b border-gray-700">
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-bold">LLM Playground</h1>
        <div className="relative" ref={dropdownRef}>
          <button 
            onClick={() => setIsInfoOpen(!isInfoOpen)}
            className="p-2 rounded-md hover:bg-gray-700 text-gray-400 hover:text-white transition-colors flex items-center gap-1"
            title="Model Information"
          >
            <Info size={18} />
            <span>モデル情報</span>
          </button>
          {isInfoOpen && (
            <div className="absolute left-0 mt-2 w-48 bg-gray-700 rounded-md shadow-lg z-10">
              <ul className="py-1">
                {modelInfoLinks.map(link => (
                  <li key={link.name}>
                    <a 
                      href={link.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="block px-4 py-2 text-sm text-white hover:bg-gray-600"
                    >
                      {link.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
      <div>
        <button 
          onClick={clearConversation}
          className="p-2 rounded-md hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
          title="Clear conversation"
        >
          <Trash2 size={20} />
        </button>
      </div>
    </header>
  );
};

export default Header;