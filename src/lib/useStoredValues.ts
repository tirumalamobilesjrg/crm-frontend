import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react'

type Values = Record<string, string>

function read(key: string): Values {
  try {
    const raw = sessionStorage.getItem(key)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(Object.entries(parsed as Record<string, unknown>).filter(([, v]) => typeof v === 'string')) as Values
  } catch {
    return {}
  }
}

function write(key: string, values: Values) {
  try {
    if (Object.values(values).every((v) => v === '')) sessionStorage.removeItem(key)
    else sessionStorage.setItem(key, JSON.stringify(values))
  } catch {
    /* storage blocked or full: the screen still works, it just cannot survive a reload */
  }
}

/**
 * Form values that survive a refresh or an accidental back-swipe (tab session only, never shared with another tab or kept
 * after the tab is closed). Used for IMEI boxes: scanning 26 of 30 phones must not be lost to a reload.
 */
export function useStoredValues(key: string): [Values, Dispatch<SetStateAction<Values>>, () => void] {
  const [values, setValues] = useState<Values>(() => read(key))
  useEffect(() => write(key, values), [key, values])
  const clear = useCallback(() => {
    try {
      sessionStorage.removeItem(key)
    } catch {
      /* ignore */
    }
    setValues({})
  }, [key])
  return [values, setValues, clear]
}
