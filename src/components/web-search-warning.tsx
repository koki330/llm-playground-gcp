'use client';

import { AlertTriangle } from 'lucide-react';

const WebSearchWarning = () => (
  <div className="mt-3 flex items-start gap-2 p-2 text-xs text-red-800 bg-red-100 border border-red-200 rounded-lg">
    <AlertTriangle size={24} className="flex-shrink-0" />
    <span>Web検索機能は公開情報を対象とします。機密情報や個人情報は入力しないでください。</span>
  </div>
);

export default WebSearchWarning;
