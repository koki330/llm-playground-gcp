'use client';

import { useState, useRef, useEffect } from 'react';
import { Trash2, Info, History, Globe } from 'lucide-react';
import { useAppContext } from '@/context/AppContext';
import { useOnClickOutside } from '@/hooks/useOnClickOutside';
import ReleaseNotesModal from './ReleaseNotesModal';
import { ReleaseNote } from '@/app/api/get-release-notes/route';

const modelInfoLinks = [
  { name: 'OpenAI', url: 'https://platform.openai.com/docs/overview' },
  { name: 'Anthropic', url: 'https://docs.anthropic.com/en/api/overview' },
  { name: 'Gemini', url: 'https://ai.google.dev/gemini-api/docs/models?hl=ja' },
];

const Header = () => {
  const { clearConversation } = useAppContext();
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [isReleaseNotesOpen, setIsReleaseNotesOpen] = useState(false);
  const [releaseNotes, setReleaseNotes] = useState<ReleaseNote[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useOnClickOutside(dropdownRef, () => setIsInfoOpen(false));

  useEffect(() => {
    const fetchReleaseNotes = async () => {
      try {
        const response = await fetch('/api/get-release-notes');
        const data = await response.json();
        if (response.ok) {
          setReleaseNotes(data);
        } else {
          setReleaseNotes([{ date: 'Error', content: 'アップデート情報の読み込みに失敗しました。' }]);
        }
      } catch {
        setReleaseNotes([{ date: 'Error', content: 'アップデート情報の読み込み中にエラーが発生しました。' }]);
      }
    };
    fetchReleaseNotes();
  }, []);

  return (
    <header className="flex items-center justify-between p-4 bg-gray-800 border-b border-gray-700">
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-bold">LLM Playground</h1>
        {process.env.NEXT_PUBLIC_ENVIRONMENT === 'staging' && (
          <span className="ml-2 px-2 py-1 text-xs font-semibold text-white bg-yellow-500 rounded-full">
            検証用
          </span>
        )}
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
        <button 
          onClick={() => setIsReleaseNotesOpen(true)}
          className="p-2 rounded-md hover:bg-gray-700 text-gray-400 hover:text-white transition-colors flex items-center gap-1"
          title="Update Information"
        >
          <History size={18} />
          <span>アップデート情報</span>
        </button>
        <a 
          href="https://tecnos-translate-701078018244.asia-northeast1.run.app"
          target="_blank"
          rel="noopener noreferrer"
          className="p-2 rounded-md hover:bg-gray-700 text-gray-400 hover:text-white transition-colors flex items-center gap-1"
          title="Tecnos Translate"
        >
          <Globe size={18} />
          <span>Tecnos Translate</span>
        </a>
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
      {isReleaseNotesOpen && (
        <ReleaseNotesModal 
          releaseNotes={releaseNotes} 
          onClose={() => setIsReleaseNotesOpen(false)} 
        />
      )}
    </header>
  );
};

export default Header;