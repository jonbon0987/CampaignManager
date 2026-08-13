/**
 * CanvasLoading — a centered spinner + label for the main canvas while a view's
 * data is still being fetched. Shared by the world view (world entities) and the
 * campaign view (campaign data) so the "still loading" state reads the same way
 * in both. Styles: .cm-loading in src/index.css.
 */
export default function CanvasLoading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="cm-loading" role="status" aria-live="polite">
      <span className="cm-loading-spinner" aria-hidden="true" />
      <span className="cm-loading-label">{label}</span>
    </div>
  );
}
