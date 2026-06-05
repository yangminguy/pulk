import { Queue, QueueEvents } from 'bullmq';

export class RenderJobService {
  constructor(
    private readonly queue: Queue,
    private readonly queueEvents: QueueEvents,
  ) {}

  async createRenderJob(payload: Record<string, unknown>): Promise<string> {
    const job = await this.queue.add('render', payload);
    return job.id!;
  }

  async getJobProgress(jobId: string): Promise<number> {
    const job = await this.queue.getJob(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);
    return typeof job.progress === 'number' ? job.progress : 0;
  }

  async waitForJobCompletion(
    jobId: string,
    timeout = 10_000,
  ): Promise<{ jobId: string; returnvalue: any }> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.queueEvents.off('completed', onCompleted);
        this.queueEvents.off('failed', onFailed);
        reject(new Error(`Timeout waiting for job ${jobId}`));
      }, timeout);

      const onCompleted = (args: { jobId: string; returnvalue: string }) => {
        if (args.jobId === jobId) {
          clearTimeout(timer);
          this.queueEvents.off('completed', onCompleted);
          this.queueEvents.off('failed', onFailed);
          const rv = args.returnvalue;
          resolve({
            jobId: args.jobId,
            returnvalue: typeof rv === 'string' ? JSON.parse(rv) : rv,
          });
        }
      };

      const onFailed = (args: { jobId: string; failedReason: string }) => {
        if (args.jobId === jobId) {
          clearTimeout(timer);
          this.queueEvents.off('completed', onCompleted);
          this.queueEvents.off('failed', onFailed);
          reject(new Error(`Job ${jobId} failed: ${args.failedReason}`));
        }
      };

      this.queueEvents.on('completed', onCompleted);
      this.queueEvents.on('failed', onFailed);
    });
  }
}
