'use client';

import { Trash2 } from 'lucide-react';
import { useAppContext } from '@/context/AppContext';

const Header = () => {
  const { clearConversation } = useAppContext();

  return (
    <header className="flex items-center justify-between p-4 bg-gray-800 border-b border-gray-700">
      <h1 className="text-xl font-bold">LLM Playground</h1>
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
