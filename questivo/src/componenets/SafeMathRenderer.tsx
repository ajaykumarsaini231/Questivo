import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { preprocessMath } from '../lib/mathUtils';
// import SafeMathRenderer from "./SafeMathRenderer";
// Import essential styling structures natively for mathematical symbol scaling
import 'katex/dist/katex.min.css';

interface SafeMathRendererProps {
  text: string;
}

export const SafeMathRenderer: React.FC<SafeMathRendererProps> = ({ text }) => {
  const processedContent = useMemo(() => {
    return preprocessMath(text);
  }, [text]);

  return (
    <div className="math-renderer-context prose max-w-none dark:prose-invert">
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[[rehypeKatex, { 
          throwOnError: false,
          strict: false,
          output: 'htmlAndMathml'
        }]]}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
};

export default SafeMathRenderer;