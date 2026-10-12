import React, { useEffect, useRef, useState } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const ChatbotButton: React.FC = () => {
  const { setIsAiAssistantOpen, isQuickActionOpen } = useApp();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [whatsappUrl, setWhatsappUrl] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      document.removeEventListener('pointerdown', closeOnOutsideClick);
    };
  }, [open]);

  const showChannels = async () => {
    setOpen(true);
    setLoading(true);
    setWhatsappUrl(null);
    setStatus('');
    try {
      const response = await fetch('/api/whatsapp/me', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) {
        setStatus(typeof data.error === 'string' ? data.error : 'Status chatbot tidak dapat diperiksa.');
      } else if (data.provider === 'fonnte' && data.available === true &&
        data.botNumberVerified === true && typeof data.botNumber === 'string' &&
        /^[1-9]\d{7,14}$/.test(data.botNumber)) {
        setWhatsappUrl(`https://wa.me/${data.botNumber}`);
        setStatus(data.linked === true
          ? 'Akses data mengikuti akun WhatsApp tertaut dan izin Anda.'
          : 'Tautkan akun melalui Integrasi WhatsApp di profil sebelum meminta data pribadi.');
      } else {
        setStatus('Chatbot WhatsApp belum siap: konfigurasi atau verifikasi nomor bot belum lengkap. Tidak ada pesan yang dikirim.');
      }
    } catch {
      setStatus('Status chatbot tidak dapat diperiksa. Periksa koneksi lalu coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  if (isQuickActionOpen) return null;

  return (
    <div ref={containerRef} className="no-print fixed right-4 bottom-52 sm:right-6 sm:bottom-40 z-30 flex flex-col items-end">
      {open && (
        <section aria-label="Pilihan AI Chatbot" className="mb-3 w-72 max-w-[calc(100vw-2rem)] max-h-[calc(100dvh-16rem)] sm:max-h-[calc(100dvh-14rem)] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-xl">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">AI Chatbot</h2>
            <button type="button" onClick={() => setOpen(false)} aria-label="Tutup pilihan chatbot" className="p-2 text-slate-300 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
          <p role="status" className="my-3 text-xs text-slate-300">{loading ? 'Memeriksa konfigurasi chatbot...' : status}</p>
          {whatsappUrl && (
            <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="mb-2 block rounded-lg bg-emerald-700 px-3 py-2 text-sm text-white">
              Buka WhatsApp Fonnte
            </a>
          )}
          <button type="button" onClick={() => { setOpen(false); setIsAiAssistantOpen(true); }} className="w-full rounded-lg bg-blue-700 px-3 py-2 text-left text-sm text-white">
            Tanya AI di aplikasi
          </button>
          <p className="mt-2 text-xs text-slate-400">Chat web memakai backend BMN-Minut, bukan widget Fonnte.</p>
        </section>
      )}
      <button type="button" onClick={() => { if (open) setOpen(false); else void showChannels(); }} aria-expanded={open}
        className="flex items-center gap-2 rounded-full border border-cyan-500/40 bg-slate-900 px-3 py-2 text-xs font-semibold text-cyan-200 shadow-lg hover:bg-slate-800 focus:ring-2 focus:ring-cyan-500">
        <MessageCircle className="h-4 w-4" /> AI Chatbot
      </button>
    </div>
  );
};
