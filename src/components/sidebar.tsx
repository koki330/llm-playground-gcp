'use client';

import { useAppContext, MODEL_GROUPS } from "@/context/AppContext";

const Sidebar = () => {
  const { selectedModel, setSelectedModel, isLoading, systemPrompt, setSystemPrompt } = useAppContext();

  return (
    <aside className="w-64 p-4 bg-gray-800 border-r border-gray-700 overflow-y-auto">
      <h2 className="text-lg font-semibold mb-4">Model</h2>
      <select
        value={selectedModel}
        onChange={(e) => setSelectedModel(e.target.value)}
        disabled={isLoading}
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

      <h2 className="text-lg font-semibold mt-6 mb-4">System Prompt</h2>
      <textarea
        value={systemPrompt}
        onChange={(e) => setSystemPrompt(e.target.value)}
        disabled={isLoading}
        placeholder="e.g., You are a helpful assistant."
        className="w-full p-2 rounded-lg bg-gray-700 text-white resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 h-32"
      />
    </aside>
  );
};

export default Sidebar;
