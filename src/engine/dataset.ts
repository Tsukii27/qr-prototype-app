// src/engine/dataset.ts
// Reproducible datasets: the same n always produces the same students and scans.
import { sha256Hex, StudentInput } from './attendanceSystem';

export interface DatasetStudent extends StudentInput {
  token: string;
  minute: number; // minutes after class start
}
export interface ScanEvent {
  token: string;
  key: string; // SHA-256 of the token
  minute: number;
}
export interface Dataset {
  n: number;
  students: DatasetStudent[];
  events: ScanEvent[];
  expected: { accepted: number; duplicates: number; invalid: number };
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function randomToken(rand: () => number): string {
  let t = '';
  for (let i = 0; i < 48; i++) t += Math.floor(rand() * 16).toString(16); // 48 hex chars, same as the QR tokens
  return t;
}

export function makeDataset(n: number): Dataset {
  const rand = mulberry32(2024 + n);
  const sections = ['Rizal', 'Bonifacio', 'Mabini'];

  const students: DatasetStudent[] = [];
  for (let i = 0; i < n; i++) {
    const token = randomToken(rand);
    students.push({
      lrn: String(100000000000 + Math.floor(rand() * 899999999999)),
      name: `Student ${i + 1}`,
      grade: `Grade ${7 + Math.floor(rand() * 6)}`,
      section: sections[Math.floor(rand() * sections.length)],
      token,
      hash: sha256Hex(token),
      minute: Math.floor(rand() * 60),
    });
  }

  // Scan session: every student scans once, about 10% scan again, about 5% are invalid QR codes
  const events: ScanEvent[] = students.map((s) => ({ token: s.token, key: s.hash, minute: s.minute }));
  const dupCount = Math.ceil(n * 0.1);
  const invalidCount = Math.ceil(n * 0.05);

  for (let i = 0; i < dupCount; i++) {
    const s = students[Math.floor(rand() * n)];
    events.push({ token: s.token, key: s.hash, minute: Math.floor(rand() * 60) });
  }
  for (let i = 0; i < invalidCount; i++) {
    const token = randomToken(rand);
    events.push({ token, key: sha256Hex(token), minute: Math.floor(rand() * 60) });
  }
  shuffle(events, rand);

  return { n, students, events, expected: { accepted: n, duplicates: dupCount, invalid: invalidCount } };
}