import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
  sessionStorage.clear() // screens keep unfinished form values per tab (useStoredValues); tests must not leak them to each other
})
