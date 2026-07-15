#!/bin/bash
# 렌더 산출물 육안 QA — 프레임 추출 + 메타 리포트.
# 사용: bash e2e/inspect-video.sh <video.mp4 경로> [출력 디렉토리]
set -e
MP4="$1"
OUT="${2:-/tmp/bizpt-video-qa}"
[ -f "$MP4" ] || { echo "파일 없음: $MP4"; exit 1; }
mkdir -p "$OUT"

echo "== 메타 =="
ffprobe -v error -show_entries format=duration,size,bit_rate -show_entries stream=codec_name,width,height,r_frame_rate,sample_rate -of default=noprint_wrappers=1 "$MP4"

DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$MP4" | cut -d. -f1)
echo "== 프레임 추출 (시작/25%/50%/75%/끝) → $OUT =="
for PCT in 0 25 50 75 95; do
  TS=$(( DUR * PCT / 100 ))
  ffmpeg -v error -ss "$TS" -i "$MP4" -frames:v 1 -q:v 3 -y "$OUT/frame_${PCT}pct_t${TS}s.jpg"
done
ls -la "$OUT"/*.jpg

echo "== 오디오 유무 =="
ffprobe -v error -select_streams a -show_entries stream=codec_name,duration -of csv=p=0 "$MP4" || echo "오디오 스트림 없음(!)"
echo "== 완료 =="
