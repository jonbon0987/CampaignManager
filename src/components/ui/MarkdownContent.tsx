import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { CSSProperties, ReactNode } from 'react';
import { EntityChip } from './StatBlockText';
import { parseSegments, hasRefs } from '../../lib/slashMarkdown';

/**
 * Renders markdown content with inline entity references.
 * Supports the canonical @[Label](kind:id) format and the legacy
 * [[kind:uuid:Name]] format (parsed for back-compat).
 */
interface MarkdownContentProps {
  text?: string | null | undefined;
  content?: string | null | undefined;
  style?: CSSProperties;
  className?: string;
}

export function MarkdownContent({ text, content, style, className }: MarkdownContentProps) {
  const resolved = text ?? content;
  if (!resolved) return null;

  if (!hasRefs(resolved)) {
    return (
      <div className={`markdown-preview ${className ?? ''}`} style={style}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{resolved}</ReactMarkdown>
      </div>
    );
  }

  const parts: ReactNode[] = [];
  let key = 0;
  for (const seg of parseSegments(resolved)) {
    if (seg.type === 'text') {
      if (seg.value) parts.push(<ReactMarkdown key={key++} remarkPlugins={[remarkGfm]}>{seg.value}</ReactMarkdown>);
    } else {
      parts.push(<EntityChip key={key++} entityType={seg.entityType} id={seg.id} displayName={seg.displayName} />);
    }
  }

  return (
    <div className={`markdown-preview ${className ?? ''}`} style={style}>
      {parts}
    </div>
  );
}
