# T3 — `align` + `reanchor` (850~1150줄) · T3b 세션 접합 (150~200줄)

**선행**: T2
**읽을 것**: [CONTRACTS.md](../CONTRACTS.md) §2 · `~/brandboy-pipeline/spec/02-align.md` · [PORTING.md](../PORTING.md) M1·M3
**파일**: `src/commands/{align,reanchor}.ts` · `src/align/{transcribe,match,edit,captions-ko,sessions}.ts` · `src/lib/similarity.ts`

> **이 파이프라인에서 알고리즘 비중이 가장 크다.** 규모를 850~1150줄로 잡은 이유는 §규모 근거 참조.

## 먼저 확인할 것

- [ ] P1 경로(A: 단어 시각 / B: 문장 단위)
- [ ] P4에서 `aselect` · `silencedetect` · `acrossfade`가 전부 있는가
- [ ] `script-map.json`에 `sentence_key`(8자 불변 ID)와 `sessions[]`가 채워져 있는가 — **사람이 원고 잠금 시 부여한다**

---

## 목적

무재테이크 세션 녹음을 **빈 공백만 다듬어 하나의 자연스러운 연속 마스터**로 잇는다. **테이크 선택은 하지 않는다**(재테이크가 없다). 샷 플랜은 추정 길이가 아니라 **실제 발화 시각** 위에 세운다.

**씬별 WAV를 최종 조립 입력으로 쓰지 않는다.** 분할 파일은 미리듣기용.

## 입출력

| 구분 | 파일 |
|---|---|
| 입력 | `audio/raw/session-*.wav` · `script.md` · `script-map.json` |
| 출력 | `audio/narration-master.wav` · `audio/words.json` · `audio/captions.srt` · `audio/captions.meta.json` |
| 출력 | `timeline.json` · `align-remap.json` · `align-report.json` |

---

## 처리 순서

1. 세션별 whisper 단어 타임스탬프 생성
2. 원고와 전사 정규화
3. 문장별 발화 구간 정렬 (문장당 1구간 — 재테이크 없음)
4. 빈 공백·긴 침묵 다듬기 (말은 보존)
5. 다듬은 발화를 연속 마스터로 편집 (세션 내부)
6. **세션 접합** (T3b)
7. 경계 크로스페이드와 룸톤 적용
8. 단어·문장·세그먼트 시각 재계산
9. 원고 기반 자막 생성
10. `align-remap.json` 생성 (이전 실행이 있으면)

---

## 1. 정규화 (`similarity.ts`)

```ts
function normalize(s: string): string {
  return s.replace(/[.,!?…"'"'()\[\]]/g, '')
          .replace(/\s+/g, '')     // 공백 전량 제거
          .toLowerCase()
}
```

**공백 전량 제거가 중요하다.** 한국어 ASR은 띄어쓰기를 자주 틀리는데 이건 내용 오류가 아니다.

**숫자는 별도 처리한다.** 원고의 `1988년`이 전사에서 `천구백팔십팔년`으로 나온다. 숫자↔한글 양방향 변환 함수를 두고 **양쪽 다 비교해 더 유사한 쪽**을 택한다.

변환 범위 (여기가 120~200줄): 만·억·조 단위 · 한자어 수사(일이삼) · 고유어 수사(하나둘셋) · 년월일 · 소수 · 퍼센트 · 단위(원·명·개).

> M1 이식: `captions.ts:191` `normalizeForMatch` · `:196-225` `editDistance`/`isSimilar` · **`:235-278` `alignWordsToScript`**(원고 토큰 1~3개 연결 + 5토큰 룩어헤드 순차 그리디 — T3의 "whisper 표기 → 원고 표기 교정"과 목적이 같다. 이식하면 100~150줄 절감)

## 2. 정렬 (`match.ts`)

```text
pos = 0
for 원고 문장 si:
    구간 = 슬라이딩윈도우_최대유사도(W, pos, si)
    if 유사도 >= align.similarity_threshold:
        문장시각[si] = 구간; pos = 구간.end_index + 1
    else:
        unmatched.push(si)          # 통째로 누락 → exit 1
```

**슬라이딩 윈도우** — 원고 문장의 정규화 길이 `L`에 대해 전사 단어를 이어 붙여 길이가 `align.window_ratio`(0.7L~1.4L) 범위가 되는 구간을 시작 위치를 옮겨가며 만들고 유사도 최대를 고른다. 탐색 범위는 `align.search_window_multiplier × L` 문자까지. **무재테이크라 문장은 순서대로 1회만 나타난다** — 다중 후보를 모으지 않는다.

```
similarity = 1 - levenshtein(a, b) / max(len(a), len(b))
```

## 3. 빈 공백 정리 (테이크 선택 없음)

무재테이크 전제이므로 **후보 구간을 고르는 로직이 없다.** 대신 발화 사이의 죽은 공백·긴 침묵만 다듬는다. 침묵 감지는 그 경계를 찾는 데만 쓴다.

```bash
ffmpeg -i <input> -af silencedetect=noise=<audio.silence_detect_db>:d=<audio.merge_gap_sec> -f null - 2>&1
```

`silence_start`/`silence_end`를 **stderr에서 파싱**해 §4의 절단·병합 경계로 넘긴다. 유사도가 `align.similarity_low_confidence` 구간이면 그 문장을 `low_confidence`로 **리포트만** 하고 삭제하지 않는다.

## 4. 오디오 경계 ★

**문장마다 무조건 잘라 붙이지 않는다.** 이 절이 결과물의 자연스러움을 결정한다.

- 자연스럽게 이어진 문장은 **하나의 연속 구간으로 유지**
- 긴 침묵이 있는 경계만 절단
- 컷 경계에 `audio.crossfade_ms` 크로스페이드
- 필요하면 **같은 녹음의 룸톤**을 `audio.roomtone_ms` 삽입
- **호흡은 오류가 아니라 리듬이므로 보존.** 입소리·충격음만 제거
- 패딩은 `audio.narration_padding_sec` (head 0.15 / tail 0.25). **뒤를 더 준다** — 문장 끝이 잘리면 어색하지만 앞이 조금 잘리는 건 잘 안 들린다
- 인접 keep 구간이 `audio.merge_gap_sec` 이내면 병합. 잘게 자르면 클릭 노이즈가 생긴다

**절단은 ffmpeg 필터로 한 번에 한다.** 파일을 여러 개 만들었다가 concat하면 경계에서 잡음이 난다. 구간이 50개를 넘으면 `-filter_script`로 넘긴다.

## 5. 음량

**개별 구간마다 `loudnorm`을 적용하지 않는다** (`audio.per_scene_normalize: false`).

1. 전체 마스터의 노이즈·EQ·컴프레션을 한 번 처리
2. 전체 내레이션을 **하나의 프로그램으로** 정규화 → `audio.program_lufs`(-14), `audio.true_peak_dbtp`(-1)
3. 최종 조립 후 BGM과 함께 최종 라우드니스 측정 (`assemble` 이후)

**수치는 사람 청취를 대신하지 않는다.**

## 6. 자막 (`captions-ko.ts`)

**원고 텍스트를 쓴다.** ASR 결과가 아니므로 오타가 없다.

규칙은 `captions.base`·`captions.timing`에서 읽는다 — 최대 2줄, 한 줄 16~20자, 최소 노출 1.0초, 발화 종료 후 0.1~0.25초 유지.

- 조사·어미만 다음 화면으로 고립시키지 않는다
- 빠른 발화라도 `captions.timing.min_block_sec` 미만 블록을 연속 사용하지 않는다
- 강조 단어는 `audio/captions.meta.json`에 별도 기록

```json
{ "b042": [{ "word": "45만", "start": 135.1, "end": 135.6, "type": "keyword" }] }
```

`script-map.json`의 `emphasis_caption` 문구가 원고에 그대로 없으면 **각 단어 시각을 억지로 만들지 않고** 카드 시작·종료만 비트에 맞춘다.

> **factory `groupWordsIntoPages`를 쓰지 않는다.** 하드코딩 `30자/700ms/14단어`가 이 규칙과 완전히 다르다. 신규 작성한다(150~250줄).

## 7. `timeline.json` · `align-remap.json`

```json
{ "align_rev": 4, "profile_rev": 1, "word_timing": "exact", "duration": 879.2,
  "sentences": [{ "sentence_key":"a1b2c3d4", "sentence_id":"sn042",
                  "text":"티셔츠 한 장이 45만 원입니다.", "start":134.2, "end":137.8,
                  "words":[{ "text":"티셔츠","start":134.2,"end":134.8 }] }] }
```

**경로 B일 때** — `words`를 문장 안에서 글자 수 비례로 생성하고 `word_timing: "estimated"`를 기록한다. 하류 모듈이 이 값을 보고 싱크 허용치를 완화한다.

`align-remap.json`은 [CONTRACTS §2](../CONTRACTS.md)의 **status 6종**(`unchanged`/`shifted`/`rescaled`/`edited`/`added`/`removed`)을 그대로 따른다. `edited` 판정은 `removed` 키와 `added` 키 사이 유사도로 수행한다(임계 이상 + 인접 순번).

## 8. `reanchor`

[CONTRACTS §2](../CONTRACTS.md)의 처리 규칙 표를 그대로 구현한다. 요점:

- `unchanged`/`shifted` → 평행이동 + `timing_rev` 갱신
- `rescaled`/`edited` → **기계적 재계산 금지.** `needs_review: true`, `timing_rev` 미갱신 → V13이 잡는다
- `removed` → `orphaned: true`. **샷 삭제 금지**
- `added` → `plan_rerun_required[]` 보고
- **`locked_selection`·`source_in`·`source_out`은 어떤 경우에도 건드리지 않는다.** `writeScoped(zone='Z3')`가 강제한다

## 9. `align-report.json`

```json
{ "input_duration": 942.5, "output_duration": 879.2, "removed_sec": 63.3,
  "word_timing": "exact",
  "trimmed_gaps": [{ "at": 45.2, "removed_sec": 0.8 }],
  "low_confidence": [{ "sentence_key":"…", "similarity":0.71 }],
  "unmatched": [],
  "session_warnings": [] }
```

`unmatched`가 있으면 **exit 1**.

---

## T3b — 세션 접합 정합 (150~200줄, `align/sessions.ts`)

**입력**: `script-map.json`의 `sessions: [{id, from_sentence_key, to_sentence_key}]`

**처리**
1. 세션별 룸톤 샘플 추출 (각 세션 시작 전 5초 무음 — 녹음 SOP)
2. 접합부에 룸톤 삽입 (`audio.roomtone_ms`)
3. 크로스페이드 (`audio.crossfade_ms`)
4. **전체 마스터 1회만 정규화** — 세션별 `loudnorm` 금지

**경고 조건**
- 세션 간 통합 라우드니스 편차 > `audio.session_lufs_deviation_max` (1.5 LU)
- 노이즈 플로어 편차 > `audio.session_noise_floor_deviation_db` (3.0 dB)
→ `align-report.json.session_warnings`

**녹음 SOP (사람에게 전달)**
- 세션 간 마이크 위치·거리 고정
- **각 세션 시작 전 룸톤 5초 무음 녹음 필수**
- NG 시 3초 쉬고 그 문장부터 다시

---

## 완료 조건

### T3
- [ ] **빈 공백 정리** — 문장 사이 긴 침묵이 `audio.merge_gap_sec` 기준으로 다듬어지고 말·호흡은 보존 (`align-report.json.trimmed_gaps`)
- [ ] 원고에 동일 문장 2회 케이스에서 **둘 다 생존** (순서대로 각각 매칭)
- [ ] `captions.srt` 텍스트가 `script.md`와 **문자 단위 일치** (verify가 diff)
- [ ] `unmatched` 비어 있음, 아니면 exit 1
- [ ] `--dry-run`이 파일 미생성
- [ ] **재고정 픽스처** — *문장 1개 삽입 + 1개 삭제 + 1개 수정 + 세션 2를 길이가 다르게 재녹음* → `align` 재실행 → `reanchor` 후:
  - 영향 없는 샷의 `source_in`/`source_out`이 **문자 단위 보존**, `start`/`end`만 이동
  - **수정된 문장**의 샷이 `orphaned`가 **아니고** `needs_review: true` (status `edited`)
  - 삭제 문장 앵커 샷이 `orphaned: true`, **삭제되지 않음**
  - 삽입 문장 구간이 `plan_rerun_required[]`에 보고
  - `validate`가 V13으로 실패
- [ ] 청취 검사: 30초 샘플 3구간에 클릭·펌핑 없음 — **판정자: 사람 (서명 기록)**

### T3b
- [ ] 세션 3개(마이크 거리 의도적으로 다르게) 테스트에서 접합부 경고 발생
- [ ] 마스터 `loudnorm` 측정값이 `audio.program_lufs ± 0.5`
- [ ] **접합부 정량 판정**: 경계 ±100ms 구간의 단시간 RMS 변화가 `audio.session_boundary_discontinuity_db`(6.0) 미만 — `verify-sessions.ts`가 자동 판정
- [ ] 보조: 접합부 3곳 청취 — **판정자: 사람 (서명 기록)**

## 검증 명령

```bash
cd ~/brandboy-pipeline
npx tsx src/cli.ts align --project projects/<slug> --dry-run     # 파일 미생성
npx tsx src/cli.ts align --project projects/<slug>
npx tsx scripts/verify-align.ts        # 빈공백정리·반복문장·자막일치·unmatched
npx tsx scripts/verify-reanchor.ts     # 삽입1+삭제1+수정1+재녹음 픽스처
npx tsx scripts/verify-sessions.ts     # 접합부 RMS 변화 < 6dB
ffmpeg -i projects/<slug>/audio/narration-master.wav -af loudnorm=print_format=json -f null -
```

## 규모 근거 (850~1150줄)

transcribe 60 · **숫자↔한글 120~200** · 정규화+레벤슈타인+윈도우 150 · 빈 공백 감지 `silencedetect` stderr 파싱 + 절단 경계 100 · **ffmpeg 필터그래프 200~250**(크로스페이드·룸톤·`merge_gap` 병합·패딩·50구간 분기) · **한국어 자막 생성 150~250** · timeline+remap+reanchor 180. 테이크 선택 제거로 상한이 내려간다. M1 `alignWordsToScript` 이식으로 100~150 절감.

## 흔한 함정

- **파일을 여러 개 만들어 concat** → 경계 잡음. 단일 필터그래프로.
- **세션별 `loudnorm`** → 접합부에서 음량이 튄다. 전체 1회만.
- **factory `captions.ts`의 ms 단위** → 초로 변환. 안 하면 1000배 오차가 총길이 검사에서야 드러난다.
- **`reanchor`가 `rescaled`를 비례 계산으로 처리** → 문장 내부 단어 시각이 스케일되어 `offset_sec`가 다른 단어를 가리킨다. 반드시 `needs_review`로 남긴다.
- **문장 순서가 뒤바뀐 녹음** → 지원하지 않는다. 원고 순서 낭독이 전제.
- **매우 짧은 문장(정규화 5자 미만)** → 유사도가 불안정하다. 앞뒤 문장과 묶어 매칭.
