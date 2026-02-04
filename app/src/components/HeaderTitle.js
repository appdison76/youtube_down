import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

// PRO 앱이므로 타이틀 옆에 PRO 뱃지 항상 표시 (스토어 버전과 구분)
export default function HeaderTitle({ title }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title} numberOfLines={1}>{title}</Text>
      <View style={styles.proBadge}>
        <Text style={styles.proText}>PRO</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  proBadge: {
    backgroundColor: '#C6692C',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  proText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
});
