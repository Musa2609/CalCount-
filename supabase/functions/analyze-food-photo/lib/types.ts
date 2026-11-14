/** Minimal fetch signature, injected so every network call can be stubbed in tests. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
