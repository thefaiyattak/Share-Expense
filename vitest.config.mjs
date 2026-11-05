import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: true,
  },
  resolve: {
    alias: {
      'react-native': path.resolve('./src/offline/__mocks__/react-native.ts'),
      '@react-native-community/netinfo': path.resolve('./src/offline/__mocks__/netinfo.ts'),
      'expo-file-system/legacy': path.resolve('./src/offline/__mocks__/expo-file-system.ts'),
      'expo-file-system': path.resolve('./src/offline/__mocks__/expo-file-system.ts'),
    },
  },
});
