import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { initDatabase } from './src/services/database';
import AppNavigator from './src/navigation/AppNavigator';

export default function App() {
  useEffect(() => {
    // 데이터베이스 초기화
    initDatabase().catch((error) => {
      console.error('Database initialization error:', error);
    });
  }, []);

  return (
    <>
      <AppNavigator />
      <StatusBar style="auto" />
    </>
  );
}
