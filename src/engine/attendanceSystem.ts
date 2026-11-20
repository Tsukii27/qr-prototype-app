// src/engine/attendanceSystem.ts
// In-memory prototype of the QR attendance system's core logic.
// Every algorithm counts its own operations (comparisons + data writes/moves).
import { sha256 } from 'js-sha256';

export type Mode = 'optimized' | 'baseline';
export type Status = 'Present' | 'Late';

export interface StudentInput {
  lrn: string;
  name: string;
  grade: string;
  section: string;
  hash: string;
}
export interface StudentRow extends StudentInput {
  id: number;
}
export interface LogRecord {
  studentId: number;
  minute: number;
  status: Status;
}
export interface Ops {
  insertion: number;
  search: number;
  existence: number;
  record: number;
  summation: number;
  sort: number;
}
export type OpsKey = keyof Ops;

export type ScanResult =
  | { ok: true; student: StudentRow; status: Status }
  | { ok: false; reason: 'duplicate'; student: StudentRow }
  | { ok: false; reason: 'invalid' };

interface IndexEntry {
  hash: string;
  studentId: number;
}

export const sha256Hex = (text: string): string => sha256(text);

export class AttendanceSystem {
  // 'optimized' = sorted index + hash set (the app's design)
  // 'baseline'  = plain lists with linear scans (for comparison)
  mode: Mode;
  cutoff: number; // minutes after class start; later than this = Late
  students: StudentRow[] = [];
  index: IndexEntry[] = []; // kept sorted by token hash
  log: LogRecord[] = []; // attendance records in scan order
  scanned = new Set<number>(); // student ids already scanned today
  ops: Ops = { insertion: 0, search: 0, existence: 0, record: 0, summation: 0, sort: 0 };

  constructor(options: { mode?: Mode; cutoffMinute?: number } = {}) {
    this.mode = options.mode ?? 'optimized';
    this.cutoff = options.cutoffMinute ?? 30;
  }

  resetOps() {
    (Object.keys(this.ops) as OpsKey[]).forEach((k) => {
      this.ops[k] = 0;
    });
  }

  /* 1. Insertion: enroll a student (sorted insert into the token index) */
  enroll(student: StudentInput): number {
    const id = this.students.length;
    this.students.push({ id, ...student });
    if (this.mode === 'baseline') return id; // no index in the baseline

    const entry: IndexEntry = { hash: student.hash, studentId: id };
    const list = this.index;
    let i = list.length - 1;
    while (i >= 0) {
      this.ops.insertion++; // comparison
      if (list[i].hash <= entry.hash) break;
      list[i + 1] = list[i]; // shift right
      this.ops.insertion++; // write
      i--;
    }
    list[i + 1] = entry;
    this.ops.insertion++; // final write
    return id;
  }

  /* 2. Indexed Search: find a student by token hash */
  findByKey(key: string): StudentRow | null {
    if (this.mode === 'baseline') {
      for (let i = 0; i < this.students.length; i++) {
        this.ops.search++;
        if (this.students[i].hash === key) return this.students[i];
      }
      return null;
    }

    // Binary search on the sorted index
    let lo = 0;
    let hi = this.index.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const entry = this.index[mid];
      this.ops.search++; // one key comparison per probe
      if (entry.hash === key) return this.students[entry.studentId];
      if (entry.hash < key) lo = mid + 1;
      else hi = mid - 1;
    }
    return null;
  }

  /* 3. Existence Check: was the student already scanned today? */
  hasScanned(studentId: number): boolean {
    if (this.mode === 'baseline') {
      for (let i = 0; i < this.log.length; i++) {
        this.ops.existence++;
        if (this.log[i].studentId === studentId) return true;
      }
      return false;
    }
    this.ops.existence++; // one hash lookup counts as one operation
    return this.scanned.has(studentId);
  }

  // Saves the attendance record (not one of the five algorithms, counted separately)
  recordAttendance(studentId: number, minute: number): Status {
    const status: Status = minute > this.cutoff ? 'Late' : 'Present';
    this.ops.record += 2; // one comparison + one append
    this.log.push({ studentId, minute, status });
    if (this.mode === 'optimized') {
      this.scanned.add(studentId);
      this.ops.record++;
    }
    return status;
  }

  /* Full scan pipeline: search -> existence check -> record */
  scanByKey(key: string, minute: number): ScanResult {
    const student = this.findByKey(key);
    if (!student) return { ok: false, reason: 'invalid' };
    if (this.hasScanned(student.id)) return { ok: false, reason: 'duplicate', student };
    const status = this.recordAttendance(student.id, minute);
    return { ok: true, student, status };
  }

  // Same as scanByKey, but starts from the raw QR token (adds SHA-256 hashing)
  scanToken(token: string, minute: number): ScanResult {
    return this.scanByKey(sha256Hex(token), minute);
  }

  /* 4. Summation: dashboard totals */
  summarize() {
    let present = 0;
    let late = 0;
    let minutes = 0;
    for (const r of this.log) {
      if (r.status === 'Present') present++;
      else late++;
      minutes += r.minute;
      this.ops.summation += 2; // one counter increment + one addition per record
    }
    this.ops.summation++; // absent = enrolled - scanned
    return { present, late, absent: this.students.length - this.log.length, minutes };
  }

  /* 5. Merge Sort: attendance list ordered by scan time */
  sortedAttendance(): LogRecord[] {
    const ops = this.ops;
    const sort = (arr: LogRecord[]): LogRecord[] => {
      if (arr.length <= 1) return arr;
      const mid = arr.length >> 1;
      const left = sort(arr.slice(0, mid));
      const right = sort(arr.slice(mid));
      const out = new Array<LogRecord>(arr.length);
      let i = 0;
      let j = 0;
      let k = 0;
      while (i < left.length && j < right.length) {
        ops.sort++; // comparison
        out[k++] = left[i].minute <= right[j].minute ? left[i++] : right[j++];
        ops.sort++; // write
      }
      while (i < left.length) {
        out[k++] = left[i++];
        ops.sort++;
      }
      while (j < right.length) {
        out[k++] = right[j++];
        ops.sort++;
      }
      return out;
    };
    return sort(this.log);
  }
}