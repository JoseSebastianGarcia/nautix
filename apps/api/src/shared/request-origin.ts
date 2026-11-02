/**
 * True when an `Origin` header names the same host the request was sent to. A header that is not a URL
 * (browsers send `Origin: null` from sandboxed frames and local files) never matches: it is a refusal,
 * not an exception.
 */
export const sameOrigin = (origin: string, host: string | undefined): boolean => {
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
};
