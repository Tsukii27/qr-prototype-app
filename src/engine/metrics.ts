// src/engine/metrics.ts
// Timing and memory helpers that work in React Native (Hermes).

export const now = (): number => {
  const p = (globalThis as any).performance;
  return p && typeof p.now === 'function' ? p.now() : Date.now();
};

export interface RunSpec<S> {
  makeState: () => S; // builds the system state a run needs
  run: (state: S) => unknown;
  fresh: boolean; // true = every run needs its own new state (built outside the timer)
}

export interface TimeStats {
  mean: number; // microseconds
  sd: number;
  median: number;
  min: number;
  max: number;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function stats(samples: number[]): TimeStats {
  const s = [...samples].sort((a, b) => a - b);
  const mean = s.reduce((sum, x) => sum + x, 0) / s.length;
  const variance = s.reduce((sum, x) => sum + (x - mean) ** 2, 0) / (s.length - 1);
  return { mean, sd: Math.sqrt(variance), median: s[Math.floor(s.length / 2)], min: s[0], max: s[s.length - 1] };
}

// Execution time per run in microseconds.
// One probe run decides how many runs fit in a ~20 ms batch, so fast operations are
// timed in bulk (better accuracy) and slow ones are not repeated needlessly.
export function timeRuns<S>(spec: RunSpec<S>, batches = 20, targetBatchMs = 20): TimeStats {
  const { makeState, run, fresh } = spec;
  const cap = fresh ? 100 : 2000;
  const shared = (fresh ? undefined : makeState()) as S;

  const probe = fresh ? makeState() : shared;
  const p0 = now();
  run(probe);
  const oneMs = Math.max(now() - p0, 0.0005); // avoid dividing by zero on coarse timers
  const perBatch = Math.max(1, Math.min(cap, Math.ceil(targetBatchMs / oneMs)));

  const runBatch = (): number => {
    const states = fresh ? Array.from({ length: perBatch }, () => makeState()) : null;
    const t0 = now();
    for (let i = 0; i < perBatch; i++) run(fresh ? (states as S[])[i] : shared);
    return ((now() - t0) / perBatch) * 1000; // ms -> microseconds per run
  };

  runBatch(); // warm-up batches (discarded)
  runBatch();
  const samples: number[] = [];
  for (let b = 0; b < batches; b++) samples.push(runBatch());
  return stats(samples);
}

/* ---------- Memory ---------- */

export interface MemoryReader {
  source: string;
  read: () => number;
}

// Hermes keeps counters of heap allocation. We prefer the cumulative "total allocated bytes"
// counter, because it is not affected by garbage collection. Falls back to Chrome's
// performance.memory on web. Returns null if nothing is available.
export function getMemoryReader(): MemoryReader | null {
  const hermes = (globalThis as any).HermesInternal;
  if (hermes && typeof hermes.getInstrumentedStats === 'function') {
    const stats = hermes.getInstrumentedStats() ?? {};
    const keys = ['hermes_totalAllocatedBytes', 'js_totalAllocatedBytes', 'hermes_allocatedBytes', 'js_allocatedBytes'];
    for (const key of keys) {
      if (typeof stats[key] === 'number') {
        return { source: `Hermes ${key}`, read: () => hermes.getInstrumentedStats()[key] as number };
      }
    }
  }
  const mem = (globalThis as any).performance?.memory;
  if (mem && typeof mem.usedJSHeapSize === 'number') {
    return { source: 'performance.memory.usedJSHeapSize', read: () => mem.usedJSHeapSize as number };
  }
  return null;
}

// Heap bytes allocated per run (median of several trials)
export function measureAllocation<S>(spec: RunSpec<S>, reader: MemoryReader, runs = 10, trials = 15): number {
  const { makeState, run, fresh } = spec;
  const shared = (fresh ? undefined : makeState()) as S;

  // Reading the counter allocates a little too, so measure that cost and subtract it
  const overheads: number[] = [];
  for (let t = 0; t < trials; t++) {
    const a = reader.read();
    const b = reader.read();
    overheads.push(b - a);
  }
  const overhead = median(overheads);

  const results: number[] = [];
  for (let t = 0; t < trials; t++) {
    const states = fresh ? Array.from({ length: runs }, () => makeState()) : null;
    const before = reader.read();
    for (let i = 0; i < runs; i++) run(fresh ? (states as S[])[i] : shared);
    const after = reader.read();
    results.push(Math.max(0, (after - before - overhead) / runs));
  }
  return Math.round(median(results));
}