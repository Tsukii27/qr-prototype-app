// src/screens/BenchmarkScreen.tsx
import React, { useMemo, useState } from 'react';
import { Platform, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Device from 'expo-device';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { colors } from '../theme';
import { Chip } from '../ui';
import { CheckLine, ResultRow, runBenchmark, toCsv } from '../engine/experiments';

const SIZES = [50, 100, 200]; // small, medium, large

const fmtInt = (x: number) => String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const fmtUs = (x: number) => (x < 10 ? x.toFixed(3) : x.toFixed(1));

export default function BenchmarkScreen() {
  const [selected, setSelected] = useState<number[]>([50, 100, 200]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ text: '', done: 0, total: 1 });
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [checks, setChecks] = useState<CheckLine[]>([]);
  const [memorySource, setMemorySource] = useState<string | null>(null);

  const env = useMemo(
    () => ({
      device: Device.modelName ?? Platform.OS,
      os: `${Device.osName ?? Platform.OS} ${Device.osVersion ?? String(Platform.Version)}`,
      ram: Device.totalMemory ? `${(Device.totalMemory / 2 ** 30).toFixed(1)} GB` : 'n/a',
      engine: (globalThis as any).HermesInternal ? 'Hermes' : 'Other (JSC/V8)',
    }),
    []
  );

  const toggle = (n: number) =>
    setSelected((prev) =>
      prev.includes(n)
        ? prev.length > 1
          ? prev.filter((x) => x !== n)
          : prev
        : [...prev, n].sort((a, b) => a - b)
    );

  const start = async () => {
    setRunning(true);
    setRows([]);
    setChecks([]);
    try {
      const out = await runBenchmark(selected, (text, done, total) => setProgress({ text, done, total }));
      setRows(out.rows);
      setChecks(out.checks);
      setMemorySource(out.memorySource);
    } finally {
      setRunning(false);
    }
  };

  // Writes a real .csv file and opens the share sheet with it (falls back to plain text)
  const shareCsv = async () => {
    const csv = toCsv(rows, { device: env.device, engine: env.engine, memorySource });

    let file: File | null = null;
    try {
      const safeDevice = env.device.replace(/[^a-zA-Z0-9]+/g, '-');
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      file = new File(Paths.cache, `benchmark-${safeDevice}-${stamp}.csv`);
      if (file.exists) file.delete();
      file.create();
      file.write(csv);
    } catch {
      file = null; // could not create the file
    }

    if (file && (await Sharing.isAvailableAsync())) {
      try {
        await Sharing.shareAsync(file.uri, {
          mimeType: 'text/csv',
          dialogTitle: 'Share benchmark results (CSV)',
          UTI: 'public.comma-separated-values-text',
        });
      } catch {
        // the share sheet was dismissed or failed, nothing else to do
      }
      return;
    }

    await Share.share({ message: csv }); // fallback: plain text
  };

  const groups = useMemo(() => {
    const map = new Map<string, ResultRow[]>();
    for (const r of rows) {
      if (!map.has(r.algorithm)) map.set(r.algorithm, []);
      map.get(r.algorithm)!.push(r);
    }
    return Array.from(map.entries());
  }, [rows]);

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      {/* Environment */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Test environment</Text>
        <Text style={styles.envText}>Device: {env.device}</Text>
        <Text style={styles.envText}>OS: {env.os} · RAM: {env.ram}</Text>
        <Text style={styles.envText}>Engine: {env.engine}</Text>
        <Text style={styles.envText}>Build: Insertion = attendance record (v2)</Text>
        {__DEV__ && (
          <Text style={styles.warn}>
            Development mode is ON, so timings are slower and noisier. For final results start Metro
            with: npx expo start --no-dev --minify
          </Text>
        )}
      </View>

      {/* Controls */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Dataset size (students)</Text>
        <View style={styles.chipRow}>
          {SIZES.map((n) => (
            <Chip
              key={n}
              label={`${n}`}
              active={selected.includes(n)}
              onPress={() => toggle(n)}
              disabled={running}
            />
          ))}
        </View>

        <TouchableOpacity
          style={[styles.runBtn, running && { opacity: 0.6 }]}
          onPress={start}
          disabled={running}
          activeOpacity={0.85}
        >
          <Ionicons name="play" size={18} color="#fff" />
          <Text style={styles.runText}>{running ? 'Running...' : 'Run benchmark'}</Text>
        </TouchableOpacity>

        {running && (
          <View style={{ marginTop: 12 }}>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${(progress.done / progress.total) * 100}%` }]} />
            </View>
            <Text style={styles.progressText}>
              {progress.done}/{progress.total} · {progress.text}
            </Text>
          </View>
        )}
      </View>

      {/* Functional check */}
      {checks.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Functional check</Text>
          {checks.map((c) => (
            <Text key={`${c.n}-${c.mode}`} style={styles.checkText}>
              n={c.n} {c.mode}: accepted {c.accepted}, duplicates {c.duplicates}, invalid {c.invalid}{' '}
              <Text style={{ color: c.pass ? colors.present : colors.absent, fontWeight: '700' }}>
                {c.pass ? 'PASS' : 'FAIL'}
              </Text>
            </Text>
          ))}
        </View>
      )}

      {/* Results */}
      {groups.map(([name, list]) => (
        <View key={name} style={styles.card}>
          <Text style={styles.cardTitle}>{name}</Text>
          <View style={styles.tableHead}>
            <Text style={[styles.th, { flex: 0.6 }]}>n</Text>
            <Text style={[styles.th, { flex: 1 }]}>Ops</Text>
            <Text style={[styles.th, { flex: 1.7 }]}>Time (µs)</Text>
            <Text style={[styles.th, { flex: 1.2 }]}>Memory</Text>
          </View>
          {list.map((r) => (
            <View key={r.n} style={styles.tr}>
              <Text style={[styles.td, { flex: 0.6, fontWeight: '700' }]}>{r.n}</Text>
              <Text style={[styles.td, { flex: 1 }]}>{fmtInt(r.ops)}</Text>
              <Text style={[styles.td, { flex: 1.7 }]}>
                {fmtUs(r.meanUs)} ± {fmtUs(r.sdUs)}
              </Text>
              <Text style={[styles.td, { flex: 1.2 }]}>
                {r.bytesPerRun === null ? 'n/a' : `${fmtInt(r.bytesPerRun)} B`}
              </Text>
            </View>
          ))}
        </View>
      ))}

      {rows.length > 0 && (
        <>
          <Text style={styles.note}>
            Memory source: {memorySource ?? 'not available on this runtime'}. Time = mean ± SD per run of the
            whole workload (all n students).
          </Text>
          <TouchableOpacity style={styles.shareBtn} onPress={shareCsv} activeOpacity={0.85}>
            <Ionicons name="share-outline" size={18} color={colors.purple} />
            <Text style={styles.shareText}>Share results as CSV file</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 40 },
  card: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  cardTitle: { fontSize: 14, fontWeight: '700', color: colors.purple, marginBottom: 8 },
  envText: { fontSize: 12, color: colors.muted, marginTop: 2 },
  warn: {
    fontSize: 11,
    color: colors.late,
    backgroundColor: colors.lateBg,
    borderRadius: 8,
    padding: 8,
    marginTop: 8,
  },
  chipRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  runBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.purple,
    borderRadius: 12,
    height: 46,
  },
  runText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  barTrack: { height: 6, backgroundColor: colors.lavender, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: 6, backgroundColor: colors.purpleMid },
  progressText: { fontSize: 11, color: colors.muted, marginTop: 6 },
  checkText: { fontSize: 11, color: colors.text, marginTop: 3 },
  tableHead: {
    flexDirection: 'row',
    backgroundColor: colors.lavender,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  th: { fontSize: 10, fontWeight: '700', color: colors.muted, letterSpacing: 0.4 },
  tr: {
    flexDirection: 'row',
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  td: { fontSize: 12, color: colors.text },
  note: { fontSize: 11, color: colors.muted, marginBottom: 12, lineHeight: 16 },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#fff',
    borderRadius: 12,
    height: 44,
  },
  shareText: { fontSize: 14, fontWeight: '600', color: colors.purple },
});