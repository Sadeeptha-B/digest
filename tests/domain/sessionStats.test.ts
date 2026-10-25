// The Stats tab's figures, replayed from a video's Pomodoro event log (src/lib/sessionStats.ts).
import { describe, expect, it } from 'vitest'
import { summarizeSession } from '../../src/lib/sessionStats'
import type { PomodoroEvent, PomodoroEventType } from '../../src/types'

const S = 1000
const ev = (type: PomodoroEventType, atSec: number, extra: Partial<PomodoroEvent> = {}): PomodoroEvent => ({
    type,
    at: atSec * S,
    ...extra,
})

describe('summarizeSession', () => {
    it('totals completed blocks, resets and breaks', () => {
        const events = [
            ev('onramp-start', 0),
            ev('work-start', 3, { index: 0 }),
            ev('pause-reset', 63, { index: 0, stretchSec: 60 }),
            ev('resume', 70),
            ev('work-start', 70, { index: 0 }),
            ev('work-complete', 1570, { index: 0, stretchSec: 1500 }),
            ev('break-start', 1570, { index: 1 }),
            ev('break-complete', 1870, { index: 1 }),
            ev('work-start', 1870, { index: 1 }),
            ev('work-complete', 2770, { index: 1, stretchSec: 900 }),
            ev('break-start', 2770),
            ev('break-skipped', 2780),
        ]
        const s = summarizeSession(events, 3000 * S)
        expect(s).toMatchObject({
            completedCount: 2,
            resets: 1,
            totalFocusSec: 2400,
            longestSec: 1500,
            breaksTaken: 1,
            breaksSkipped: 1,
            open: null,
            currentSec: 0,
        })
        expect(s.stretches.map((x) => x.kind)).toEqual(['pause-reset', 'work-complete', 'work-complete'])
    })

    it('counts the live stretch, excluding time spent held', () => {
        const events = [
            ev('work-start', 0),
            ev('pause-hold', 600),
            ev('resume', 900), // 300s held
        ]
        const s = summarizeSession(events, 1000 * S)
        expect(s).toMatchObject({ isHeld: false, currentSec: 700, longestSec: 700, completedCount: 0 })
    })

    it('freezes the live counter while held', () => {
        const events = [ev('work-start', 0), ev('pause-hold', 600)]
        expect(summarizeSession(events, 5000 * S)).toMatchObject({ isHeld: true, currentSec: 600 })
    })

    it('falls back to wall time minus holds when an old event has no stretchSec', () => {
        const events = [ev('work-start', 0), ev('pause-hold', 100), ev('resume', 160), ev('work-complete', 400)]
        expect(summarizeSession(events, 400 * S).totalFocusSec).toBe(340)
    })

    it('an interrupted session closes its open stretch at the focus time it reached', () => {
        const events = [ev('work-start', 0), ev('pause-hold', 600), ev('resume', 900), ev('interrupted', 1000, { stretchSec: 700 })]
        expect(summarizeSession(events, 100_000 * S)).toMatchObject({
            open: null,
            currentSec: 0,
            longestSec: 700,
            completedCount: 0,
            totalFocusSec: 0,
            stretches: [{ kind: 'interrupted', durationSec: 700 }],
        })
    })

    it('a new session drops a stretch left open by one that never logged its end (a reload or crash)', () => {
        // Two hours later the same video starts a fresh session; its onramp is running.
        const events = [ev('onramp-start', 0), ev('work-start', 3), ev('onramp-start', 7200)]
        // The abandoned stretch has no known end, so no duration is invented for it.
        expect(summarizeSession(events, 7201 * S)).toMatchObject({ open: null, currentSec: 0, longestSec: 0, stretches: [] })
    })

    it('is empty for no events', () => {
        expect(summarizeSession([], 0)).toMatchObject({ completedCount: 0, longestSec: 0, open: null })
    })
})
