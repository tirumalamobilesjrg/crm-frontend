import { useCallback, useRef } from 'react'
import { newIdempotencyKey } from './idempotency'

/**
 * One idempotency key per user attempt. Retrying exactly the same request (same signature) reuses the key, so the
 * server replays instead of repeating; changing anything makes it a different request with a fresh key.
 * Call `clear()` after a confirmed success so the next action starts a new attempt.
 */
export function useAttemptKey() {
  const current = useRef<{ signature: string; key: string } | null>(null)
  const keyFor = useCallback((signature: string): string => {
    if (current.current?.signature !== signature) current.current = { signature, key: newIdempotencyKey() }
    return current.current.key
  }, [])
  const clear = useCallback(() => {
    current.current = null
  }, [])
  return { keyFor, clear }
}
