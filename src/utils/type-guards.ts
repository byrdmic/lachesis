/**
 * Exhaustiveness check helper for switch statements.
 * TypeScript will error at compile time if not all cases are handled.
 *
 * @example
 * switch (state.step) {
 *   case 'loading': return <Loading />
 *   case 'ready': return <Ready />
 *   default: return assertNever(state)
 * }
 */
export function assertNever(x: never): never {
  throw new Error(`Unhandled discriminated union member: ${JSON.stringify(x)}`)
}
