'use client';

import { useState, useRef } from 'react';
import { useAppContext, Attachment } from '@/context/AppContext';
import { Paperclip, X } from 'lucide-react';

const ChatInput = () => {
  const [prompt, setPrompt] = useState('');
  const { submitPrompt, isLoading } = useAppContext();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const file = e.target.files[0];
      if (!file) return;

      try {
        // 1. Get signed URL from the backend
        const signedUrlResponse = await fetch('/api/generate-upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: file.name, contentType: file.type }),
        });

        if (!signedUrlResponse.ok) {
          throw new Error('Failed to get signed URL.');
        }

        const { uploadUrl, gcsUri } = await signedUrlResponse.json();

        // 2. Upload file directly to GCS
        const uploadResponse = await fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type },
          body: file,
        });

        if (!uploadResponse.ok) {
          throw new Error('Failed to upload file to GCS.');
        }

        const previewUrl = URL.createObjectURL(file);

        // 3. Add file info to state for submission
        const newAttachment: Attachment = {
          name: file.name,
          type: file.type,
          gcsUri: gcsUri,
          previewUrl: previewUrl,
        };
        setAttachments(prev => [...prev, newAttachment]);

      } catch (error) {
        console.error('File upload error:', error);
        // You might want to show an error to the user here
      }
    }
  };

  const handleRemoveAttachment = (fileName: string) => {
    setAttachments(prev => {
      const newAttachments = prev.filter(file => {
        if (file.name === fileName) {
          URL.revokeObjectURL(file.previewUrl); // Clean up object URL
          return false;
        }
        return true;
      });
      return newAttachments;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((!prompt.trim() && attachments.length === 0) || isLoading) return;
    submitPrompt(prompt, attachments);
    setPrompt('');
    // Clean up any remaining object URLs
    attachments.forEach(file => URL.revokeObjectURL(file.previewUrl));
    setAttachments([]);
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 bg-gray-800 border-t border-gray-700">
      {attachments.length > 0 && (
        <div className="p-2 mb-2 bg-gray-700 rounded-lg">
          {attachments.map(file => (
            <div key={file.name} className="flex items-center justify-between text-sm text-white bg-gray-600 px-2 py-1 rounded-md">
              <span>{file.name}</span>
              <button onClick={() => handleRemoveAttachment(file.name)} className="text-gray-400 hover:text-white">
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="relative flex items-center">
        <button 
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="p-2 rounded-full hover:bg-gray-700 text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <Paperclip size={20} />
        </button>
        <input 
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
          accept="image/png,image/jpeg,image/gif,image/webp"
        />
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
          placeholder="Message a model, or add a file..."
          className="flex-grow p-2 pr-20 rounded-lg bg-gray-700 text-white resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          rows={1}
          disabled={isLoading}
        />
        <button 
          type="submit"
          className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-500 text-white font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          disabled={(!prompt.trim() && attachments.length === 0) || isLoading}
        >
          {isLoading ? '...' : 'Send'}
        </button>
      </div>
    </form>
  );
};

export default ChatInput;
