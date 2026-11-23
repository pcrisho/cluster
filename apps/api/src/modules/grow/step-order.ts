interface Positioned {
  id: string;
  position: number;
  required: boolean;
}

/** A course's steps in the order a learner meets them: by section, then by position. */
export function orderSteps<T extends Positioned>(
  sections: { position: number; steps: T[] }[],
): T[] {
  return [...sections]
    .sort((a, b) => a.position - b.position)
    .flatMap((s) => [...s.steps].sort((a, b) => a.position - b.position));
}

/** In a sequential course, the earliest required step before `stepId` that is not done; optional steps never block. */
export function blockingStep<T extends Positioned>(
  ordered: T[],
  done: Set<string>,
  stepId: string,
  sequential: boolean,
): T | null {
  if (!sequential) return null;
  const index = ordered.findIndex((s) => s.id === stepId);
  return (
    ordered
      .slice(0, Math.max(index, 0))
      .find((s) => s.required && !done.has(s.id)) ?? null
  );
}

/** Required steps done out of all required steps. */
export function progressOf(ordered: Positioned[], done: Set<string>) {
  const required = ordered.filter((s) => s.required);
  return {
    done: required.filter((s) => done.has(s.id)).length,
    total: required.length,
  };
}

/** Where "Continue" goes: the first step not done. */
export function nextStep<T extends Positioned>(
  ordered: T[],
  done: Set<string>,
): T | null {
  return ordered.find((s) => !done.has(s.id)) ?? null;
}
