# SPEC 02 — 내레이션 정렬

> **코드 태스크 T3.** 이 파이프라인에서 알고리즘 비중이 가장 크다.
> 사전 검증 P1의 경로(A/B)에 따라 6단계 이후가 달라진다.

## 목적

재테이크를 제거하면서도 **하나의 자연스러운 내레이션 마스터**를 만든다. 샷 플랜은 추정 길이가 아니라 실제 발화 시각 위에 세운다.

---

## 1. 입출력

| 구분 | 파일 |
|---|---|
| 입력 | `audio/raw/narration.wav`, `script.md`, `script-map.json` |
| 출력 | `audio/narration-master.wav` |
| 출력 | `audio/words.json` |
| 출력 | `audio/captions.srt` |
| 출력 | `timeline.json` |
| 출력 | `align-report.json` |

**씬별 WAV를 최종 조립 입력으로 쓰지 않는다.** 분할 파일은 미리듣기용으로만 만든다.

---

## 2. 처리 순서

1. Whisper 단어 타임스탬프 생성
2. 원고와 전사 정규화
3. 문장별 후보 구간 정렬
4. 재테이크 규칙에 따라 마지막 성공 테이크 선택
5. 선택 구간을 연속 마스터로 편집
6. 경계 크로스페이드와 룸톤 적용
7. 단어·문장·세그먼트 시각 재계산
8. 원고 기반 자막 생성

---

## 3. 정규화

```ts
function normalize(s: string): string {
  return s.replace(/[.,!?…"'"'()\[\]]/g, '')
          .replace(/\s+/g, '')
          .toLowerCase()
}
```

**공백을 전부 제거하는 게 중요하다.** 한국어 ASR은 띄어쓰기를 자주 틀리는데 이건 내용 오류가 아니다.

숫자는 별도 처리한다. 원고의 `1988년`이 전사에서 `천구백팔십팔년`으로 나올 수 있다. 숫자를 한글 읽기로 변환하는 함수를 두고 **양쪽 다 비교해서 더 유사한 쪽을 택한다.**

---

## 4. 정렬

원고 문장 리스트 `S`, 전사 단어 리스트 `W`.

```text
pos = 0
for 원고 문장 si:
    후보구간들 = []
    탐색시작 = pos
    while 탐색시작 < W.length:
        구간 = 슬라이딩윈도우_최대유사도(W, 탐색시작, si)
        if 유사도 >= align.similarity_threshold:
            후보구간들.push(구간)
            탐색시작 = 구간.end_index + 1
        else: break
```

유사도는 정규화 문자열의 편집거리 기반이다.

```text
similarity = 1 - levenshtein(a, b) / max(len(a), len(b))
```

**슬라이딩 윈도우** — 원고 문장의 정규화 길이 `L`에 대해, 전사 단어를 이어 붙여 길이가 `0.7L ~ 1.4L`가 되는 구간을 시작 위치를 옮겨가며 만들고 유사도 최대를 고른다. 탐색 범위는 시작점에서 `align.search_window_multiplier × L` 문자까지. 그 밖이면 문장이 통째로 누락된 것이다.

---

## 5. 테이크 선택

후보 구간이 2개 이상이면 재테이크다. **마지막을 고른다.** 녹음 규칙이 "틀리면 3초 쉬고 처음부터 다시"이므로 마지막이 항상 성공 테이크다.

**3초 침묵을 보조 신호로 쓴다.** 후보 구간 직전에 `audio.retake_silence_threshold_sec`(2.5초) 이상 무음이 있으면 재테이크 시작점일 확률이 높다. 유사도가 `align.similarity_low_confidence`(0.70~0.80) 구간일 때 이 신호로 판정을 보정한다.

```bash
ffmpeg -i <input> -af silencedetect=noise=-35dB:d=2.5 -f null - 2>&1
```

`silence_start` / `silence_end`를 stderr에서 파싱한다. 임계값은 `audio.silence_detect_db`.

---

## 6. 오디오 경계 ★

**문장마다 무조건 잘라 붙이지 않는다.** 이 절이 결과물의 자연스러움을 결정한다.

- 자연스럽게 이어진 문장은 **하나의 연속 구간으로 유지**
- 재테이크 또는 긴 침묵이 있는 경계만 절단
- 컷 경계에 `audio.crossfade_ms`(5~15ms) 크로스페이드
- 필요하면 **같은 녹음의 룸톤**을 `audio.roomtone_ms`(50~150ms) 삽입
- **호흡은 오류가 아니라 리듬이므로 기본적으로 보존**
- 입소리·충격음·명백한 NG만 제거

패딩은 `audio.narration_padding_sec` (head 0.15 / tail 0.25). 뒤를 더 준다 — 문장 끝이 잘리면 어색하지만 앞이 조금 잘리는 건 잘 들리지 않는다.

인접 keep 구간이 `audio.merge_gap_sec`(0.4초) 이내면 병합한다. 잘게 자르면 클릭 노이즈가 생긴다.

절단은 `ffmpeg` 필터로 **한 번에** 한다. 파일을 여러 개 만들었다가 concat하면 경계에서 잡음이 난다. 구간이 50개를 넘으면 `-filter_script`로 넘긴다.

---

## 7. 음량

**개별 씬마다 `loudnorm`을 적용하지 않는다** (`audio.per_scene_normalize: false`).

1. 전체 마스터의 노이즈·EQ·컴프레션을 한 번 처리
2. 전체 내레이션을 하나의 프로그램으로 정규화
3. 최종 조립 후 BGM과 함께 최종 라우드니스 측정 (`assemble` 이후)

목표는 `audio.program_lufs`(-14), `audio.true_peak_dbtp`(-1). **수치는 사람 청취를 대신하지 않는다.**

---

## 8. timeline.json

```json
{
  "duration": 879.2,
  "sentences": [{
    "sentence_id": "sn042",
    "segment_id": "g04",
    "text": "티셔츠 한 장이 45만 원입니다.",
    "start": 134.2,
    "end": 137.8,
    "words": [{ "text": "티셔츠", "start": 134.2, "end": 134.8 }]
  }]
}
```

**경로 B(문장 단위만 가능)일 때** — `words`를 문장 안에서 글자 수 비례로 생성하고, `align-report.json`에 `"word_timing": "estimated"`를 기록한다. 이후 모듈은 이 값을 보고 싱크 정밀도를 판단한다.

---

## 9. 자막

**원고 텍스트를 쓴다.** ASR 결과가 아니므로 오타가 없다.

규칙은 `captions.base`와 `captions.timing`에서 읽는다. 최대 2줄, 한 줄 16~20자, 최소 노출 1.0초, 발화 종료 후 0.1~0.25초 유지.

- 조사·어미만 다음 화면으로 고립시키지 않는다
- 빠른 발화라도 `captions.timing.min_block_sec`(0.8초) 미만 블록을 연속 사용하지 않는다
- 강조 단어는 별도 메타로 기록한다 → `audio/captions.meta.json`

```json
{ "b042": [{ "word": "45만", "start": 135.1, "end": 135.6, "type": "keyword" }] }
```

`script-map.json`의 `emphasis_caption` 문구가 원고에 그대로 없으면 **각 단어 시각을 억지로 만들지 않고** 카드 시작·종료만 비트에 맞춘다.

---

## 10. align-report.json

```json
{
  "input_duration": 1042.5,
  "output_duration": 879.2,
  "removed_sec": 163.3,
  "word_timing": "exact",
  "retakes": [{ "sentence_id": "sn042", "takes": 3, "kept": 3 }],
  "low_confidence": [{ "sentence_id": "sn118", "similarity": 0.71 }],
  "unmatched": []
}
```

`unmatched`가 있으면 종료 코드 1.

---

## 11. 엣지 케이스

- **원고에 같은 문장이 실제로 두 번** — 후렴처럼 반복. **`script-map.json`이 각 문장에 부여한 `sentence_key`(최초 등재 시 부여하는 불변 8자 ID)로 매칭하므로 자연히 구별된다.** keep도 두 개다. `sentence_key`는 사람이 부여하고 텍스트를 고쳐도 유지된다(정의상 불변). **내용 해시로 만들면 안 된다** — 조사 하나만 고쳐도 키가 바뀌어 옛 승인 샷이 전부 고아가 된다(원고 수정은 정규 워크플로우다). 표시·정렬용 `sentence_id`("sn042")는 가변이므로 매칭에 쓰지 않는다
- **문장 전체 누락** — `unmatched`에 담고 실패 처리
- **문장 순서가 뒤바뀐 녹음** — 지원하지 않는다. 원고 순서 낭독이 전제
- **매우 짧은 문장**(정규화 5자 미만) — 유사도가 불안정하다. 앞뒤 문장과 묶어 매칭

---

## 12. 완료 조건

1. NG 3회 포함 녹음에서 마지막 테이크만 남는다
2. 연속 마스터에 **클릭·음량 펌핑·룸톤 급변이 없다** (직접 청취)
3. 모든 원고 문장이 시각에 연결된다
4. 자막 텍스트가 원고와 완전히 일치한다
5. 원고에 같은 문장을 두 번 넣은 케이스에서 둘 다 살아남는다
6. `--dry-run`이 파일을 만들지 않는다
7. 30초 단위 청취 샘플과 전체 파형 검사를 모두 통과한다

## 13. 먼저 확인할 것

- 사전 검증 P1 결과 (경로 A/B)
- `ffmpeg`의 `aselect` 필터 사용 가능 여부. 빌드에 따라 없을 수 있다
