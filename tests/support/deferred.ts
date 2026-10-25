/**
 * A promise the test settles by hand, for answers that arrive late — a player read or a network
 * response still in flight while the user navigates, signs out or switches something off.
 */
export function deferred<T>() {
    let resolve!: (value: T) => void
    let reject!: (reason: unknown) => void
    const promise = new Promise<T>((res, rej) => {
        resolve = res
        reject = rej
    })
    return { promise, resolve, reject }
}
