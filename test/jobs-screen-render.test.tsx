import { render } from "ink-testing-library";
import { describe, expect, it } from "vitest";
import type { Job } from "../src/core/usecase/jobs.ts";
import { JobsScreen } from "../src/ui/components/screens/jobs-screen.tsx";

const job = (over: Partial<Job> = {}): Job => ({
  id: "abc12345", kind: "move", title: "Moving 5 messages to users.events",
  state: "running", progress: { phase: "Repositioning", done: 412, total: 1204 },
  startedAt: Date.now() - 5000, finishedAt: null, result: null, error: null,
  remainingMs: 18_000, ...over,
});

describe("the jobs screen renders every job state", () => {
  for (const [label, j] of [
    ["running", job()],
    ["cancelling", job({ state: "cancelling" })],
    ["succeeded", job({ state: "succeeded", finishedAt: Date.now(), result: "Moved 5 messages.", progress: null })],
    ["failed", job({ state: "failed", finishedAt: Date.now(), error: "broker refused\nwith a newline", progress: null })],
    ["cancelled", job({ state: "cancelled", finishedAt: Date.now(), progress: null })],
    ["no progress yet", job({ progress: null })],
  ] as const) {
    it(`renders a ${label} job`, () => {
      const { lastFrame, unmount } = render(
        <JobsScreen jobs={[j]} onCancel={() => {}} onDismiss={() => {}}
          onClear={() => {}} width={100} height={20} isActive />,
      );
      const frame = lastFrame() ?? "";
      expect(frame).toContain("Moving 5 messages");
      expect(frame.split("\n").length).toBeLessThanOrEqual(20);
      unmount();
    });
  }

  it("renders an empty list", () => {
    const { lastFrame, unmount } = render(
      <JobsScreen jobs={[]} onCancel={() => {}} onDismiss={() => {}}
        onClear={() => {}} width={100} height={20} isActive />,
    );
    expect(lastFrame()).toContain("Nothing is running");
    unmount();
  });
});
