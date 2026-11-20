// src/screens/SimulatorScreen.tsx
// The prototype system in action: enroll a class, scan QR events, see totals and the sorted list.
import React, { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import { Chip } from '../ui';
import { AttendanceSystem, LogRecord, Mode, Ops, OpsKey, ScanResult } from '../engine/attendanceSystem';
import { Dataset, makeDataset } from '../engine/dataset';

const SIZES = [50, 100, 200];

type Summary = { present: number; late: number; absent: number; minutes: number };

export default function SimulatorScreen() {
  const [n, setN] = useState(50);
  const [mode, setMode] = useState<Mode>('optimized');

  const sysRef = useRef<AttendanceSystem | null>(null);
  const dataRef = useRef<Dataset | null>(null);

  const [cursor, setCursor] = useState(0);
  const [last, setLast] = useState<ScanResult | null>(null);
  const [counts, setCounts] = useState({ accepted: 0, duplicates: 0, invalid: 0 });
  const [summary, setSummary] = useState<Summary | null>(null);
  const [recent, setRecent] = useState<LogRecord[]>([]);
  const [ops, setOps] = useState<Ops | null>(null);

  // Recomputes the dashboard numbers (summation) and the sorted list (merge sort)
  const refresh = () => {
    const s = sysRef.current;
    if (!s) return;
    setSummary(s.summarize());
    setRecent(s.sortedAttendance().slice(-8).reverse()); // latest scans first
    setOps({ ...s.ops });
  };

  const loadClass = () => {
    const data = makeDataset(n);
    const s = new AttendanceSystem({ mode });
    for (const st of data.students) s.enroll(st); // Insertion
    sysRef.current = s;
    dataRef.current = data;
    setCursor(0);
    setLast(null);
    setCounts({ accepted: 0, duplicates: 0, invalid: 0 });
    refresh();
  };

  const scan = (count: number) => {
    const s = sysRef.current;
    const d = dataRef.current;
    if (!s || !d) return;

    const c = { ...counts };
    let result: ScanResult | null = null;
    let idx = cursor;
    for (let k = 0; k < count && idx < d.events.length; k++, idx++) {
      const e = d.events[idx];
      result = s.scanToken(e.token, e.minute); // SHA-256 -> search -> existence check -> record
      if (result.ok) c.accepted++;
      else if (result.reason === 'duplicate') c.duplicates++;
      else c.invalid++;
    }
    setCursor(idx);
    setCounts(c);
    if (result) setLast(result);
    refresh();
  };

  const loaded = !!sysRef.current && !!dataRef.current;
  const total = dataRef.current?.events.length ?? 0;
  const finished = loaded && cursor >= total;

  const opRows: [string, OpsKey][] = [
    ['Insertion', 'insertion'],
    [mode === 'optimized' ? 'Indexed search' : 'Linear search', 'search'],
    ['Existence check', 'existence'],
    ['Record (append)', 'record'],
    ['Summation', 'summation'],
    ['Merge sort', 'sort'],
  ];

  const badge = (status: 'Present' | 'Late') =>
    status === 'Late'
      ? { bg: colors.lateBg, fg: colors.late, label: '◷ LATE' }
      : { bg: colors.presentBg, fg: colors.present, label: '✓ PRESENT' };

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      {/* Setup */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Class</Text>
        <View style={styles.chipRow}>
          {SIZES.map((v) => (
            <Chip key={v} label={`${v} students`} active={n === v} onPress={() => setN(v)} />
          ))}
        </View>
        <View style={styles.chipRow}>
          <Chip label="Optimized" active={mode === 'optimized'} onPress={() => setMode('optimized')} />
          <Chip label="Baseline" active={mode === 'baseline'} onPress={() => setMode('baseline')} />
        </View>
        <TouchableOpacity style={styles.primaryBtn} onPress={loadClass} activeOpacity={0.85}>
          <Ionicons name="people" size={18} color="#fff" />
          <Text style={styles.primaryText}>Load class</Text>
        </TouchableOpacity>
      </View>

      {!loaded ? (
        <Text style={styles.hint}>Load a class to start scanning QR codes.</Text>
      ) : (
        <>
          {/* Scanner */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              Scanner · {cursor}/{total} scanned
            </Text>

            {last === null && <Text style={styles.hint}>Tap "Scan next" to scan the first QR code.</Text>}

            {last && last.ok && (
              <View>
                <View style={[styles.badge, { backgroundColor: badge(last.status).bg }]}>
                  <Text style={[styles.badgeText, { color: badge(last.status).fg }]}>
                    {badge(last.status).label}
                  </Text>
                </View>
                <Text style={styles.label}>STUDENT NAME</Text>
                <Text style={styles.big}>{last.student.name}</Text>
                <Text style={styles.label}>LRN</Text>
                <Text style={styles.value}>{last.student.lrn}</Text>
                <Text style={styles.label}>GRADE AND SECTION</Text>
                <Text style={styles.value}>
                  {last.student.grade} - {last.student.section}
                </Text>
              </View>
            )}

            {last && !last.ok && last.reason === 'duplicate' && (
              <View style={[styles.banner, { backgroundColor: colors.lateBg }]}>
                <Ionicons name="information-circle" size={18} color={colors.late} />
                <Text style={[styles.bannerText, { color: colors.late }]}>
                  {last.student.name} was already scanned today.
                </Text>
              </View>
            )}

            {last && !last.ok && last.reason === 'invalid' && (
              <View style={[styles.banner, { backgroundColor: colors.absentBg }]}>
                <Ionicons name="alert-circle" size={18} color={colors.absent} />
                <Text style={[styles.bannerText, { color: colors.absent }]}>Invalid QR code.</Text>
              </View>
            )}

            <View style={styles.btnRow}>
              <TouchableOpacity
                style={[styles.secondaryBtn, { flex: 1 }, finished && { opacity: 0.5 }]}
                onPress={() => scan(1)}
                disabled={finished}
              >
                <Text style={styles.secondaryText}>Scan next</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, { flex: 1 }, finished && { opacity: 0.5 }]}
                onPress={() => scan(Infinity)}
                disabled={finished}
              >
                <Text style={styles.primaryText}>Scan all</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.note}>
              Accepted {counts.accepted} · Duplicates {counts.duplicates} · Invalid {counts.invalid}
            </Text>
          </View>

          {/* Summation */}
          {summary && (
            <View style={styles.pillRow}>
              <View style={[styles.pill, { backgroundColor: colors.presentBg }]}>
                <Text style={[styles.pillNum, { color: colors.present }]}>{summary.present}</Text>
                <Text style={styles.pillLabel}>Present</Text>
              </View>
              <View style={[styles.pill, { backgroundColor: colors.lateBg }]}>
                <Text style={[styles.pillNum, { color: colors.late }]}>{summary.late}</Text>
                <Text style={styles.pillLabel}>Late</Text>
              </View>
              <View style={[styles.pill, { backgroundColor: colors.absentBg }]}>
                <Text style={[styles.pillNum, { color: colors.absent }]}>{summary.absent}</Text>
                <Text style={styles.pillLabel}>Absent</Text>
              </View>
            </View>
          )}

          {/* Merge sort */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Recent attendance (merge sorted by scan time)</Text>
            {recent.length === 0 ? (
              <Text style={styles.hint}>No scans yet.</Text>
            ) : (
              recent.map((r, i) => {
                const student = sysRef.current!.students[r.studentId];
                const b = badge(r.status);
                return (
                  <View key={`${r.studentId}-${i}`} style={styles.row}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowName}>{student.name}</Text>
                      <Text style={styles.rowMeta}>+{r.minute} min after class start</Text>
                    </View>
                    <View style={[styles.rowBadge, { backgroundColor: b.bg }]}>
                      <Text style={[styles.rowBadgeText, { color: b.fg }]}>{r.status}</Text>
                    </View>
                  </View>
                );
              })
            )}
          </View>

          {/* Live operation counters */}
          {ops && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Operations so far</Text>
              {opRows.map(([label, key]) => (
                <View key={key} style={styles.opRow}>
                  <Text style={styles.opLabel}>{label}</Text>
                  <Text style={styles.opValue}>{ops[key].toLocaleString('en-US')}</Text>
                </View>
              ))}
            </View>
          )}
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
  cardTitle: { fontSize: 14, fontWeight: '700', color: colors.purple, marginBottom: 10 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  hint: { fontSize: 12, color: colors.muted, textAlign: 'center', marginVertical: 8 },

  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.purple,
    borderRadius: 12,
    height: 44,
  },
  primaryText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  secondaryBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    height: 44,
  },
  secondaryText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  note: { fontSize: 11, color: colors.muted, textAlign: 'center', marginTop: 10 },

  badge: { alignSelf: 'center', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 6, marginBottom: 12 },
  badgeText: { fontSize: 13, fontWeight: '700' },
  label: { fontSize: 10, letterSpacing: 0.5, color: colors.mutedLight, marginTop: 8 },
  big: { fontSize: 20, fontWeight: '700', color: colors.text, marginTop: 2 },
  value: { fontSize: 15, fontWeight: '500', color: colors.text, marginTop: 2 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, padding: 10 },
  bannerText: { flex: 1, fontSize: 13, fontWeight: '600' },

  pillRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  pill: { flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  pillNum: { fontSize: 24, fontWeight: '800' },
  pillLabel: { fontSize: 11, color: colors.muted, marginTop: 2 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowName: { fontSize: 13, fontWeight: '600', color: colors.text },
  rowMeta: { fontSize: 11, color: colors.muted, marginTop: 2 },
  rowBadge: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  rowBadgeText: { fontSize: 11, fontWeight: '600' },

  opRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  opLabel: { fontSize: 13, color: colors.text },
  opValue: { fontSize: 13, fontWeight: '700', color: colors.purple },
});