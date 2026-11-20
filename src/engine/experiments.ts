// src/engine/experiments.ts
import { AttendanceSystem, Mode, OpsKey } from './attendanceSystem';
import { Dataset, makeDataset } from './dataset';
import { getMemoryReader, measureAllocation, timeRuns } from './metrics';

interface State {
  system: AttendanceSystem;
  data: Dataset;
}

interface Experiment {
  name: Partial<Record<Mode, string>>;
  modes: Mode[];
  categories: OpsKey[]; // which operation counters belong to this experiment
  fresh: boolean;
  makeState: (data: Dataset, mode: Mode) => State;
  run: (state: State) => unknown;
}

/* ---------- Ways to build the system in a given state ---------- */
const enrolled = (data: Dataset, mode: Mode): AttendanceSystem => {
  const s = new AttendanceSystem({ mode });
  for (const st of data.students) s.enroll(st);
  return s;
};

// Half of the class has already scanned (existence check: half hits, half misses)
const halfScanned = (data: Dataset, mode: Mode): AttendanceSystem => {
  const s = enrolled(data, mode);
  data.students.forEach((st, i) => {
    if (i % 2 === 0) s.scanByKey(st.hash, st.minute);
  });
  return s;
};

// The whole scan session has been processed (for summation and sorting)
const fullSession = (data: Dataset, mode: Mode): AttendanceSystem => {
  const s = enrolled(data, mode);
  for (const e of data.events) s.scanByKey(e.key, e.minute);
  return s;
};

const wrap =
  (build: (data: Dataset, mode: Mode) => AttendanceSystem) =>
  (data: Dataset, mode: Mode): State => ({ system: build(data, mode), data });

/* ---------- Experiments ---------- */
const EXPERIMENTS: Experiment[] = [
  {
    name: { optimized: 'Insertion (sorted index)' },
    modes: ['optimized'],
    categories: ['insertion'],
    fresh: true,
    makeState: (data, mode) => ({ system: new AttendanceSystem({ mode }), data }),
    run: ({ system, data }) => {
      for (const s of data.students) system.enroll(s);
    },
  },
  {
    name: { optimized: 'Indexed Search (binary search)', baseline: 'Linear Search (baseline)' },
    modes: ['optimized', 'baseline'],
    categories: ['search'],
    fresh: false,
    makeState: wrap(enrolled),
    run: ({ system, data }) => {
      for (const e of data.events) system.findByKey(e.key);
    },
  },
  {
    name: { optimized: 'Existence Check (hash set)', baseline: 'Existence Check (linear baseline)' },
    modes: ['optimized', 'baseline'],
    categories: ['existence'],
    fresh: false,
    makeState: wrap(halfScanned),
    run: ({ system, data }) => {
      for (let i = 0; i < data.n; i++) system.hasScanned(i);
    },
  },
  {
    name: { optimized: 'Summation' },
    modes: ['optimized'],
    categories: ['summation'],
    fresh: false,
    makeState: wrap(fullSession),
    run: ({ system }) => system.summarize(),
  },
  {
    name: { optimized: 'Merge Sort' },
    modes: ['optimized'],
    categories: ['sort'],
    fresh: false,
    makeState: wrap(fullSession),
    run: ({ system }) => system.sortedAttendance(),
  },
  {
    name: {
      optimized: 'Full scan session (search+existence+record)',
      baseline: 'Full scan session (baseline)',
    },
    modes: ['optimized', 'baseline'],
    categories: ['search', 'existence', 'record'],
    fresh: true,
    makeState: wrap(enrolled),
    run: ({ system, data }) => {
      for (const e of data.events) system.scanByKey(e.key, e.minute);
    },
  },
  {
    name: { optimized: 'Full scan session + SHA-256 hashing' },
    modes: ['optimized'],
    categories: ['search', 'existence', 'record'],
    fresh: true,
    makeState: wrap(enrolled),
    run: ({ system, data }) => {
      for (const e of data.events) system.scanToken(e.token, e.minute);
    },
  },
];

/* ---------- Functional check: both modes must behave exactly like the real system ---------- */
export interface CheckLine {
  n: number;
  mode: Mode;
  accepted: number;
  duplicates: number;
  invalid: number;
  pass: boolean;
}

function verify(data: Dataset): CheckLine[] {
  const lines: CheckLine[] = [];
  for (const mode of ['optimized', 'baseline'] as Mode[]) {
    const s = enrolled(data, mode);
    let accepted = 0;
    let duplicates = 0;
    let invalid = 0;
    for (const e of data.events) {
      const r = s.scanByKey(e.key, e.minute);
      if (r.ok) accepted++;
      else if (r.reason === 'duplicate') duplicates++;
      else invalid++;
    }
    const x = data.expected;
    lines.push({
      n: data.n,
      mode,
      accepted,
      duplicates,
      invalid,
      pass: accepted === x.accepted && duplicates === x.duplicates && invalid === x.invalid,
    });
  }
  return lines;
}

/* ---------- Runner ---------- */
export interface ResultRow {
  algorithm: string;
  n: number;
  ops: number;
  opsPerStudent: number;
  meanUs: number;
  sdUs: number;
  medianUs: number;
  minUs: number;
  maxUs: number;
  bytesPerRun: number | null; // null = no memory counter available on this runtime
}

const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 30)); // lets the UI repaint

export async function runBenchmark(
  sizes: number[],
  onProgress: (text: string, done: number, total: number) => void
): Promise<{ rows: ResultRow[]; checks: CheckLine[]; memorySource: string | null }> {
  const reader = getMemoryReader();
  const perSize = EXPERIMENTS.reduce((sum, e) => sum + e.modes.length, 0);
  const total = perSize * sizes.length;
  const rows: ResultRow[] = [];
  const checks: CheckLine[] = [];
  let done = 0;

  for (const n of sizes) {
    const data = makeDataset(n);
    checks.push(...verify(data));

    for (const exp of EXPERIMENTS) {
      for (const mode of exp.modes) {
        const label = exp.name[mode] as string;
        onProgress(`n=${n} · ${label}`, done, total);
        await pause();

        const makeState = () => exp.makeState(data, mode);

        // Number of operations (deterministic): run once on a fresh state
        const state = makeState();
        state.system.resetOps();
        exp.run(state);
        const ops = exp.categories.reduce((sum, c) => sum + state.system.ops[c], 0);

        const spec = { makeState, run: exp.run, fresh: exp.fresh };
        const t = timeRuns(spec);
        const bytes = reader ? measureAllocation(spec, reader) : null;

        rows.push({
          algorithm: label,
          n,
          ops,
          opsPerStudent: ops / n,
          meanUs: t.mean,
          sdUs: t.sd,
          medianUs: t.median,
          minUs: t.min,
          maxUs: t.max,
          bytesPerRun: bytes,
        });
        done++;
      }
    }
  }

  onProgress('Done', total, total);
  return { rows, checks, memorySource: reader ? reader.source : null };
}

/* ---------- CSV export ---------- */
export function toCsv(
  rows: ResultRow[],
  env: { device: string; engine: string; memorySource: string | null }
): string {
  const r3 = (x: number) => x.toFixed(3);
  const q = (s: string) => (s.includes(',') ? `"${s}"` : s);
  const header =
    'algorithm,n,ops,ops_per_student,mean_us,sd_us,median_us,min_us,max_us,bytes_per_run,device,engine,memory_source';
  const lines = rows.map((r) =>
    [
      q(r.algorithm),
      r.n,
      r.ops,
      r3(r.opsPerStudent),
      r3(r.meanUs),
      r3(r.sdUs),
      r3(r.medianUs),
      r3(r.minUs),
      r3(r.maxUs),
      r.bytesPerRun === null ? '' : r.bytesPerRun,
      q(env.device),
      q(env.engine),
      q(env.memorySource ?? 'n/a'),
    ].join(',')
  );
  return [header, ...lines].join('\n');
}