'use client';

import React, { useState } from 'react';

interface ChatInputProps {
  onSendMessage: (prompt: string, fileUrl?: string, contentType?: string) => void;
}

interface UploadedFile {
  url: string;
  type: string;
}

export function ChatInput({ onSendMessage }: ChatInputProps) {
  const [prompt, setPrompt] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    setUploadedFile(null);

    try {
      const response = await fetch('/api/gcs-signed-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, contentType: file.type }),
      });

      if (!response.ok) throw new Error('Failed to get signed URL');
      const { publicUrl, signedUrl } = await response.json();

      const uploadResponse = await fetch(signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });

      if (!uploadResponse.ok) throw new Error('File upload failed');
      setUploadedFile({ url: publicUrl, type: file.type });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() && !uploadedFile) return;
    onSendMessage(prompt, uploadedFile?.url, uploadedFile?.type);
    setPrompt('');
    setUploadedFile(null); // Reset after sending
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 border-t space-y-2">
      <div className="flex items-center space-x-2">
        <input
          type="text"
          placeholder="Type your message or upload a file..."
          className="flex-1 p-2 border rounded-lg w-full bg-background"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={uploading}
        />
        <label className="cursor-pointer">
          <div className="p-2 border rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.44 11.05-9.19 9.19a6.003 6.003 0 1 1-8.49-8.49l8.57-8.57A4.002 4.002 0 0 1 18 8.84l-8.59 8.59a2.001 2.001 0 0 1-2.83-2.83l8.49-8.48"/></svg>
          </div>
          <input type="file" className="hidden" onChange={handleFileChange} disabled={uploading} />
        </label>
        <button type="submit" className="p-2 border rounded-lg bg-primary text-primary-foreground hover:bg-primary/90" disabled={uploading}>
          Send
        </button>
      </div>
      {uploading && <p className="text-sm text-muted-foreground">Uploading...</p>}
      {error && <p className="text-sm text-red-500">Error: {error}</p>}
      {uploadedFile && (
        <div className="text-sm text-green-600">
          File ready: {uploadedFile.url.split('/').pop()}
        </div>
      )}
    </form>
  );
}
