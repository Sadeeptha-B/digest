import { describe, expect, it, vi } from 'vitest'
import { pickTagline, timeGreeting } from '../../src/lib/greeting'

// June 2026: the 1st is a Monday, the 3rd a Wednesday.
const at = (day: number, hour: number) => new Date(2026, 5, day, hour, 30)

describe('timeGreeting', () => {
    it.each([
        [0, 'Burning the midnight oil'],
        [4, 'Burning the midnight oil'],
        [5, 'Good morning'],
        [11, 'Good morning'],
        [12, 'Good afternoon'],
        [16, 'Good afternoon'],
        [17, 'Good evening'],
        [20, 'Good evening'],
        [21, 'Winding down'],
    ])('%s:30 → %s', (hour, greeting) => {
        expect(timeGreeting(at(3, hour))).toBe(greeting)
    })
})

describe('pickTagline', () => {
    it('uses a contextual line (e.g. the unwatched count) when the dice favour context', () => {
        vi.spyOn(Math, 'random').mockReturnValueOnce(0.1).mockReturnValueOnce(0.99)
        // Wednesday afternoon: the only context is the unwatched count.
        expect(pickTagline(at(3, 14), 1)).toBe('1 video waiting for your focus.')
    })

    it('pluralises the unwatched count', () => {
        vi.spyOn(Math, 'random').mockReturnValueOnce(0.1).mockReturnValueOnce(0.99)
        expect(pickTagline(at(3, 14), 4)).toBe('4 videos waiting for your focus.')
    })

    it('falls back to a general line otherwise', () => {
        vi.spyOn(Math, 'random').mockReturnValueOnce(0.9).mockReturnValueOnce(0)
        expect(pickTagline(at(1, 8), 3)).toBe('Pick one thing. Go deep.')
    })

    it('uses the general pool when nothing contextual applies', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0)
        expect(pickTagline(at(3, 14), 0)).toBe('Pick one thing. Go deep.')
    })
})
