import { Text } from "ink";
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

export interface JobIndicatorProps {
  readonly jobs: readonly Job[];
}

function JobIndicatorComponent({ jobs }: JobIndicatorProps) {
  const first = jobs[0];
  if (first === undefined) return null;

  const others = jobs.length - 1;

  return (
    <Text>
      <Spinner />
      <Text color={theme.info}> {first.title}</Text>
      <Text color={theme.muted}>
        {" "}
        {glyphs.bullet} {describeProgress(first)}
        {others > 0 ? ` (+${others})` : ""}
      </Text>
    </Text>
  );
}

export const JobIndicator = memo(JobIndicatorComponent);
