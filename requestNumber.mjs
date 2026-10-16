const REQUEST_NUMBER_PREFIX = 'REQ-BPS7106';

function requestYear(request) {
  const match = typeof request?.tanggal === 'string'
    ? /^(\d{4})-\d{2}-\d{2}$/.exec(request.tanggal)
    : null;
  return match?.[1] || String(new Date().getFullYear());
}

function requestNumberForYear(number, year) {
  const prefix = `${REQUEST_NUMBER_PREFIX}/${year}/`;
  return number.startsWith(prefix) && /^\d{4,}$/.test(number.slice(prefix.length));
}

function requestNumberValue(request) {
  return typeof request?.nomorPermintaan === 'string' ? request.nomorPermintaan.trim() : '';
}

export function getNextRequestNumber(requests, year) {
  const normalizedYear = String(year);
  if (!/^\d{4}$/.test(normalizedYear)) {
    throw new TypeError('Tahun permohonan harus terdiri dari empat digit.');
  }

  const prefix = `${REQUEST_NUMBER_PREFIX}/${normalizedYear}/`;
  const usedNumbers = new Set(requests.map(requestNumberValue).filter(Boolean));
  let highestSequence = 0;

  for (const number of usedNumbers) {
    if (!number.startsWith(prefix)) continue;
    const sequence = Number(number.slice(prefix.length));
    if (/^\d+$/.test(number.slice(prefix.length)) && Number.isSafeInteger(sequence)) {
      highestSequence = Math.max(highestSequence, sequence);
    }
  }

  let sequence = highestSequence + 1;
  let candidate = `${prefix}${String(sequence).padStart(4, '0')}`;
  while (usedNumbers.has(candidate)) {
    sequence += 1;
    candidate = `${prefix}${String(sequence).padStart(4, '0')}`;
  }
  return candidate;
}

export function assignNewRequestNumbers(previousRequests, nextRequests) {
  if (!Array.isArray(nextRequests)) {
    return { requests: nextRequests, assignedNumbers: {} };
  }

  const previous = Array.isArray(previousRequests) ? previousRequests : [];
  const previousIds = new Set(previous.map(request => request?.id));
  const usedNumbers = new Set(previous.map(requestNumberValue).filter(Boolean));
  const allNumberedRequests = [...previous];
  const assignedNumbers = new Map();
  const requests = nextRequests.map(request => {
    if (!request || typeof request !== 'object' || previousIds.has(request.id)) return request;

    const year = requestYear(request);
    const submittedNumber = requestNumberValue(request);
    const number = requestNumberForYear(submittedNumber, year) && !usedNumbers.has(submittedNumber)
      ? submittedNumber
      : getNextRequestNumber(allNumberedRequests, year);

    usedNumbers.add(number);
    allNumberedRequests.push({ nomorPermintaan: number });
    if (typeof request.id === 'string' && request.id.trim()) assignedNumbers.set(request.id, number);
    return { ...request, nomorPermintaan: number };
  });

  return { requests, assignedNumbers: Object.fromEntries(assignedNumbers) };
}
