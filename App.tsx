// App.tsx
import React, { useState } from 'react';
import { StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { colors } from './src/theme';
import { Chip } from './src/ui';
import BenchmarkScreen from './src/screens/BenchmarkScreen';
import SimulatorScreen from './src/screens/SimulatorScreen';

export default function App() {
  const [tab, setTab] = useState<'benchmark' | 'simulator'>('benchmark');

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.root} edges={['top']}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.header}>
          <Text style={styles.title}>QR Attendance Prototype</Text>
          <Text style={styles.sub}>Execution time · operations · memory</Text>
        </View>

        <View style={styles.tabs}>
          <Chip label="Benchmark" active={tab === 'benchmark'} onPress={() => setTab('benchmark')} />
          <Chip label="Simulator" active={tab === 'simulator'} onPress={() => setTab('simulator')} />
        </View>

        {/* Both screens stay mounted so a running benchmark is not interrupted */}
        <View style={[styles.body, tab !== 'benchmark' && styles.hidden]}>
          <BenchmarkScreen />
        </View>
        <View style={[styles.body, tab !== 'simulator' && styles.hidden]}>
          <SimulatorScreen />
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10 },
  title: { fontSize: 20, fontWeight: '700', color: colors.purple },
  sub: { fontSize: 12, color: colors.mutedLight, marginTop: 2 },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 10 },
  body: { flex: 1 },
  hidden: { display: 'none' },
});