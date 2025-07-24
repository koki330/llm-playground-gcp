'use client';

import { useState, useRef, FormEvent, KeyboardEvent } from 'react';
import { useAppContext, Attachment } from '@/context/AppContext';
import { Paperclip, X, Send } from 'lucide-react';
import Textarea from 'react-textarea-autosize';

const ChatInput = () => {
  const { 
    submitPrompt, 
    isLoading, 
    isFileProcessing, 
    setIsFileProcessing, 
    input, 
    handleInputChange, 
    setFileContent
  } = useAppContext();
  
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isComposing, setIsComposing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const file = e.target.files[0];
      if (!file) return;

      setAttachments([]);
      setFileContent('');
      setIsFileProcessing(true);

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

        const newAttachment: Attachment = {
            name: file.name,
            type: file.type,
            gcsUri: gcsUri,
            previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : '',
        };
        setAttachments([newAttachment]);

        const extractResponse = await fetch('/api/extract-text', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gcsUri, contentType: file.type }),
        });
        if (!extractResponse.ok) {
            const errorData = await extractResponse.json();
            throw new Error(errorData.error || 'Failed to extract text.');
        }
        const { text } = await extractResponse.json();
        setFileContent(text);

      } catch (error) {
        console.error('File processing error:', error);
        setFileContent(`Error processing file: ${error instanceof Error ? error.message : 'Unknown error'}`);
      } finally {
        setIsFileProcessing(false);
      }
    }
  };

  const handleRemoveAttachment = () => {
    const attachmentToRemove = attachments[0];
    if (attachmentToRemove?.previewUrl) {
      URL.revokeObjectURL(attachmentToRemove.previewUrl);
    }
    setAttachments([]);
    setFileContent('');
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const totalLoading = isLoading || isFileProcessing;
    if ((!input.trim() && attachments.length === 0) || totalLoading) return;
    
    submitPrompt(input);

    if (attachments[0]?.previewUrl) {
        URL.revokeObjectURL(attachments[0].previewUrl);
    }
    setAttachments([]);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (isComposing) {
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault(); // Prevent new line on Enter
      const form = e.currentTarget.form;
      if (form) {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      }
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 bg-gray-800 border-t border-gray-700">
      {attachments.length > 0 && (
        <div className="p-2 mb-2 bg-gray-700 rounded-lg text-sm text-white">
          {attachments.map(file => (
            <div key={file.name} className="flex items-center justify-between">
              <span>{file.name}</span>
              <button type="button" onClick={handleRemoveAttachment} className="text-gray-400 hover:text-white">
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="relative flex items-start">
        <button 
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="p-2 mt-2 rounded-full hover:bg-gray-700 text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={isLoading || isFileProcessing}
        >
          <Paperclip size={20} />
        </button>
        <input 
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
          accept="image/png,image/jpeg,image/gif,image/webp,text/plain,application/json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        />
        <Textarea
          value={input}
          onChange={handleInputChange}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={() => setIsComposing(false)}
          onKeyDown={handleKeyDown}
          placeholder="Message a model, or add a file..."
          className="flex-grow p-2 pr-16 rounded-lg bg-gray-700 text-white resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          minRows={2}
          maxRows={20}
          disabled={isLoading || isFileProcessing}
        />
        <button 
          type="submit"
          className="absolute right-3 bottom-3 p-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-500 text-white font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          disabled={(!input.trim() && attachments.length === 0) || isLoading || isFileProcessing}
        >
          <Send size={20} />
        </button>
      </div>
    </form>
  );
};

export default ChatInput;
