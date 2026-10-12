import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Sparkles, X, Send, Bot, User, CornerDownLeft, RefreshCw } from 'lucide-react';

interface ChatMessage {
  id: string;
  sender: 'ai' | 'user';
  text: string;
  timestamp: string;
}

export const AiAssistantModal: React.FC = () => {
  const {
    isAiAssistantOpen,
    setIsAiAssistantOpen
  } = useApp();

  const [inputQuery, setInputQuery] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'm-1',
      sender: 'ai',
      text: 'Halo! Saya BMN & Inventory Assistant BPS Kabupaten Minahasa Utara. Ada yang bisa saya bantu terkait data aset, kondisi fisik, stok persediaan ATK/ARK, atau transaksi gudang?',
      timestamp: 'Baru saja'
    }
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const [failedQuery, setFailedQuery] = useState<string | null>(null);

  if (!isAiAssistantOpen) return null;

  const sendToAi = async (userText: string, history: ChatMessage[]) => {
    setIsTyping(true);
    setFailedQuery(null);
    const conversation = history
      .filter(m => m.id !== 'm-1')
      .map(m => ({ role: m.sender === 'user' ? 'user' : 'assistant', content: m.text }));

    const pushAi = (text: string) => setMessages(prev => [
      ...prev,
      { id: `ai-${Date.now()}`, sender: 'ai', text, timestamp: 'Baru saja' }
    ]);

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: conversation })
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok && typeof body.reply === 'string' && body.reply.trim()) {
        pushAi(body.reply);
      } else {
        pushAi(`⚠️ ${body.error || 'Terjadi kesalahan saat memproses pertanyaan.'}`);
        setFailedQuery(userText);
      }
    } catch {
      pushAi('⚠️ Tidak dapat terhubung ke server. Periksa koneksi internet lalu coba lagi.');
      setFailedQuery(userText);
    } finally {
      setIsTyping(false);
    }
  };

  const handleSendMessage = () => {
    if (!inputQuery.trim() || isTyping) return;

    const userText = inputQuery.trim();
    setInputQuery('');

    const newMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      text: userText,
      timestamp: 'Baru saja'
    };

    setMessages(prev => [...prev, newMsg]);
    void sendToAi(userText, [...messages, newMsg]);
  };

  const handleRetry = () => {
    if (!failedQuery || isTyping) return;
    void sendToAi(failedQuery, messages.filter(m => !m.text.startsWith('⚠️')));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[580px]">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 bg-slate-900/90 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 text-white flex items-center justify-center shadow-md shadow-cyan-500/20">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                <span>BMN & Inventory Assistant</span>
                <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                  AI Grounded
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">Data dari backend sesuai izin akun</p>
            </div>
          </div>
          <button
            onClick={() => setIsAiAssistantOpen(false)}
            className="text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Chat History */}
        <div className="flex-1 p-4 overflow-y-auto space-y-3">
          {messages.map(msg => (
            <div
              key={msg.id}
              className={`flex gap-2.5 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.sender === 'ai' && (
                <div className="w-7 h-7 rounded-lg bg-blue-600/30 text-blue-400 flex items-center justify-center shrink-0 mt-1">
                  <Bot className="w-4 h-4" />
                </div>
              )}

              <div
                className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                  msg.sender === 'user'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-slate-950 border border-slate-800 text-slate-200 shadow-inner'
                }`}
              >
                <div className="whitespace-pre-wrap">{msg.text}</div>
                <div
                  className={`text-[9px] mt-1 text-right ${
                    msg.sender === 'user' ? 'text-blue-200' : 'text-slate-400'
                  }`}
                >
                  {msg.timestamp}
                </div>
              </div>

              {msg.sender === 'user' && (
                <div className="w-7 h-7 rounded-lg bg-slate-800 text-slate-300 flex items-center justify-center shrink-0 mt-1">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          ))}

          {isTyping && (
            <div className="flex items-center gap-2 text-xs text-slate-400 italic">
              <Bot className="w-4 h-4 text-cyan-400 animate-spin" />
              <span>Menganalisis data dan menyusun jawaban...</span>
            </div>
          )}
          {failedQuery && !isTyping && (
            <button
              onClick={handleRetry}
              className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Coba Lagi</span>
            </button>
          )}
        </div>

        {/* Sample Prompt Chips */}
        <div className="p-2 border-t border-slate-800/80 bg-slate-950/60 overflow-x-auto flex gap-1.5 no-scrollbar text-[11px]">
          <button
            onClick={() => {
              setInputQuery('Berapa total aset BMN?');
            }}
            className="px-2.5 py-1 rounded-lg bg-slate-800/70 hover:bg-slate-700 text-slate-300 whitespace-nowrap"
          >
            📊 Total Aset BMN
          </button>
          <button
            onClick={() => {
              setInputQuery('Berapa stok kertas A4?');
            }}
            className="px-2.5 py-1 rounded-lg bg-slate-800/70 hover:bg-slate-700 text-slate-300 whitespace-nowrap"
          >
            📄 Stok Kertas A4
          </button>
          <button
            onClick={() => {
              setInputQuery('Aset apa saja yang rusak berat?');
            }}
            className="px-2.5 py-1 rounded-lg bg-slate-800/70 hover:bg-slate-700 text-slate-300 whitespace-nowrap"
          >
            ⚠️ Aset Rusak Berat
          </button>
          <button
            onClick={() => {
              setInputQuery('Ruangan mana yang memiliki aset paling banyak?');
            }}
            className="px-2.5 py-1 rounded-lg bg-slate-800/70 hover:bg-slate-700 text-slate-300 whitespace-nowrap"
          >
            🏢 Ruangan Terbanyak Aset
          </button>
        </div>

        {/* Input Bar */}
        <div className="p-3 border-t border-slate-800 bg-slate-900 flex items-center gap-2">
          <input
            type="text"
            value={inputQuery}
            onChange={e => setInputQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
            placeholder="Tanyakan data aset BMN atau stok persediaan..."
            className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={handleSendMessage}
            className="p-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
