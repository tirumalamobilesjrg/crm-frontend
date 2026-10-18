// One key per user intent (one press of "Complete sale"). Reuse the same key when retrying the SAME action
// so the server can recognise a duplicate; create a new one only for a new action.
export const newIdempotencyKey = (): string => crypto.randomUUID()
