import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    assetsDir: 'build',
    rolldownOptions: {
      output: {
        strictExecutionOrder: true,
        codeSplitting: {
          includeDependenciesRecursively: false,
          groups: [
            {
              name: 'vendor-react',
              test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              priority: 50,
            },
            {
              name: 'vendor-pixi',
              test: /node_modules[\\/](@pixi|pixi\.js)[\\/]/,
              priority: 40,
              maxSize: 450 * 1024,
            },
            {
              name: 'world-renderer',
              test: /src[\\/]worldRenderer[\\/]/,
              priority: 30,
              maxSize: 450 * 1024,
            },
            {
              name: 'game-runtime',
              test: /src[\\/]game[\\/]/,
              priority: 20,
              maxSize: 450 * 1024,
            },
            {
              name: 'vendor',
              test: /node_modules[\\/]/,
              priority: 10,
              maxSize: 450 * 1024,
            },
          ],
        },
      },
    },
  },
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/__tests__/**',
        'dist/**',
        'public/**',
        '**/*.d.ts',
      ],
    },
  },
})
