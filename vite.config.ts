import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: false,
    css: false,
    // some screen tests take 2-3 s when the whole suite runs in parallel on a busy machine; the 5 s default made them flaky
    testTimeout: 15_000,
    // other sessions' git worktrees live under .claude/worktrees: never run their copies of the tests
    exclude: [...configDefaults.exclude, '.claude/**'],
  },
})
