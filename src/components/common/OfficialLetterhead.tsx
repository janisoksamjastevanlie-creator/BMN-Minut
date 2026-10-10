import React from 'react';

export const OfficialLetterhead: React.FC = () => (
  <header className="official-letterhead" aria-label="Kop surat Badan Pusat Statistik Kabupaten Minahasa Utara">
    <img src="/bps-minut-logo.png" alt="Logo BPS" />
    <div className="official-letterhead-copy">
      <div className="official-letterhead-title">BADAN PUSAT STATISTIK</div>
      <div className="official-letterhead-subtitle">KABUPATEN MINAHASA UTARA</div>
      <div className="official-letterhead-address">
        Kompleks Perkantoran Pemerintah Kabupaten Minahasa Utara, Airmadidi-95371,
      </div>
      <div className="official-letterhead-contact">
        Telp : (0431) 89150 Homepage: https://minut.bps.go.id/ E-mail: bps7106@bps.go.id
      </div>
    </div>
  </header>
);
