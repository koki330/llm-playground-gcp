'use client';

import { useEffect, useState, memo } from 'react';
import { codeToHtml } from 'shiki';

interface CodeBlockProps {
  className?: string;
  children: React.ReactNode;
  isLoading: boolean;
}

const CodeBlock = memo(({ className, children, isLoading }: CodeBlockProps) => {
  const [highlightedCode, setHighlightedCode] = useState('');
  const lang = className?.replace(/language-/, '') || 'text';
  const codeString = String(children).replace(/\n$/, '');

  useEffect(() => {
    // Only perform highlighting when the stream is complete.
    if (!isLoading) {
      const highlightAndSanitize = async () => {
        try {
          // Step 1: Highlight code with shiki
          const html = await codeToHtml(codeString, {
            lang,
            theme: 'github-dark'
          });

          // Step 2: Dynamically import DOMPurify and sanitize the HTML
          const DOMPurify = (await import('dompurify')).default;
          const sanitizedHtml = DOMPurify.sanitize(html);

          setHighlightedCode(sanitizedHtml);

        } catch (error) {
          console.error('Error highlighting or sanitizing code:', error);
          // In case of error, fallback to a simple pre/code block
          // Note: We create a basic HTML structure here for consistency
          const pre = `<pre class="shiki github-dark" style="background-color:#0d1117;color:#c9d1d9"><code>${codeString.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`;
          setHighlightedCode(pre);
        }
      };

      highlightAndSanitize();
    }
  }, [codeString, lang, isLoading]);

  // While streaming (isLoading is true), display a plain, un-highlighted block.
  // This is fast and prevents flickering.
  if (isLoading) {
    return (
      <pre>
        <code className={className}>{children}</code>
      </pre>
    );
  }

  // After streaming, if highlighted code is ready, render it.
  // Otherwise, you might want a placeholder, but for now, an empty div is fine
  // as it will be quickly populated.
  return <div dangerouslySetInnerHTML={{ __html: highlightedCode }} />;
});

CodeBlock.displayName = 'CodeBlock';

export default CodeBlock;