/**
 * Asynchronous Background Job Queue & Retention Scheduler
 * Handles non-blocking tasks (report generation, backup expiration sweeps, audit archival)
 * with bounded concurrency and exponential backoff retries.
 */
export interface JobItem {
  id: string;
  name: string;
  payload?: any;
  attempts: number;
  maxAttempts: number;
  run: () => Promise<void>;
}

export class JobQueue {
  private readonly queue: JobItem[] = [];
  private activeCount = 0;
  private readonly concurrency: number;
  public completedCount = 0;
  public failedCount = 0;
  public deadLetterCount = 0;

  constructor(concurrency = 4) {
    this.concurrency = concurrency;
  }

  public enqueue(name: string, run: () => Promise<void>, maxAttempts = 3): string {
    const id = `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    this.queue.push({ id, name, attempts: 0, maxAttempts, run });
    this.drain();
    return id;
  }

  private drain(): void {
    while (this.activeCount < this.concurrency && this.queue.length > 0) {
      const job = this.queue.shift()!;
      this.activeCount++;
      this.executeJob(job);
    }
  }

  private async executeJob(job: JobItem): Promise<void> {
    job.attempts++;
    try {
      await job.run();
      this.completedCount++;
    } catch {
      if (job.attempts < job.maxAttempts) {
        const delayMs = Math.min(2000, 100 * Math.pow(2, job.attempts));
        const retryTimer = setTimeout(() => {
          this.queue.push(job);
          this.drain();
        }, delayMs);
        if (retryTimer.unref) retryTimer.unref();
      } else {
        this.failedCount++;
        this.deadLetterCount++;
      }
    } finally {
      this.activeCount--;
      this.drain();
    }
  }

  public stats() {
    return {
      queued: this.queue.length,
      active: this.activeCount,
      concurrency: this.concurrency,
      completed: this.completedCount,
      failed: this.failedCount,
      deadLetter: this.deadLetterCount,
    };
  }
}

export const jobQueue = new JobQueue(4);
