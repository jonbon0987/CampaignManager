import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { CSSProperties, ReactNode } from 'react';
import { ENTITY_LINK_RE, EntityChip } from './StatBlockText';
import type { EntityType } from './StatBlockText';

/**
 * Renders markdown content with support for [[type:uuid]] inline entity links.
 * Supported types: creature, npc, location, session, faction, hook.
 */
interface MarkdownContentProps {
  text: string | null | undefined;
  style?: CSSProperties;
  className?: string;
}

export function MarkdownContent({ text, style, className }: MarkdownContentProps) {
  if (!text) return null;

  // Check if there are any entity links
  const hasEntityLinks = ENTITY_LINK_RE.test(text);
  ENTITY_LINK_RE.lastIndex = 0;

  if (!hasEntityLinks) {
    return (
      <div className={`markdown-preview ${className ?? ''}`} style={style}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
      </div>
    );
  }

  // Split into segments: text (to render as markdown) and entity links
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  ENTITY_LINK_RE.lastIndex = 0;
  while ((match = ENTITY_LINK_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const mdChunk = text.slice(lastIndex, match.index);
      parts.push(
        <ReactMarkdown key={key++} remarkPlugins={[remarkGfm]}>{mdChunk}</ReactMarkdown>
      );
    }
    parts.push(
      <EntityChip
        key={key++}
        entityType={match[1] as EntityType}
        id={match[2]}
        displayName={match[3] ?? ''}
      />
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(
      <ReactMarkdown key={key++} remarkPlugins={[remarkGfm]}>
        {text.slice(lastIndex)}
      </ReactMarkdown>
    );
  }

  return (
    <div className={`markdown-preview ${className ?? ''}`} style={style}>
      {parts}
    </div>
  );
}
