import { Box, Text } from "ink";
import { memo } from "react";
import type { Job } from "../../../core/usecase/jobs.ts";
import { formatDuration, progressBar } from "../../../core/util/progress.ts";
import { glyphs, theme } from "../../theme.ts";
import { Spinner } from "./spinner.tsx";

export function describeProgress(job: Job): string {
  const { progress } = job;
  if (progress === null) return "starting…";

  const counted = `${progress.done.toLocaleString()}/${progress.total.toLocaleString()}`;
  const left =
    job.remainingMs === null ? "" : ` ${glyphs.bullet} ~${formatDuration(job.remainingMs)} left`;

  return `${progress.phase.toLowerCase()} ${counted}${left}`;
}

export interface ProgressBarProps {
  readonly done: number;
  readonly total: number;
  readonly width: number;
}

function ProgressBarComponent({ done, total, width }: ProgressBarProps) {
  return <Text color={theme.info}>{progressBar(done, total, width)}</Text>;
}

export const ProgressBar = memo(ProgressBarComponent);

export const JOBS_PANEL_MAX_ROWS = 2;

export function jobsPanelLines(running: number): number {
  if (running === 0) return 0;
  return Math.min(running, JOBS_PANEL_MAX_ROWS) + (running > JOBS_PANEL_MAX_ROWS ? 1 : 0);
}

export interface JobsPanelProps {
  readonly jobs: readonly Job[];
  readonly width: number;
}

function JobsPanelComponent({ jobs, width }: JobsPanelProps) {
  if (jobs.length === 0) return null;

  const shown = jobs.slice(0, JOBS_PANEL_MAX_ROWS);
  const hidden = jobs.length - shown.length;
  const barWidth = Math.max(6, Math.min(16, width - 56));

  return (
    <Box flexDirection="column" width={width}>
      {shown.map((job) => (
        <Text key={job.id} wrap="truncate-end">
          <Spinner />
          <Text color={theme.info}> {job.title}</Text>
          {job.progress === null ? null : (
            <>
              <Text> </Text>
              <ProgressBar
                done={job.progress.done}
                total={job.progress.total}
                width={barWidth}
              />
            </>
          )}
          <Text color={theme.muted}>
            {" "}
            {glyphs.bullet} {describeProgress(job)}
          </Text>
        </Text>
      ))}

      {hidden === 0 ? null : (
        <Text color={theme.muted} wrap="truncate-end">
          {`  ${hidden} more ${hidden === 1 ? "job" : "jobs"} running. J to see them.`}
        </Text>
      )}
    </Box>
  );
}

export const JobsPanel = memo(JobsPanelComponent);
