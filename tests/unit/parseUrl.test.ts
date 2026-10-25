import { describe, expect, it } from 'vitest'
import { extractVideoId, parseYouTubeInput } from '../../src/lib/parseUrl'

const ID = 'dQw4w9WgXcQ'
const LIST = 'PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf'

describe('parseYouTubeInput', () => {
    it.each([
        [`https://www.youtube.com/watch?v=${ID}`],
        [`https://youtube.com/watch?v=${ID}&t=42s`],
        [`https://m.youtube.com/watch?v=${ID}`],
        [`https://music.youtube.com/watch?v=${ID}`],
        [`https://youtu.be/${ID}?si=share`],
        [`https://www.youtube.com/shorts/${ID}`],
        [`https://www.youtube.com/embed/${ID}`],
        [`https://www.youtube.com/live/${ID}`],
        [`https://www.youtube-nocookie.com/embed/${ID}`],
        [`youtube.com/watch?v=${ID}`],
        [`  ${ID}  `],
    ])('%s → video', (input) => {
        expect(parseYouTubeInput(input)).toEqual({ kind: 'video', videoId: ID })
    })

    it.each([
        [`https://www.youtube.com/playlist?list=${LIST}`],
        [`https://www.youtube.com/watch?v=${ID}&list=${LIST}`], // playlist wins over the video
        [LIST],
        ['UUabcdefghij123'],
    ])('%s → playlist', (input) => {
        expect(parseYouTubeInput(input).kind).toBe('playlist')
    })

    it('ignores auto-generated radio mixes when a video is present', () => {
        expect(parseYouTubeInput(`https://www.youtube.com/watch?v=${ID}&list=RD${ID}`)).toEqual({
            kind: 'video',
            videoId: ID,
        })
    })

    it.each([[''], ['   '], ['not a url at all'], [`https://example.com/watch?v=${ID}`], ['https://www.youtube.com/']])(
        '%j → unknown',
        (input) => {
            expect(parseYouTubeInput(input)).toEqual({ kind: 'unknown' })
        },
    )
})

describe('extractVideoId', () => {
    it('finds the video even when the URL also names a playlist', () => {
        expect(extractVideoId(`https://www.youtube.com/watch?v=${ID}&list=${LIST}&index=3`)).toBe(ID)
    })

    it.each([[`https://youtu.be/${ID}`], [`https://www.youtube.com/shorts/${ID}`], [ID]])('%s', (input) => {
        expect(extractVideoId(input)).toBe(ID)
    })

    it.each([[`https://www.youtube.com/playlist?list=${LIST}`], [LIST], ['https://example.com'], ['']])(
        '%j has no video',
        (input) => {
            expect(extractVideoId(input)).toBeNull()
        },
    )
})
