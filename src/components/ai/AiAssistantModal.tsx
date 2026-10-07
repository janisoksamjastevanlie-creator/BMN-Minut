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
    setIsAiAssistantOpen,
    assets,
    inventoryItems,
    stockInList,
    stockOutList,
    rooms
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

  if (!isAiAssistantOpen) return null;

  // Smart grounded query solver using live app database
  const answerQueryWithDatabase = (q: string): string => {
    const lower = q.toLowerCase();

    // 1. Total aset BMN
    if (lower.includes('total aset') || lower.includes('jumlah aset')) {
      const total = assets.length;
      const baik = assets.filter(a => a.kondisi === 'Baik').length;
      const rRingan = assets.filter(a => a.kondisi === 'Rusak Ringan').length;
      const rBerat = assets.filter(a => a.kondisi === 'Rusak Berat').length;
      return `Total aset BMN yang tercatat di BPS Kabupaten Minahasa Utara saat ini berjumlah **${total} unit**.\n\nRincian kondisi:\n- **Baik:** ${baik} unit (${((baik/total)*100).toFixed(1)}%)\n- **Rusak Ringan:** ${rRingan} unit\n- **Rusak Berat:** ${rBerat} unit.`;
    }

    // 2. Nilai aset BMN
    if (lower.includes('nilai aset') || lower.includes('total nilai bmn') || lower.includes('nilai perolehan')) {
      const totalPerolehan = assets.reduce((sum, a) => sum + a.nilaiPerolehan, 0);
      const totalNilaiBuku = assets.reduce((sum, a) => sum + a.nilaiBuku, 0);
      const totalPenyusutan = assets.reduce((sum, a) => sum + a.akumulasiPenyusutan, 0);
      return `Total nilai perolehan BMN BPS Kabupaten Minahasa Utara adalah **Rp ${totalPerolehan.toLocaleString('id-ID')}**.\n\n- Akumulasi Penyusutan: Rp ${totalPenyusutan.toLocaleString('id-ID')}\n- **Nilai Buku Saat Ini:** Rp ${totalNilaiBuku.toLocaleString('id-ID')}.`;
    }

    // 3. Laptop
    if (lower.includes('laptop') || lower.includes('komputer jinjing')) {
      const laptops = assets.filter(a => a.namaBarang.toLowerCase().includes('laptop'));
      const baik = laptops.filter(a => a.kondisi === 'Baik').length;
      const rusak = laptops.filter(a => a.kondisi !== 'Baik').length;
      return `Terdapat **${laptops.length} unit laptop** terdaftar (ASUS ExpertBook, Lenovo ThinkPad, Dell Latitude).\n- Kondisi Baik: ${baik} unit\n- Perlu perhatian/servis: ${rusak} unit.`;
    }

    // 4. Rusak berat
    if (lower.includes('rusak berat')) {
      const rusakBerat = assets.filter(a => a.kondisi === 'Rusak Berat');
      const sample = rusakBerat.slice(0, 4).map(a => `- **${a.namaBarang}** (NUP ${a.nup}) di ${a.ruanganNama}`).join('\n');
      return `Terdapat **${rusakBerat.length} aset berstatus Rusak Berat** yang direkomendasikan untuk diusulkan penghapusan atau perbaikan besar:\n${sample}\n\nSemua dapat dilihat pada menu Aset BMN > Penghapusan.`;
    }

    // 5. Stok kertas A4
    if (lower.includes('kertas a4') || lower.includes('stok kertas')) {
      const kertas = inventoryItems.filter(i => i.nama.toLowerCase().includes('kertas') && i.nama.toLowerCase().includes('a4'));
      if (kertas.length > 0) {
        const item = kertas[0];
        return `Stok **${item.nama}** saat ini adalah **${item.stokSaatIni} ${item.satuan}** di **${item.rak} (${item.binCode})**.\nBatas minimum stok: ${item.stokMinimum} ${item.satuan}. Status: **${item.status}**.`;
      }
      return `Stok Kertas HVS A4 saat ini berada di Rak A. Cek modul Master Persediaan untuk rincian real-time.`;
    }

    // 6. Hampir habis / stok minimum
    if (lower.includes('hampir habis') || lower.includes('menipis') || lower.includes('habis')) {
      const lowItems = inventoryItems.filter(i => i.status === 'Menipis' || i.status === 'Habis');
      const samples = lowItems.slice(0, 5).map(i => `- **${i.nama}**: Sisa ${i.stokSaatIni} ${i.satuan} (Min: ${i.stokMinimum}) [${i.status.toUpperCase()}]`).join('\n');
      return `Ada **${lowItems.length} item persediaan** yang menipis atau habis di gudang:\n${samples}\n\nDisarankan segera mengajukan pengadaan barang melalui menu Rekomendasi Pengadaan.`;
    }

    // 7. Penggunaan ATK / Barang keluar
    if (lower.includes('atk yang keluar') || lower.includes('barang keluar') || lower.includes('penggunaan')) {
      const atkOut = stockOutList.filter(s => s.jenis === 'ATK');
      const totalQty = atkOut.reduce((sum, s) => sum + s.jumlah, 0);
      return `Tercatat **${atkOut.length} transaksi pengeluaran ATK** dengan total **${totalQty} item** disalurkan ke berbagai fungsi (Tata Usaha, Sosial, Produksi, Distribusi, Neraca, IPDS).`;
    }

    // 8. Ruangan paling banyak aset
    if (lower.includes('ruangan') || lower.includes('paling banyak')) {
      const roomCounts = rooms.map(r => ({
        name: r.name,
        count: assets.filter(a => a.ruanganId === r.id).length
      })).sort((a, b) => b.count - a.count);
      
      const top = roomCounts[0];
      return `Ruangan dengan jumlah aset terbanyak adalah **${top.name}** dengan total **${top.count} unit aset BMN**, disusul oleh **${roomCounts[1]?.name}** (${roomCounts[1]?.count} unit).`;
    }

    // Default intelligent response
    return `Berdasarkan database SIMAN-BMN per hari ini:\n- Total BMN: **${assets.length} unit** (Nilai Buku: Rp ${assets.reduce((sum, a) => sum + a.nilaiBuku, 0).toLocaleString('id-ID')})\n- Jenis Persediaan: **${inventoryItems.length} item** (ATK & ARK)\n- Transaksi Barang Keluar: **${stockOutList.length} kali**\n\nSilakan ajukan pertanyaan spesifik seperti "Berapa stok kertas A4?" atau "Ruangan mana yang asetnya paling banyak?".`;
  };

  const handleSendMessage = () => {
    if (!inputQuery.trim()) return;

    const userText = inputQuery;
    setInputQuery('');

    const newMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      text: userText,
      timestamp: 'Baru saja'
    };

    setMessages(prev => [...prev, newMsg]);
    setIsTyping(true);

    setTimeout(() => {
      const reply = answerQueryWithDatabase(userText);
      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: reply,
        timestamp: 'Baru saja'
      };
      setMessages(prev => [...prev, aiMsg]);
      setIsTyping(false);
    }, 600);
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
              <p className="text-[11px] text-slate-400">Terhubung langsung ke database BPS Minahasa Utara</p>
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
              <span>Menghubungi database & menganalisis data...</span>
            </div>
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
