export function ok(value: unknown, message: string): asserts value {
  if (!value) throw new Error(`FAIL: ${message}`);
}
export function eq<T>(a: T, b: T, message: string): void {
  if (a !== b) throw new Error(`FAIL: ${message}: expected ${String(b)}, got ${String(a)}`);
}
export async function rejects(fn: () => Promise<unknown>, re: RegExp, message: string): Promise<void> {
  try {
    await fn();
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (!re.test(m)) throw new Error(`FAIL: ${message}: wrong error: ${m}`);
    return;
  }
  throw new Error(`FAIL: ${message}: expected rejection`);
}
