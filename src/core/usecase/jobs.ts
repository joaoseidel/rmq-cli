import { randomUUID } from "node:crypto";
import type { OperationProgress } from "../domain/operation.ts";
import { RateEstimator } from "../util/progress.ts";
import { errorMessage } from "../util/text.ts";

export type JobState =
  | "running"
  | "cancelling"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface Job {
  readonly id: string;
  readonly kind: string;
  readonly title: string;
  readonly state: JobState;
  readonly progress: OperationProgress | null;
  readonly startedAt: number;
  readonly finishedAt: number | null;
  readonly result: string | null;
  readonly error: string | null;
  readonly remainingMs: number | null;
}

export interface JobContext {
  report(progress: OperationProgress): void;
  isCancelled(): boolean;
  throwIfCancelled(): void;
}

export class JobCancelled extends Error {
  constructor() {
    super("Cancelled");
    this.name = "JobCancelled";
  }
}

export interface JobSpec {
  readonly kind: string;
  readonly title: string;
  run(context: JobContext): Promise<string>;
}

interface JobEntry {
  job: Job;
  cancelled: boolean;
  readonly estimator: RateEstimator;
}

export function isActive(job: Job): boolean {
  return job.state === "running" || job.state === "cancelling";
}

export class JobManager {
  private readonly entries = new Map<string, JobEntry>();
  private readonly listeners = new Set<() => void>();
  private snapshot: readonly Job[] = [];
  private now: () => number = Date.now;

  useClock(now: () => number): void {
    this.now = now;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  list(): readonly Job[] {
    return this.snapshot;
  }

  active(): readonly Job[] {
    return this.snapshot.filter(isActive);
  }

  get(id: string): Job | null {
    return this.entries.get(id)?.job ?? null;
  }

  start(spec: JobSpec): string {
    const id = randomUUID();
    const startedAt = this.now();

    const entry: JobEntry = {
      cancelled: false,
      estimator: new RateEstimator(),
      job: {
        id,
        kind: spec.kind,
        title: spec.title,
        state: "running",
        progress: null,
        startedAt,
        finishedAt: null,
        result: null,
        error: null,
        remainingMs: null,
      },
    };

    this.entries.set(id, entry);
    this.publish();

    const context: JobContext = {
      isCancelled: () => entry.cancelled,
      throwIfCancelled: () => {
        if (entry.cancelled) throw new JobCancelled();
      },
      report: (progress) => {
        const at = this.now();
        entry.estimator.observe(progress.done, at);
        this.patch(id, {
          progress,
          remainingMs: entry.estimator.remainingMs(progress.done, progress.total),
        });
      },
    };

    queueMicrotask(() => void this.execute(id, entry, spec, context));
    return id;
  }

  private async execute(
    id: string,
    entry: JobEntry,
    spec: JobSpec,
    context: JobContext,
  ): Promise<void> {
    try {
      const result = await spec.run(context);
      this.patch(id, {
        state: entry.cancelled ? "cancelled" : "succeeded",
        result,
        finishedAt: this.now(),
        remainingMs: null,
      });
    } catch (error) {
      const cancelled = error instanceof JobCancelled || entry.cancelled;
      this.patch(id, {
        state: cancelled ? "cancelled" : "failed",
        error: cancelled ? null : errorMessage(error),
        finishedAt: this.now(),
        remainingMs: null,
      });
    }
  }

  cancel(id: string): void {
    const entry = this.entries.get(id);
    if (entry === undefined || !isActive(entry.job)) return;

    entry.cancelled = true;
    this.patch(id, { state: "cancelling" });
  }

  cancelAll(): void {
    for (const job of this.active()) this.cancel(job.id);
  }

  dismiss(id: string): void {
    const entry = this.entries.get(id);
    if (entry === undefined || isActive(entry.job)) return;

    this.entries.delete(id);
    this.publish();
  }

  dismissFinished(): void {
    for (const [id, entry] of this.entries) {
      if (!isActive(entry.job)) this.entries.delete(id);
    }
    this.publish();
  }

  private patch(id: string, changes: Partial<Job>): void {
    const entry = this.entries.get(id);
    if (entry === undefined) return;

    entry.job = { ...entry.job, ...changes };
    this.publish();
  }

  private publish(): void {
    this.snapshot = [...this.entries.values()]
      .map((entry) => entry.job)
      .sort((left, right) => right.startedAt - left.startedAt);

    for (const listener of this.listeners) listener();
  }
}
