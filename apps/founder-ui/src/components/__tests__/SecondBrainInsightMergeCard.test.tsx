import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// @ts-ignore
import { SecondBrainInsightMergeCard } from '../memory/SecondBrainInsightMergeCard'

;(globalThis as typeof globalThis & { React: typeof React }).React = React

const mockData = {
  candidate_id: 'cand-123',
  incoming: {
    insight: '새로운 인사이트 내용',
    source_agent: 'agent-1',
  },
  existing: {
    card_id: 'card-456',
    insight: '기존 인사이트 내용',
  },
  similarity_score: 0.85,
  suggested_merge: '병합된 제안 내용',
} as any

const html = renderToStaticMarkup(
  <SecondBrainInsightMergeCard data={mockData} onAction={() => {}} />
)

// 1. 유사도 노출
assert.match(html, /유사도/, 'Should display similarity label')
assert.match(html, /85%|0\.85|85/, 'Should display similarity score')

// 2. 신규/기존 데이터 표시
assert.match(html, /새로운 인사이트 내용/, 'Should display incoming insight')
assert.match(html, /기존 인사이트 내용/, 'Should display existing insight')

// 3. 3가지 액션 버튼 확인
assert.match(html, /병합하여 저장/, 'Should have merge button')
assert.match(html, /신규 건 폐기/, 'Should have discard new button')
assert.match(html, /각각 분리 저장/, 'Should have keep both button')
