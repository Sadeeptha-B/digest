import { describe, expect, it } from 'vitest'
import { fmt, hmsToSeconds, timeAgo } from '../../src/lib/time'

describe('fmt', () => {
    it.each([
        [0, '0:00'],
        [5.9, '0:05'],
        [65, '1:05'],
        [3599, '59:59'],
        [3600, '1:00:00'],
        [3725, '1:02:05'],
        [-10, '0:00'],
    ])('%s → %s', (sec, out) => {
        expect(fmt(sec)).toBe(out)
    })
})

describe('timeAgo', () => {
    const now = 1_000_000_000
    it.each([
        [0, 'just now'],
        [44, 'just now'],
        [45, '1m ago'],
        [59 * 60, '59m ago'],
        [90 * 60, '2h ago'],
        [23 * 3600, '23h ago'],
        [36 * 3600, '2d ago'],
        [-60, 'just now'], // clock skew: a future timestamp
    ])('%ss ago → %s', (agoSec, out) => {
        expect(timeAgo(now - agoSec * 1000, now)).toBe(out)
    })
})

describe('hmsToSeconds', () => {
    it.each([
        ['01:23', 83],
        ['1:02:03', 3723],
        [' 00:07 ', 7],
    ])('%s → %s', (ts, out) => {
        expect(hmsToSeconds(ts)).toBe(out)
    })

    it.each([['83'], ['1:2:3:4'], ['ab:cd'], ['']])('%j is not a time code', (ts) => {
        expect(hmsToSeconds(ts)).toBeNull()
    })
})
