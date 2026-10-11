import React, { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';

const SHOW_AFTER_PX = 400;

// Area scroll bisa berupa <main> atau window, tergantung tinggi konten; keduanya dipantau.
export const BackToTopButton: React.FC<{
  containerRef: React.RefObject<HTMLElement | null>;
}> = ({ containerRef }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    const update = () => {
      const containerTop = container ? container.scrollTop : 0;
      setVisible(containerTop > SHOW_AFTER_PX || window.scrollY > SHOW_AFTER_PX);
    };
    update();
    container?.addEventListener('scroll', update, { passive: true });
    window.addEventListener('scroll', update, { passive: true });
    return () => {
      container?.removeEventListener('scroll', update);
      window.removeEventListener('scroll', update);
    };
  }, [containerRef]);

  if (!visible) return null;

  const scrollToTop = () => {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const behavior: ScrollBehavior = reduceMotion ? 'auto' : 'smooth';
    const container = containerRef.current;
    if (container && container.scrollTop > 0) container.scrollTo({ top: 0, behavior });
    if (window.scrollY > 0) window.scrollTo({ top: 0, behavior });
  };

  return (
    <button
      type="button"
      onClick={scrollToTop}
      aria-label="Kembali ke Atas"
      title="Kembali ke Atas"
      className="no-print fixed z-30 bottom-40 right-4 sm:bottom-24 sm:right-6 w-10 h-10 rounded-full bg-slate-800/95 hover:bg-slate-700 border border-slate-600 text-slate-100 shadow-lg flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      <ArrowUp className="w-5 h-5" />
    </button>
  );
};
