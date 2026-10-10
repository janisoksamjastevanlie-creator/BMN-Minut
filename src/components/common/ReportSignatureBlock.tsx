import React from 'react';
import { useApp } from '../../context/AppContext';
import { resolveReportSigner, type ReportSignerDefinition } from '../../utils/reportSignatures.mjs';

export const ReportSignatureBlock: React.FC<{
  signers: ReportSignerDefinition[];
  printOnly?: boolean;
}> = ({ signers, printOnly = false }) => {
  const { users } = useApp();

  return (
    <div
      className={`report-signatures${printOnly ? ' report-signatures-print-only' : ''}`}
      style={{ gridTemplateColumns: `repeat(${signers.length}, minmax(0, 1fr))` }}
    >
      {signers.map((signer, index) => {
        const resolved = resolveReportSigner(signer, users);

        return (
          <section className="report-signature" key={`${signer.heading}-${index}`}>
            <div className="report-signature-heading">{signer.heading}</div>
            <div className="report-signature-space" aria-hidden="true" />
            <div className="report-signature-name">
              {resolved.name || resolved.message || signer.emptyMessage || 'Identitas tidak tersedia.'}
            </div>
            {resolved.name && (
              <div className="report-signature-nip">
                NIP: {resolved.nip || 'tidak tersedia'}
              </div>
            )}
            {resolved.name && resolved.message && (
              <div className="report-signature-note">{resolved.message}</div>
            )}
          </section>
        );
      })}
    </div>
  );
};
