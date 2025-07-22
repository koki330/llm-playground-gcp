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
    const highlight = async () => {
      try {
        const html = await codeToHtml(codeString, {
          lang,
          theme: 'github-dark'
        });
        setHighlightedCode(html);
      } catch (error) {
        console.error('Error highlighting code:', error);
        // In case of error, fallback to plain text
        setHighlightedCode(`<pre><code>${codeString}</code></pre>`);
      }
    };
    highlight();
  }, [codeString, lang]);

  // Use a key to force re-render when highlightedCode changes
  const DOMPurify = require('dompurify');
  return <div key={highlightedCode} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(highlightedCode) }} />;
});

CodeBlock.displayName = 'CodeBlock';

export default CodeBlock;