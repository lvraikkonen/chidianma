import type * as React from "react";

// Run real component bodies/effects without a DOM dependency. SSR outside a
// harness render still uses React's real hooks. Event handlers are the returned
// production handlers; asynchronous work is flushed between explicit renders.
let current: HookHarness<unknown> | undefined;
type Slot = { value?: unknown; deps?: React.DependencyList | undefined; cleanup?: (() => void) | undefined };

export function harnessHooks(real: typeof React) {
  return {
    useState: (initial?: unknown) => current ? current.state(initial) : real.useState(initial),
    useRef: (initial?: unknown) => current ? current.memo(() => ({ current: initial }), []) : real.useRef(initial),
    useMemo: (factory: () => unknown, deps: React.DependencyList) => current ? current.memo(factory, deps) : real.useMemo(factory, deps),
    useEffect: (effect: React.EffectCallback, deps?: React.DependencyList) => current ? current.effect(effect, deps) : real.useEffect(effect, deps)
  };
}

export class HookHarness<T> {
  private slots: Slot[] = [];
  private index = 0;
  private effects: Array<() => void> = [];
  private dirty = true;
  tree!: T;
  constructor(private component: () => T) {}
  private slot() { return this.slots[this.index++] ?? (this.slots[this.index - 1] = {}); }
  private changed(slot: Slot, deps?: React.DependencyList) {
    return !deps || !slot.deps || deps.length !== slot.deps.length || deps.some((value, i) => !Object.is(value, slot.deps![i]));
  }
  state(initial: unknown) {
    const slot = this.slot();
    if (!("value" in slot)) slot.value = typeof initial === "function" ? initial() : initial;
    return [slot.value, (next: unknown) => {
      const value = typeof next === "function" ? next(slot.value) : next;
      if (!Object.is(value, slot.value)) { slot.value = value; this.dirty = true; }
    }];
  }
  memo(factory: () => unknown, deps: React.DependencyList) {
    const slot = this.slot();
    if (this.changed(slot, deps)) { slot.value = factory(); slot.deps = deps; }
    return slot.value;
  }
  effect(effect: React.EffectCallback, deps?: React.DependencyList) {
    const slot = this.slot();
    if (!this.changed(slot, deps)) return;
    slot.deps = deps;
    this.effects.push(() => { slot.cleanup?.(); slot.cleanup = effect() || undefined; });
  }
  render() {
    this.index = 0;
    this.dirty = false;
    current = this as HookHarness<unknown>;
    try { this.tree = this.component(); } finally { current = undefined; }
    this.effects.splice(0).forEach((effect) => effect());
    return this.tree;
  }
  async flush(turns = 30) {
    for (let i = 0; i < turns; i += 1) {
      if (this.dirty) this.render();
      await Promise.resolve();
    }
    if (this.dirty) this.render();
  }
  unmount() { this.slots.forEach((slot) => slot.cleanup?.()); }
}
