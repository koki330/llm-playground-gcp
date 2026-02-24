'use client';

import { useState, useRef, FormEvent, KeyboardEvent } from 'react';
import { useAppContext, Attachment } from '@/context/AppContext';
import { Paperclip, X, Send, Square } from 'lucide-react';
import Textarea from 'react-textarea-autosize';

const ChatInput = () => {
  const {
    submitPrompt,
    isLoading,
    isFileProcessing,
    setIsFileProcessing,
    input,
    handleInputChange,
    setFileContents,
    setImageUris,
    setPdfUris,
    fileContents,
    imageUris,
    pdfUris,
    stopGeneration,
    setError,
  } = useAppContext();

  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isComposing, setIsComposing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;

    const files = Array.from(e.target.files);
    
    // Keep existing attachments and add new ones
    setIsFileProcessing(true);

    const newAttachments: Attachment[] = [...attachments]; // Keep existing UI attachments
    const newImageUris: string[] = [...imageUris]; // Keep existing image URIs from AppContext
    const newPdfUris: string[] = [...pdfUris]; // Keep existing PDF URIs from AppContext
    const newFileContents: Array<{ name: string; content: string }> = [...fileContents]; // Keep existing file contents from AppContext

    try {
      for (const file of files) {
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
        newAttachments.push(newAttachment);

        if (file.type.startsWith('image/')) {
          newImageUris.push(gcsUri);
        } else if (file.type === 'application/pdf') {
          // PDF files are handled natively by models — just store the GCS URI
          newPdfUris.push(gcsUri);
        } else {
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
          newFileContents.push({ name: file.name, content: text });
        }
      }

      setAttachments(newAttachments);
      setImageUris(newImageUris);
      setPdfUris(newPdfUris);
      setFileContents(newFileContents);
      setIsFileProcessing(false);
    } catch (error) {
      console.error('File processing error:', error);
      const errorMessage = error instanceof Error ? error.message : 'ファイルの処理中にエラーが発生しました。';
      setError(errorMessage);
      setIsFileProcessing(false);
    } finally {
      if (e.target) {
        e.target.value = '';
      }
    }
  };

  const handleRemoveAttachment = (index: number) => {
    const attachmentToRemove = attachments[index];
    
    // Revoke object URL for images
    if (attachmentToRemove?.previewUrl) {
      URL.revokeObjectURL(attachmentToRemove.previewUrl);
    }
    
    // Update local attachments
    const updatedAttachments = attachments.filter((_, i) => i !== index);
    setAttachments(updatedAttachments);
    
    // Update AppContext state
    if (attachmentToRemove.type.startsWith('image/')) {
      const updatedImageUris = imageUris.filter(uri => uri !== attachmentToRemove.gcsUri);
      setImageUris(updatedImageUris);
    } else if (attachmentToRemove.type === 'application/pdf') {
      const updatedPdfUris = pdfUris.filter(uri => uri !== attachmentToRemove.gcsUri);
      setPdfUris(updatedPdfUris);
    } else {
      const updatedFileContents = fileContents.filter(fc => fc.name !== attachmentToRemove.name);
      setFileContents(updatedFileContents);
    }
    
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const totalLoading = isLoading || isFileProcessing;
    if ((!input.trim() && attachments.length === 0) || totalLoading) return;

    const previewUrls = attachments.map(att => att.previewUrl).filter(url => url !== '');
    const pdfFileNames = attachments.filter(att => att.type === 'application/pdf').map(att => att.name);
    const docFileNames = attachments
      .filter(att => !att.type.startsWith('image/') && att.type !== 'application/pdf')
      .map(att => att.name);
    submitPrompt(input, previewUrls, pdfFileNames, docFileNames);

    // Clear the local attachment state in the input component.
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
    <form onSubmit={handleSubmit} className="p-4 bg-gray-50 border-t border-gray-200">
      {attachments.length > 0 && (
        <div className="p-2 mb-2 bg-gray-100 rounded-lg text-sm text-gray-800 space-y-1">
          {attachments.map((file, index) => (
            <div key={`${file.name}-${index}`} className="flex items-center justify-between py-1">
              <span className="truncate flex-1">{file.name}</span>
              <button 
                type="button" 
                onClick={() => handleRemoveAttachment(index)} 
                className="ml-2 text-gray-400 hover:text-gray-600"
              >
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
          className="p-2 mt-2 rounded-full hover:bg-gray-200 text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#A61C4B]"
          disabled={isLoading || isFileProcessing}
        >
          <Paperclip size={20} />
        </button>
        <input 
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
          multiple
          accept="image/png,image/jpeg,image/gif,image/webp,text/plain,application/json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        />
        <Textarea
          value={input}
          onChange={handleInputChange}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={() => setIsComposing(false)}
          onKeyDown={handleKeyDown}
          placeholder="Message a model, or add a file..."
          className="flex-grow p-2 pr-16 rounded-lg bg-white border border-gray-300 text-black resize-none focus:outline-none focus:ring-2 focus:ring-[#A61C4B] disabled:opacity-50"
          minRows={2}
          maxRows={20}
          disabled={isLoading || isFileProcessing}
        />
        {isLoading ? (
          <button 
            type="button"
            onClick={stopGeneration}
            title="回答停止"
            className="absolute right-3 bottom-3 p-2 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold focus:outline-none focus:ring-2 focus:ring-gray-400"
          >
            <Square size={20} />
          </button>
        ) : (
          <button 
            type="submit"
            className="absolute right-3 bottom-3 p-2 rounded-lg bg-[#A61C4B] hover:bg-[#85163c] disabled:bg-gray-300 text-white font-semibold focus:outline-none focus:ring-2 focus:ring-[#A61C4B] disabled:opacity-50"
            disabled={(!input.trim() && attachments.length === 0) || isFileProcessing}
          >
            <Send size={20} />
          </button>
        )}
      </div>
    </form>
  );
};

export default ChatInput;
