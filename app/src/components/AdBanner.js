import React from 'react';
import { View, StyleSheet } from 'react-native';

export default function AdBanner({ style }) {
  // TODO: 실제 광고 배너 구현
  return (
    <View style={[styles.container, style]}>
      {/* 광고 배너 영역 */}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 50,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
