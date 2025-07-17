'use client';

import { useAppContext, MODEL_GROUPS } from "@/context/AppContext";
import { FileText } from 'lucide-react';

const supportedFiles = [
  'PDF', 'PNG', 'DOCX', 'XLSX', 'TXT', 'JSON'
];

const Sidebar = () => {
  const { 
    selectedModel, 
    setSelectedModel, 
    isLoading, 
    systemPrompt, 
    setSystemPrompt, 
    fileContent,
    usageInfo 
  } = useAppContext();

  return (
    <aside className="w-64 p-4 bg-gray-800 border-r border-gray-700 overflow-y-auto">
      <h2 className="text-lg font-semibold mb-2">Model</h2>
      <select
        value={selectedModel}
        onChange={(e) => setSelectedModel(e.target.value)}
        disabled={isLoading || usageInfo?.isLimited}
        className="w-full p-2 rounded-lg bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
      >
        {MODEL_GROUPS.map(group => (
          <optgroup key={group.label} label={group.label}>
            {Object.entries(group.models).map(([key, value]) => (
              <option key={key} value={value}>
                {key}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {usageInfo?.usageWarning && (
        <div className="mt-2 p-2 text-sm text-yellow-400 bg-yellow-900/50 rounded-lg">
          {usageInfo.usageWarning}
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-gray-700/50">
        <h3 className="flex items-center gap-2 text-md font-semibold mb-2 text-gray-300">
          <FileText size={18} />
          対応ファイル
        </h3>
        <div className="flex flex-wrap gap-2">
          {supportedFiles.map(format => (
            <span key={format} className="px-2 py-1 text-xs bg-gray-700 text-gray-300 rounded-md">
              {format}
            </span>
          ))}
        </div>
      </div>

      <h2 className="text-lg font-semibold mt-6 mb-4">System Prompt</h2>
      <textarea
        value={systemPrompt}
        onChange={(e) => setSystemPrompt(e.target.value)}
        disabled={isLoading}
        placeholder="e.g., You are a helpful assistant."
        className="w-full p-2 rounded-lg bg-gray-700 text-white resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 h-32"
      />

      <h2 className="text-lg font-semibold mt-6 mb-4">File Content</h2>
      <textarea
        value={fileContent}
        readOnly
        placeholder="Text extracted from uploaded files will appear here..."
        className="w-full p-2 rounded-lg bg-gray-900 text-gray-400 resize-y focus:outline-none focus:ring-1 focus:ring-gray-600 h-48"
      />
    </aside>
  );
};

export default Sidebar;