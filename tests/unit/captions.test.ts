import { describe, expect, it } from 'vitest'
import { activeLineIndex, parseCaptionFile, parseVtt } from '../../src/lib/captions'

describe('parseVtt', () => {
    it('parses WebVTT, skipping the header, NOTE blocks, cue ids and cue settings', () => {
        const vtt = [
            'WEBVTT',
            '',
            'NOTE exported from Studio',
            '',
            'intro',
            '00:00:01.500 --> 00:00:04.000 align:start position:10%',
            'Hello <c.yellow>there</c>',
            '',
            '01:02:03.250 --> 01:02:05.000',
            '<v Speaker>Much later</v>',
            '  spanning   lines',
        ].join('\n')
        expect(parseVtt(vtt)).toEqual([
            { startSec: 1.5, text: 'Hello there' },
            { startSec: 3723.25, text: 'Much later spanning lines' },
        ])
    })

    it('parses SubRip with comma milliseconds and CRLF line endings', () => {
        const srt = '1\r\n00:00:02,000 --> 00:00:03,000\r\nFirst\r\n\r\n2\r\n00:01:00,500 --> 00:01:02,000\r\nSecond\r\n'
        expect(parseCaptionFile(srt)).toEqual([
            { startSec: 2, text: 'First' },
            { startSec: 60.5, text: 'Second' },
        ])
    })

    it('drops consecutive duplicate lines (rolling ASR captions) and empty cues', () => {
        const vtt = [
            'WEBVTT',
            '',
            '00:01.000 --> 00:02.000',
            'same',
            '',
            '00:02.000 --> 00:03.000',
            'same',
            '',
            '00:03.000 --> 00:04.000',
            '<c></c>',
            '',
            '00:04.000 --> 00:05.000',
            'next',
        ].join('\n')
        expect(parseVtt(vtt)).toEqual([
            { startSec: 1, text: 'same' },
            { startSec: 4, text: 'next' },
        ])
    })

    it('returns nothing for a file with no cues', () => {
        expect(parseVtt('')).toEqual([])
        expect(parseVtt('just some text\nwith no timings')).toEqual([])
    })
})

describe('activeLineIndex', () => {
    const lines = [
        { startSec: 1, text: 'a' },
        { startSec: 5, text: 'b' },
        { startSec: 9, text: 'c' },
    ]

    it('is the last line that has started (with a 0.25s lead)', () => {
        expect(activeLineIndex(lines, 0)).toBe(-1)
        expect(activeLineIndex(lines, 0.8)).toBe(0)
        expect(activeLineIndex(lines, 4.9)).toBe(1)
        expect(activeLineIndex(lines, 100)).toBe(2)
        expect(activeLineIndex([], 3)).toBe(-1)
    })
})
