'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChevronDown } from 'lucide-react';
import { ReleaseNote } from '@/app/api/get-release-notes/route';

interface ReleaseNotesModalProps {
  releaseNotes: ReleaseNote[];
  onClose: () => void;
}

const ReleaseNotesModal = ({ releaseNotes, onClose }: ReleaseNotesModalProps) => {
  const [activeIndex, setActiveIndex] = useState<number | null>(0);

  const toggleAccordion = (index: number) => {
    setActiveIndex(activeIndex === index ? null : index);
  };

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-70 z-40 flex justify-center items-center"
      onClick={onClose}
    >
      <div 
        className="bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col border border-gray-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-gray-700">
          <h2 className="text-2xl font-bold text-white">アップデート情報</h2>
        </div>
        <div className="p-6 overflow-y-auto space-y-2">
          {releaseNotes.length > 0 ? (
            releaseNotes.map((note, index) => (
              <div key={index} className="bg-gray-900 rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleAccordion(index)}
                  className="w-full flex justify-between items-center p-4 text-left font-semibold text-white"
                >
                  <span>{note.date}</span>
                  <ChevronDown 
                    size={20} 
                    className={`transform transition-transform duration-200 ${activeIndex === index ? 'rotate-180' : ''}`}
                  />
                </button>
                {activeIndex === index && (
                  <div className="p-4 pt-0">
                    <div className="prose prose-invert prose-sm md:prose-base max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {note.content}
                      </ReactMarkdown>
                    </div>
                  </div>
                )}
              </div>
            ))
          ) : (
            <p className="text-gray-400">アップデート情報はありません。</p>
          )}
        </div>
        <div className="p-6 border-t border-gray-700">
          <button 
            onClick={onClose} 
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md w-full text-white font-semibold"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReleaseNotesModal;
