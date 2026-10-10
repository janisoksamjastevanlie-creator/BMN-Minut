/**
 * Utility helper to ensure clean printing across all browsers and modals.
 * Sets temporary CSS hooks on document.body to isolate the printable target,
 * preventing dark overlays, scroll clipping, and background page leakages.
 */
export const triggerPrint = (options?: {
  title?: string;
  orientation?: 'portrait' | 'landscape' | 'label';
  onComplete?: () => void;
}) => {
  const originalTitle = document.title;
  const pageClass = options?.orientation
    ? `printing-page-${options.orientation}`
    : null;
  if (options?.title) {
    document.title = options.title;
  }

  document.body.classList.add('printing-active');
  if (pageClass) {
    document.body.classList.add(pageClass);
  }

  const cleanup = () => {
    document.body.classList.remove('printing-active');
    if (pageClass) {
      document.body.classList.remove(pageClass);
    }
    if (options?.title) {
      document.title = originalTitle;
    }
    window.removeEventListener('afterprint', cleanup);
    options?.onComplete?.();
  };

  window.addEventListener('afterprint', cleanup);

  // Short delay to ensure DOM and print styles are applied
  setTimeout(() => {
    window.print();
    // Safety fallback in case afterprint does not fire
    setTimeout(cleanup, 2000);
  }, 100);
};
