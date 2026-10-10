export const resolveReportSigner = (signer, users) => {
  if (signer.role) {
    const matches = users.filter(user => user.role === signer.role && user.statusAktif !== false);

    if (matches.length === 1) {
      return {
        name: matches[0].name,
        nip: matches[0].nip?.trim() || null,
        message: null
      };
    }

    return {
      name: null,
      nip: null,
      message: matches.length === 0
        ? `Belum ada pengguna aktif dengan role "${signer.role}".`
        : `Ada ${matches.length} pengguna aktif dengan role "${signer.role}"; pejabat belum dapat ditentukan.`
    };
  }

  const name = signer.name?.trim();
  if (!name) {
    return {
      name: null,
      nip: null,
      message: signer.emptyMessage || 'Identitas tidak tercatat pada data dokumen ini.'
    };
  }

  const matches = users.filter(user => user.name.trim() === name);
  return {
    name,
    nip: signer.nip?.trim() || (matches.length === 1 ? matches[0].nip?.trim() : '') || null,
    message: matches.length > 1 && !signer.nip?.trim()
      ? 'NIP tidak ditampilkan karena nama cocok dengan lebih dari satu akun.'
      : null
  };
};
