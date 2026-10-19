import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useStoredValues } from './useStoredValues'

beforeEach(() => sessionStorage.clear())

describe('useStoredValues', () => {
  it('keeps typed values across a reload of the same screen and forgets them when cleared', () => {
    const first = renderHook(() => useStoredValues('k1'))
    act(() => first.result.current[1]({ a: '352000000000018', b: '' }))
    first.unmount()
    const second = renderHook(() => useStoredValues('k1'))
    expect(second.result.current[0]).toEqual({ a: '352000000000018', b: '' })
    act(() => second.result.current[2]())
    expect(second.result.current[0]).toEqual({})
    expect(sessionStorage.getItem('k1')).toBeNull()
  })
  it('keeps different screens apart', () => {
    const a = renderHook(() => useStoredValues('purchase-A'))
    act(() => a.result.current[1]({ x: '1' }))
    const b = renderHook(() => useStoredValues('purchase-B'))
    expect(b.result.current[0]).toEqual({})
  })
  it('ignores damaged saved data and survives blocked storage', () => {
    sessionStorage.setItem('bad', '{not json')
    expect(renderHook(() => useStoredValues('bad')).result.current[0]).toEqual({})
    sessionStorage.setItem('arr', '[1,2]')
    expect(renderHook(() => useStoredValues('arr')).result.current[0]).toEqual({})
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    const hook = renderHook(() => useStoredValues('blocked'))
    expect(() => act(() => hook.result.current[1]({ q: 'v' }))).not.toThrow()
    expect(hook.result.current[0]).toEqual({ q: 'v' })
    vi.restoreAllMocks()
  })
})
