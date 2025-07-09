'use client';

import React from 'react';
import { SUPPORTED_MODELS, ModelProviderDetails, AiProvider } from '@/lib/ai/models';

interface SidebarProps {
  selectedModel: string;
  onSelectModel: (modelId: string) => void;
}

export function Sidebar({ selectedModel, onSelectModel }: SidebarProps) {
  const groupedModels = SUPPORTED_MODELS.reduce((acc, model) => {
    const provider = model.provider;
    if (!acc[provider]) {
      acc[provider] = [];
    }
    acc[provider].push(model);
    return acc;
  }, {} as Record<AiProvider, typeof SUPPORTED_MODELS>);

  return (
    <div className="h-full w-64 border-r p-4 overflow-y-auto bg-muted/40">
      <h2 className="text-lg font-semibold mb-4">Select a Model</h2>
      <div className="space-y-4">
        {Object.entries(groupedModels).map(([provider, models]) => (
          <div key={provider}>
            <h3 className="font-semibold text-sm text-muted-foreground mb-2">
              {ModelProviderDetails[provider as AiProvider].name}
            </h3>
            <ul className="space-y-1">
              {models.map((model) => (
                <li key={model.id}>
                  <button
                    onClick={() => onSelectModel(model.id)}
                    className={`w-full text-left p-2 rounded-md text-sm transition-colors ${
                      selectedModel === model.id
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-accent hover:text-accent-foreground'
                    }`}
                  >
                    {model.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
