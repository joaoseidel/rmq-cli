import { Box, Text } from "ink";
import { isActive as jobIsActive, type Job } from "../../../core/usecase/jobs.ts";
import { formatDuration } from "../../../core/util/progress.ts";
import { useListNavigation } from "../../hooks/use-list-navigation.ts";
import { useScreenKeys } from "../../hooks/use-screen-keys.ts";
import { glyphs, theme } from "../../theme.ts";
import { describeProgress, ProgressBar } from "../parts/job-progress.tsx";
import { StatusMessage } from "../parts/status-message.tsx";

const BAR_WIDTH = 24;

export interface JobsScreenProps {
  readonly jobs: readonly Job[];
  readonly onCancel: (id: string) => void;
  readonly onDismiss: (id: string) => void;
  readonly onClear: () => void;
  readonly width: number;
  readonly height: number;
  readonly isActive: boolean;
}

function toneFor(job: Job): string {
  if (job.state === "failed") return theme.danger;
  if (job.state === "cancelled") return theme.warning;
  if (job.state === "succeeded") return theme.success;
  return theme.info;
}

function statusFor(job: Job, now: number): string {
  if (job.state === "running") return describeProgress(job);
  if (job.state === "cancelling") return "stopping…";

  const took = formatDuration((job.finishedAt ?? now) - job.startedAt);
  if (job.state === "failed") return `failed after ${took}: ${job.error ?? ""}`;
  if (job.state === "cancelled") return `cancelled after ${took}`;
  return `${job.result ?? "done"} (${took})`;
}

export function JobsScreen({
  jobs,
  onCancel,
  onDismiss,
  onClear,
  width,
  height,
  isActive,
}: JobsScreenProps) {
  const navigation = useListNavigation({
    itemCount: jobs.length,
    pageSize: Math.max(1, Math.floor((height - 2) / 2)),
    isActive,
  });

  const selected = jobs[navigation.selectedIndex];

  useScreenKeys("jobs", () => {}, {
    isActive,
    local: {
      x: () => {
        if (selected !== undefined && jobIsActive(selected)) onCancel(selected.id);
      },
      d: () => {
        if (selected !== undefined && !jobIsActive(selected)) onDismiss(selected.id);
      },
      c: onClear,
    },
  });

  if (jobs.length === 0) {
    return (
      <Box flexDirection="column">
        <StatusMessage tone="muted">Nothing is running.</StatusMessage>
        <Text color={theme.muted}>
          Moves, transfers, purges and recoveries appear here while they work.
        </Text>
      </Box>
    );
  }

  const now = Date.now();
  const [start, end] = navigation.visibleRange;
  const barWidth = Math.max(8, Math.min(BAR_WIDTH, width - 40));

  return (
    <Box flexDirection="column">
      {jobs.slice(start, end).map((job, index) => {
        const isCursor = start + index === navigation.selectedIndex;

        return (
          <Box key={job.id} flexDirection="column">
            <Text>
              <Text color={isCursor ? theme.info : theme.muted}>
                {isCursor ? glyphs.cursor : " "}{" "}
              </Text>
              <Text bold={isCursor} color={toneFor(job)}>
                {job.title}
              </Text>
            </Text>
            <Text>
              {"    "}
              {job.progress === null ? null : (
                <>
                  <ProgressBar
                    done={job.progress.done}
                    total={job.progress.total}
                    width={barWidth}
                  />
                  <Text> </Text>
                </>
              )}
              <Text color={theme.muted}>{statusFor(job, now)}</Text>
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
