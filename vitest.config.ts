import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html'],
      // What we could meaningfully unit-test. Excludes generated types, seed
      // data, entrypoints, and pure style/config that carry no logic.
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.{test,spec}.{ts,tsx}',
        'src/test/**',
        'src/**/*.d.ts',
        'src/main.tsx',
        'src/vite-env.d.ts',
        'src/lib/database.types.ts',
        'src/lib/supabase.ts',
        'src/lib/seed*.{ts,js}',
        'src/lib/migrate_chapter1.ts',
        'src/lib/worldSeeds.ts',
        'src/lib/campaignSeeds.ts',
        'src/data/**',
      ],
    },
  },
});
