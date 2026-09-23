/**
 * Races a promise against a timeout, rejecting with a distinguishable
 * TimeoutError if the timeout wins. Note the real caveat this can't fix:
 * a synchronous native call (sharp's decode) keeps running on Node's
 * single thread even after this "gives up" on it — this bounds the HTTP
 * response path (the request fails fast instead of hanging indefinitely),
 * it does not actually cancel the underlying work.
 */
export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}
