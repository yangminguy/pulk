import { Queue, Worker, QueueEvents, Job } from 'bullmq';
import { RenderJobService } from './render-job.service';

describe('RenderJob 상태 폴링 & 완료 처리 (Acceptance Criteria)', () => {
  let renderJobService: RenderJobService;
  let queue: Queue;
  let queueEvents: QueueEvents;

  beforeAll(async () => {
    // Redis 연결 정보를 환경 변수나 설정에서 가져온다고 가정
    const connection = { host: 'localhost', port: 6379 };
    
    queue = new Queue('render-job-queue', { connection });
    queueEvents = new QueueEvents('render-job-queue', { connection });
    
    // 비워주기
    await queue.obliterate({ force: true }).catch(() => {});
    
    renderJobService = new RenderJobService(queue, queueEvents);
  });

  beforeEach(async () => {
    await queue.obliterate({ force: true }).catch(() => {});
  });

  afterAll(async () => {
    await queue.close();
    await queueEvents.close();
  });

  it('[Job 등록 및 반환] RenderJob 등록 시 Job ID가 반환되며 큐에 적재된다', async () => {
    const payload = { videoId: 'video-123', resolution: '1080p' };
    const jobId = await renderJobService.createRenderJob(payload);

    expect(jobId).toBeDefined();

    const job = await queue.getJob(jobId);
    expect(job).not.toBeNull();
    expect(job?.data).toEqual(payload);
  });

  it('[Worker 비동기 처리 & 진행률 갱신/조회] Worker가 렌더링 진행률을 업데이트하면 API에서 조회할 수 있다', async () => {
    const payload = { videoId: 'video-456', resolution: '1080p' };
    const jobId = await renderJobService.createRenderJob(payload);

    // 더미 워커 생성
    const worker = new Worker('render-job-queue', async (job: Job) => {
      // 1초 간격으로 진행률 2회 업데이트 (1% -> 50% -> 100%)
      await job.updateProgress(1);
      await new Promise(resolve => setTimeout(resolve, 100));
      await job.updateProgress(50);
      await new Promise(resolve => setTimeout(resolve, 100));
      await job.updateProgress(100);
      return { status: 'success' };
    }, { connection: { host: 'localhost', port: 6379 } });

    // 워커가 job을 가져가서 50%로 업데이트할 때까지 대기
    await new Promise(resolve => setTimeout(resolve, 150));

    // Polling API 역할을 하는 서비스 메서드
    const progress = await renderJobService.getJobProgress(jobId);
    expect(progress).toBeGreaterThanOrEqual(1);
    expect(progress).toBeLessThanOrEqual(50);

    await worker.close();
  });

  it('[실시간 이벤트 수신] Job이 completed 또는 failed 될 때 이벤트를 즉시 수신한다', async () => {
    const payload = { videoId: 'video-789', resolution: '1080p' };
    const jobId = await renderJobService.createRenderJob(payload);

    // 더미 워커 생성
    const worker = new Worker('render-job-queue', async (job: Job) => {
      return { url: 'https://example.com/video-789.mp4' };
    }, { connection: { host: 'localhost', port: 6379 } });

    // 서비스가 완료 이벤트를 받는지 검증
    const completedEvent = await renderJobService.waitForJobCompletion(jobId);
    
    expect(completedEvent).toBeDefined();
    expect(completedEvent.jobId).toBe(jobId);
    expect(completedEvent.returnvalue.url).toBe('https://example.com/video-789.mp4');

    await worker.close();
  });

  it('[실시간 이벤트 수신] Job이 failed 될 때 이벤트를 즉시 수신한다', async () => {
    const payload = { videoId: 'video-fail-789', resolution: '1080p' };
    const jobId = await renderJobService.createRenderJob(payload);

    // 더미 워커 생성 (에러 발생)
    const worker = new Worker('render-job-queue', async (job: Job) => {
      throw new Error('Intentional Worker Error');
    }, { connection: { host: 'localhost', port: 6379 } });

    // 서비스가 실패 이벤트를 받아 reject 하는지 검증
    await expect(renderJobService.waitForJobCompletion(jobId)).rejects.toThrow(/Intentional Worker Error/);

    await worker.close();
  });

  it('[부하 테스트 및 DB 격리] 100개의 더미 RenderJob을 동시 등록하고 각 Job이 100회의 진행률 업데이트를 수행한다', async () => {
    const jobCount = 100;
    const updateCount = 100;
    
    // 100개의 Job 동시 등록
    const jobIds = await Promise.all(
      Array.from({ length: jobCount }).map((_, i) =>
        renderJobService.createRenderJob({ videoId: `load-${i}` })
      )
    );

    expect(jobIds).toHaveLength(jobCount);

    const worker = new Worker('render-job-queue', async (job: Job) => {
      for (let i = 1; i <= updateCount; i++) {
        await job.updateProgress(i);
        // 매우 짧은 대기 (부하 시뮬레이션)
        await new Promise(resolve => setTimeout(resolve, 1));
      }
      return { status: 'done' };
    }, { 
      connection: { host: 'localhost', port: 6379 },
      concurrency: 10 // 동시에 10개씩 처리
    });

    // 100개 Job의 완료 대기
    const results = await Promise.all(
      jobIds.map(id => renderJobService.waitForJobCompletion(id, 30_000))
    );

    expect(results).toHaveLength(jobCount);
    
    // 진행률 확인 (마지막 진행률이 100인지 샘플링해서 검증)
    const sampleProgress = await renderJobService.getJobProgress(jobIds[0]);
    expect(sampleProgress).toBe(100);

    await worker.close();
  }, 30_000); // 타임아웃 30초 설정
});
