import { EventEmitter } from 'events';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type JobStatus = 'pending' | 'running' | 'done' | 'failed';

export interface JobPage {
  index: number;
  image: string;          // base64 data URL
  text: string;
  status: 'completed' | 'error';
}

export interface Job {
  id: string;
  userId: string;
  status: JobStatus;
  message: string;
  pages: JobPage[];
  coverImage: string | null;
  error: string | null;
  createdAt: number;
  /** Subscribers listen to this emitter for SSE events. */
  emitter: EventEmitter;
}

// ─── Concurrent Queue ──────────────────────────────────────────────────────────
// Limits the number of concurrent Gemini API calls across all users.

class ConcurrentQueue {
  private running = 0;
  private readonly pending: Array<() => void> = [];

  constructor(private readonly concurrency: number) {}

  run<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const task = () => {
        this.running++;
        fn()
          .then(resolve, reject)
          .finally(() => {
            this.running--;
            this.flush();
          });
      };

      if (this.running < this.concurrency) {
        task();
      } else {
        this.pending.push(task);
      }
    });
  }

  private flush() {
    while (this.running < this.concurrency && this.pending.length > 0) {
      const next = this.pending.shift();
      if (next) next();
    }
  }

  get queueLength() {
    return this.pending.length;
  }

  get activeCount() {
    return this.running;
  }
}

// ─── Shared queue instance (max 5 simultaneous Gemini API calls) ───────────────
export const geminiQueue = new ConcurrentQueue(5);

// ─── In-memory Job Store ───────────────────────────────────────────────────────

const JOB_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

const jobs = new Map<string, Job>();

// Purge completed/failed jobs older than TTL every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, job] of jobs.entries()) {
    if (
      (job.status === 'done' || job.status === 'failed') &&
      now - job.createdAt > JOB_TTL_MS
    ) {
      jobs.delete(id);
    }
  }
}, 30 * 60 * 1000).unref(); // .unref() so this timer doesn't block process exit

export const createJob = (userId: string): Job => {
  const job: Job = {
    id: crypto.randomUUID(),
    userId,
    status: 'pending',
    message: 'Queued',
    pages: [],
    coverImage: null,
    error: null,
    createdAt: Date.now(),
    emitter: new EventEmitter(),
  };
  // Allow many SSE listeners without Node.js memory leak warnings
  job.emitter.setMaxListeners(50);
  jobs.set(job.id, job);
  return job;
};

export const getJob = (jobId: string): Job | undefined => jobs.get(jobId);
