// Pomodoro preferences: the reset threshold is "pause within the first N minutes of a block", so it
// can never exceed the block length, and the block stays within the supported range.
import { describe, expect, it } from 'vitest'
import { POMODORO_LENGTH_RANGE } from '../../src/store/useStore'
import { store } from '../support/factories'

describe('pomodoro settings', () => {
    it('shortening the block below the reset threshold pulls the threshold down with it', () => {
        store().setPomodoroLength(25)
        store().setPomodoroResetThreshold(20)
        store().setPomodoroLength(10)
        expect(store().settings).toMatchObject({ pomodoroLengthMin: 10, pomodoroResetThresholdMin: 10 })
    })

    it('a threshold below the new length is untouched', () => {
        store().setPomodoroResetThreshold(5)
        store().setPomodoroLength(15)
        expect(store().settings.pomodoroResetThresholdMin).toBe(5)
    })

    it('a threshold can never be set beyond the block, or below zero', () => {
        store().setPomodoroLength(15)
        store().setPomodoroResetThreshold(40)
        expect(store().settings.pomodoroResetThresholdMin).toBe(15)
        store().setPomodoroResetThreshold(-3)
        expect(store().settings.pomodoroResetThresholdMin).toBe(0)
    })

    it('the block length stays within the supported range, in whole minutes', () => {
        store().setPomodoroLength(500)
        expect(store().settings.pomodoroLengthMin).toBe(POMODORO_LENGTH_RANGE.max)
        store().setPomodoroLength(1)
        expect(store().settings.pomodoroLengthMin).toBe(POMODORO_LENGTH_RANGE.min)
        store().setPomodoroLength(12.6)
        expect(store().settings.pomodoroLengthMin).toBe(13)
    })

    it('ignores a non-numeric value instead of storing it', () => {
        store().setPomodoroLength(30)
        store().setPomodoroLength(Number.NaN)
        store().setPomodoroResetThreshold(Number.NaN)
        expect(store().settings).toMatchObject({ pomodoroLengthMin: 30, pomodoroResetThresholdMin: 5 })
    })

    it('focus mode defaults on and toggles (ADR 0010)', () => {
        expect(store().settings.focusMode).toBe(true)
        store().setFocusMode(false)
        expect(store().settings.focusMode).toBe(false)
    })
})
