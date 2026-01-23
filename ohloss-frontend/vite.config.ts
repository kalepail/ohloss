import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      buffer: 'buffer/',
    },
    // Ensure these packages are always resolved from frontend's node_modules
    dedupe: ['@stellar/stellar-sdk', 'buffer'],
  },
  define: {
    global: 'globalThis',
  },
  optimizeDeps: {
    include: ['buffer', '@stellar/stellar-sdk'],
  },
  build: {
    outDir: 'dist',
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    rollupOptions: {
      output: {
        manualChunks: {
          'stellar-sdk': ['@stellar/stellar-sdk'],
          'vendor': ['react', 'react-dom', 'zustand'],
          'smart-account': ['smart-account-kit', 'smart-account-kit-bindings'],
        },
      },
    },
  },
})
