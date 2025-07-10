'use client';

import { useState, useRef } from 'react';
import { useAppContext, Attachment } from '@/context/AppContext';
import { Paperclip, X } from 'lucide-react';

const ChatInput = () => {
  const [prompt, setPrompt] = useState('');
  // Call the hook once at the top level
  const { submitPrompt, isLoading, fileContent, setFileContent } = useAppContext();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const file = e.target.files[0];
      if (!file) return;

      // Clear previous text content when a new file is selected
      setFileContent('');
      setAttachments([]);

      try {
        const signedUrlResponse = await fetch('/api/generate-upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: file.name, contentType: file.type }),
        });

        if (!signedUrlResponse.ok) throw new Error('Failed to get signed URL.');
        const { uploadUrl, gcsUri } = await signedUrlResponse.json();

        const uploadResponse = await fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type },
          body: file,
        });

        if (!uploadResponse.ok) throw new Error('Failed to upload file to GCS.');

        if (file.type === 'text/plain') {
          const extractResponse = await fetch('/api/extract-text', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gcsUri }),
          });
          if (!extractResponse.ok) throw new Error('Failed to extract text.');
          const { text } = await extractResponse.json();
          setFileContent(text);
          // Also add to attachments to display in the input area
          setAttachments([{ name: file.name, type: file.type, gcsUri: gcsUri, previewUrl: '' }]);
        } else if (file.type.startsWith('image/')) {
          const previewUrl = URL.createObjectURL(file);
          const newAttachment: Attachment = {
            name: file.name,
            type: file.type,
            gcsUri: gcsUri,
            previewUrl: previewUrl,
          };
          setAttachments([newAttachment]); // Only one attachment at a time
        }

      } catch (error) {
        console.error('File processing error:', error);
      }
    }
  };

  const handleRemoveAttachment = (fileName: string) => {
    setAttachments(prev => {
      const attachmentToRemove = prev.find(file => file.name === fileName);
      if (attachmentToRemove) {
        if (attachmentToRemove.type.startsWith('image/')) {
          URL.revokeObjectURL(attachmentToRemove.previewUrl);
        } else if (attachmentToRemove.type === 'text/plain') {
          // If a text file is removed, clear the content from the context
          setFileContent('');
        }
      }
      return prev.filter(file => file.name !== fileName);
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Use the variable from the top-level hook call
    if ((!prompt.trim() && attachments.length === 0 && !fileContent) || isLoading) return;
    submitPrompt(prompt, attachments);
    setPrompt('');
    attachments.forEach(file => URL.revokeObjectURL(file.previewUrl));
    setAttachments([]);
    setFileContent('');
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 bg-gray-800 border-t border-gray-700">
      {/* Display for attachments (both image and text files) */}
      {attachments.length > 0 && (
        <div className="p-2 mb-2 bg-gray-700 rounded-lg text-sm text-white">
          {attachments.map(file => (
            <div key={file.name} className="flex items-center justify-between">
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
          accept="image/png,image/jpeg,image/gif,image/webp,text/plain"
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
          // Use the variable from the top-level hook call
          disabled={(!prompt.trim() && attachments.length === 0 && !fileContent) || isLoading}
        >
          {isLoading ? '...' : 'Send'}
        </button>
      </div>
    </form>
  );
};

export default ChatInput;
