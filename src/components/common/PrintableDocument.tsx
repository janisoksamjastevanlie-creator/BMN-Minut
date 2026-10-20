import React from 'react';
import { OfficialLetterhead } from './OfficialLetterhead';

// Pembungkus dokumen resmi yang dicetak. Kop diposisikan tetap sehingga tampil di setiap
// halaman; baris <thead> kosong di bawahnya diulang browser pada awal tiap halaman cetak dan
// memesan ruang setinggi kop, sehingga isi dokumen tidak pernah tertimpa kop. Di layar,
// struktur tabel ini dirender sebagai blok biasa (lihat index.css).
export const PrintableDocument: React.FC<{
  children: React.ReactNode;
  /** Kelas untuk sel isi, mis. "space-y-6", agar jarak antar bagian tetap seperti di layar. */
  className?: string;
}> = ({ children, className }) => (
  <>
    <OfficialLetterhead />
    <table className="official-print-document">
      <thead>
        <tr>
          <td>
            <div className="official-print-document-spacer" aria-hidden="true" />
          </td>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td className={`official-print-document-body${className ? ` ${className}` : ''}`}>{children}</td>
        </tr>
      </tbody>
    </table>
  </>
);
