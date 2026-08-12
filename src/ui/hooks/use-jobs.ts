import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import type { Job, JobManager } from "../../core/usecase/jobs.ts";
import { isActive } from "../../core/usecase/jobs.ts";

export function useJobs(manager: JobManager): readonly Job[] {
  const subscribe = useCallback(
    (listener: () => void) => manager.subscribe(listener),
    [manager],
  );

  return useSyncExternalStore(
    subscribe,
    () => manager.list(),
    () => manager.list(),
  );
}

export function useJobCompletions(
  jobs: readonly Job[],
  onFinished: (job: Job) => void,
): void {
  const seen = useRef(new Set<string>());
  const handler = useRef(onFinished);
  handler.current = onFinished;

  useEffect(() => {
    for (const job of jobs) {
      if (isActive(job) || seen.current.has(job.id)) continue;
      seen.current.add(job.id);
      handler.current(job);
    }
  }, [jobs]);
}
