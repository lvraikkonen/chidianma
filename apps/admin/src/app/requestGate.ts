export function createRequestGate() {
  let generation = 0;
  return {
    begin(): number {
      generation += 1;
      return generation;
    },
    isCurrent(candidate: number): boolean {
      return candidate === generation;
    },
    invalidate(): void {
      generation += 1;
    }
  };
}
