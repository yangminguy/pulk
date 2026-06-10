#!/usr/bin/env node
// Live verification for CMO M5 후속 — Reporting API 노출수·CTR.
// listJobs로 reach report job 존재를 확인하고, listReports로 리포트 유무를 확인한다.
// 리포트가 아직 없으면(비동기 생성 대기) "job 등록됨, 리포트 생성 대기중"으로 정상 처리한다.
// 리포트가 있으면 1건 다운로드·파싱해 실제 노출/CTR 수신값을 출력한다.
//   pnpm --filter @l5/youtube build && node services/youtube/scripts/verify-live-reporting.mjs

import { loadCredentials, ReportingClient, parseReachReport, REACH_REPORT_TYPE } from '../dist/index.js';

const creds = loadCredentials();
const client = new ReportingClient(creds);

const jobs = await client.listJobs();
console.log(`[Reporting] channel "${creds.channel.title}" jobs (${jobs.length}):`);
for (const j of jobs) {
  console.log(`  - id=${j.id} type=${j.reportTypeId}${j.name ? ` name=${j.name}` : ''}`);
}

const reachJob = jobs.find((j) => j.reportTypeId === REACH_REPORT_TYPE);
if (!reachJob) {
  throw new Error(`reach report job(${REACH_REPORT_TYPE}) 미발견 — GCP에서 job 생성 필요`);
}
console.log(`reach job 확인: ${reachJob.id}`);

const reports = await client.listReports(reachJob.id);
console.log(`리포트 (${reports.length}):`);
if (reports.length === 0) {
  console.log('  job 등록됨, 리포트 생성 대기중 — 구글이 비동기 생성(보통 다음날 백필). 정상.');
  console.log('REPORTING LIVE OK (리포트 대기중)');
} else {
  const latest = reports.reduce((a, b) => ((a.createTime ?? '') >= (b.createTime ?? '') ? a : b));
  console.log(`  최신 리포트 id=${latest.id} createTime=${latest.createTime}`);
  const csv = await client.downloadReport(latest.downloadUrl);
  const rows = parseReachReport(csv);
  console.log(`  파싱된 행 ${rows.length}건. 헤더: ${csv.split(/\r?\n/)[0]}`);
  for (const r of rows.slice(0, 5)) {
    console.log(`    video=${r.video_id} date=${r.date} impressions=${r.impressions} ctr=${r.impression_ctr}`);
  }
  console.log('REPORTING LIVE OK (리포트 수신·파싱)');
}
