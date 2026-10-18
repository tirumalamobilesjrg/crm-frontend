import { toAppError } from '../lib/errors'

interface Result<T> {
  data: T | null
  error: unknown
}

/** Awaits a Supabase query and returns its data, or throws an AppError with a human message. */
export async function run<T>(query: PromiseLike<Result<T>>): Promise<T> {
  const { data, error } = await query
  if (error) throw toAppError(error)
  return data as T
}
