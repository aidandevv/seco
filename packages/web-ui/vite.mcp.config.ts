import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    emptyOutDir: false,
    lib: {
      entry: 'src/mcp-app.tsx',
      name: 'SecoMcpApp',
      formats: ['iife'],
      fileName: () => 'assets/mcp-app.js',
    },
    rollupOptions: {
      output: {
        assetFileNames: (assetInfo) =>
          assetInfo.name?.endsWith('.css') ? 'assets/mcp-app.css' : 'assets/[name]-[hash][extname]',
      },
    },
  },
});
