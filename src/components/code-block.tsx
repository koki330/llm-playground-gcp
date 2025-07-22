'use client';

import { useEffect, useState, memo } from 'react';
import { codeToHtml } from 'shiki';

interface CodeBlockProps {
  className?: string;
  children: React.ReactNode;
}

const CodeBlock = memo(({ className, children }: CodeBlockProps) => {
  const [highlightedCode, setHighlightedCode] = useState('');
  const lang = className?.replace(/language-/, '') || 'text';
  const codeString = String(children).replace(/\n$/, '');

  useEffect(() => {
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
        // In case of error, fallback to plain text (already safe)
        setHighlightedCode(`<pre><code>${codeString}</code></pre>`);
      }
    };

    highlightAndSanitize();
  }, [codeString, lang]);

  // Use a key to force re-render when highlightedCode changes
  return <div key={highlightedCode} dangerouslySetInnerHTML={{ __html: highlightedCode }} />;
});

CodeBlock.displayName = 'CodeBlock';

export default CodeBlock;
