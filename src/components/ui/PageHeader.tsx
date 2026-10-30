import type { ReactNode } from 'react';

/**
 * The one page header: a count or status line, the page's name, and its
 * actions on the right. The same header heads a list beside a detail
 * (ListDetail) and a full-width page (Threads, Stat sheets).
 */
export function PageHeader({ eyebrow, title, children, className = '' }: {
  eyebrow?: ReactNode;
  title: string;
  /** Actions: search, "+ Add <Noun>", import, generate. */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`cm-page-head ${className}`.trim()}>
      <div className="cm-page-head-text">
        {eyebrow != null && <div className="cm-md-eyebrow">{eyebrow}</div>}
        <h2 className="cm-md-title">{title}</h2>
      </div>
      {children && <div className="cm-page-head-actions">{children}</div>}
    </div>
  );
}
