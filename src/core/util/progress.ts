const SMOOTHING = 0.3;

export class RateEstimator {
  private rate = 0;
  private lastDone = 0;
  private lastAt: number | null = null;

  observe(done: number, at: number): void {
    if (this.lastAt === null) {
      this.lastDone = done;
      this.lastAt = at;
      return;
    }

    const elapsed = at - this.lastAt;
    const advanced = done - this.lastDone;
    if (elapsed <= 0 || advanced <= 0) return;

    const sample = advanced / elapsed;
    this.rate = this.rate === 0 ? sample : this.rate * (1 - SMOOTHING) + sample * SMOOTHING;
    this.lastDone = done;
    this.lastAt = at;
  }

  remainingMs(done: number, total: number): number | null {
    if (this.rate <= 0 || total <= 0 || done >= total) return null;
    return (total - done) / this.rate;
  }
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "";

  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;

  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function progressBar(done: number, total: number, width: number): string {
  const cells = Math.max(1, width);
  if (total <= 0) return "─".repeat(cells);

  const ratio = Math.min(1, Math.max(0, done / total));
  const filled = Math.round(ratio * cells);
  return "█".repeat(filled) + "░".repeat(cells - filled);
}
