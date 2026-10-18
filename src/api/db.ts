import { AppError, toAppError } from '../lib/errors'

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

export const NO_ROWS_MESSAGE =
  'That change was not applied. The record may have been changed, finalised or removed by someone else, or you may not be allowed to change it. Refresh the page and try again.'

/**
 * For an UPDATE or DELETE that must change an existing record. The query has to end in `.select(<key column>)` so the
 * server returns the rows it actually changed. PostgREST answers "0 rows changed" with success (row-level security
 * silently filters rows the user may not touch, and finalised records are no longer matched), so an empty result is
 * turned into an explicit failure. The message deliberately does not say why: it could be any of the causes above.
 */
export async function runChange(query: PromiseLike<Result<unknown[]>>): Promise<void> {
  const rows = await run(query)
  if (!Array.isArray(rows) || rows.length === 0) throw new AppError(NO_ROWS_MESSAGE, 'no_rows')
}

export const TOO_MANY_MESSAGE = 'That covers too many records to total in the browser. Choose a shorter date range.'

/** Reads every page of a query (the Data API returns at most 1000 rows at a time). Refuses, rather than silently truncating, past `cap`. */
export async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<Result<T[]>>, pageSize = 1000, cap = 20000): Promise<T[]> {
  const all: T[] = []
  for (let from = 0; from < cap; from += pageSize) {
    const rows = await run<T[]>(page(from, from + pageSize - 1))
    all.push(...(rows ?? []))
    if (!rows || rows.length < pageSize) return all
  }
  throw new AppError(TOO_MANY_MESSAGE, 'too_many')
}
