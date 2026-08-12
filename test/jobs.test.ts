import { describe, expect, it } from "vitest";
import { JobManager, isActive, type Job } from "../src/core/usecase/jobs.ts";
import { formatDuration, progressBar } from "../src/core/util/progress.ts";

function settled(manager: JobManager, id: string): Promise<Job> {
  return new Promise((resolve) => {
    const check = () => {
      const job = manager.get(id);
      if (job !== null && !isActive(job)) {
        unsubscribe();
        resolve(job);
      }
    };
    const unsubscribe = manager.subscribe(check);
    check();
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("running work in the background", () => {
  it("reports a job as running before it finishes", async () => {
    const manager = new JobManager();
    const gate = deferred<string>();

    const id = manager.start({
      kind: "move",
      title: "Moving 3 messages",
      run: () => gate.promise,
    });

    expect(manager.get(id)?.state).toBe("running");
    expect(manager.active()).toHaveLength(1);

    gate.resolve("Moved 3 messages.");
    const job = await settled(manager, id);

    expect(job.state).toBe("succeeded");
    expect(job.result).toBe("Moved 3 messages.");
    expect(manager.active()).toHaveLength(0);
  });

  it("keeps progress in the order it was reported", async () => {
    const manager = new JobManager();
    const seen: string[] = [];

    const id = manager.start({
      kind: "move",
      title: "Moving",
      run: async (context) => {
        for (const step of [1, 2, 3]) {
          context.report({ phase: "Repositioning", done: step, total: 3 });
          seen.push(`${manager.get(id)?.progress?.done ?? 0}/3`);
        }
        return "done";
      },
    });

    await settled(manager, id);
    expect(seen).toEqual(["1/3", "2/3", "3/3"]);
  });

  it("records a failure without taking down the manager", async () => {
    const manager = new JobManager();

    const id = manager.start({
      kind: "purge",
      title: "Purging",
      run: async () => {
        throw new Error("broker refused");
      },
    });

    const job = await settled(manager, id);
    expect(job.state).toBe("failed");
    expect(job.error).toBe("broker refused");
  });

  it("cancels a job that checks for cancellation", async () => {
    const manager = new JobManager();
    const started = deferred<void>();
    const release = deferred<void>();

    const id = manager.start({
      kind: "move",
      title: "Moving",
      run: async (context) => {
        started.resolve();
        await release.promise;
        context.throwIfCancelled();
        return "unreachable";
      },
    });

    await started.promise;
    manager.cancel(id);
    expect(manager.get(id)?.state).toBe("cancelling");

    release.resolve();
    const job = await settled(manager, id);

    expect(job.state).toBe("cancelled");
    expect(job.error).toBeNull();
  });

  it("runs several jobs at once", async () => {
    const manager = new JobManager();
    const gates = [deferred<string>(), deferred<string>(), deferred<string>()];

    const ids = gates.map((gate, index) =>
      manager.start({
        kind: "move",
        title: `Job ${index}`,
        run: () => gate.promise,
      }),
    );

    expect(manager.active()).toHaveLength(3);

    gates[1]!.resolve("second");
    await settled(manager, ids[1]!);
    expect(manager.active()).toHaveLength(2);

    gates[0]!.resolve("first");
    gates[2]!.resolve("third");
    await Promise.all([settled(manager, ids[0]!), settled(manager, ids[2]!)]);

    expect(manager.active()).toHaveLength(0);
    expect(manager.list().map((job) => job.result)).toContain("second");
  });

  it("estimates the time left from the rate it observes", async () => {
    const manager = new JobManager();
    let clock = 0;
    manager.useClock(() => clock);

    const id = manager.start({
      kind: "move",
      title: "Moving",
      run: async (context) => {
        for (let done = 1; done <= 5; done += 1) {
          clock += 100;
          context.report({ phase: "Repositioning", done, total: 100 });
        }
        return "done";
      },
    });

    await settled(manager, id);
    expect(manager.get(id)?.remainingMs).toBeNull();
  });

  it("only forgets jobs that have finished", async () => {
    const manager = new JobManager();
    const gate = deferred<string>();

    const running = manager.start({
      kind: "move",
      title: "Running",
      run: () => gate.promise,
    });
    const done = manager.start({
      kind: "move",
      title: "Done",
      run: async () => "ok",
    });
    await settled(manager, done);

    manager.dismiss(running);
    expect(manager.get(running)).not.toBeNull();

    manager.dismiss(done);
    expect(manager.get(done)).toBeNull();

    gate.resolve("finished");
    await settled(manager, running);
  });
});

describe("describing progress", () => {
  it("formats a duration the way a footer needs it", () => {
    expect(formatDuration(4_000)).toBe("4s");
    expect(formatDuration(90_000)).toBe("1m 30s");
    expect(formatDuration(120_000)).toBe("2m");
    expect(formatDuration(3_900_000)).toBe("1h 5m");
  });

  it("draws a bar that always fills the width it is given", () => {
    expect(progressBar(0, 10, 8)).toHaveLength(8);
    expect(progressBar(5, 10, 8)).toBe("████░░░░");
    expect(progressBar(10, 10, 8)).toBe("████████");
  });
});
