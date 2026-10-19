import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: false,
    css: false,
    // other sessions' git worktrees live under .claude/worktrees: never run their copies of the tests
    exclude: [...configDefaults.exclude, '.claude/**'],
  },
})
