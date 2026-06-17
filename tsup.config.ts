import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  dts: false,
  splitting: false,
  sourcemap: true,
  clean: true,
  bundle: true,
  target: 'node18',
  platform: 'node',
  external: ['sqlite3'],
});