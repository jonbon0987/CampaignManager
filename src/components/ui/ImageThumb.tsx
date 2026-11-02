import { useImageUrl } from '../../hooks/useImageUrl';

/** A record's picture, small, for a list row; its glyph until there is one. */
export function ImageThumb({ path, glyph }: { path: string | null | undefined; glyph?: string }) {
  const url = useImageUrl(path);
  if (!url) return glyph ? <span className="cm-row-glyph">{glyph}</span> : null;
  return <img className="cm-row-thumb" src={url} alt="" />;
}
