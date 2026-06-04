import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AgentOutputDetail } from '../AgentOutputDetail'
import type { AgentOutputLite } from '@/lib/api'

(globalThis as typeof globalThis & { React: typeof React }).React = React

const pullingContentSetOutput = {
  pulling_content_set: {
    hook: '10초 안에 고객의 시선을 사로잡는 마법의 후킹',
    problem: '콘텐츠를 만들어도 아무도 보지 않는 문제',
    solution: '데이터 기반 콘텐츠 템플릿',
    benefit: '도달률 300% 증가',
    cta: '지금 바로 템플릿 다운로드하기',
  },
} as unknown as AgentOutputLite

const pullingContentSetHtml = renderToStaticMarkup(
  <AgentOutputDetail
    agent="CMO"
    output={pullingContentSetOutput}
  />,
)

// AC3: 읽기 모드 - 5개 필드 라벨과 텍스트 분리 표시 확인
assert.match(pullingContentSetHtml, /콘텐츠 구조 \(5단계\)/, 'Pulling content set panel heading should be rendered')
assert.match(pullingContentSetHtml, /CMO/, 'Agent badge should be rendered in the pulling content set panel')
assert.match(pullingContentSetHtml, /Hook/, 'Hook field label should be rendered')
assert.match(pullingContentSetHtml, /10초 안에 고객의 시선을 사로잡는 마법의 후킹/, 'Hook field value should be rendered')
assert.match(pullingContentSetHtml, /Problem/, 'Problem field label should be rendered')
assert.match(pullingContentSetHtml, /콘텐츠를 만들어도 아무도 보지 않는 문제/, 'Problem field value should be rendered')
assert.match(pullingContentSetHtml, /Solution/, 'Solution field label should be rendered')
assert.match(pullingContentSetHtml, /데이터 기반 콘텐츠 템플릿/, 'Solution field value should be rendered')
assert.match(pullingContentSetHtml, /Benefit/, 'Benefit field label should be rendered')
assert.match(pullingContentSetHtml, /도달률 300% 증가/, 'Benefit field value should be rendered')
assert.match(pullingContentSetHtml, /CTA/, 'CTA field label should be rendered')
assert.match(pullingContentSetHtml, /지금 바로 템플릿 다운로드하기/, 'CTA field value should be rendered')
assert.match(pullingContentSetHtml, /수정/, 'Edit button should be available from read mode')

// AC2: output.pulling_content_set이 없을 때 표시 안 됨
const noPullingContentSetOutput = {
  goal: 'PMF 메시지 방향 결정',
} as unknown as AgentOutputLite

const fallbackHtml = renderToStaticMarkup(
  <AgentOutputDetail output={noPullingContentSetOutput} />,
)

assert.doesNotMatch(fallbackHtml, /콘텐츠 구조 \(5단계\)/, 'Pulling content set panel should be hidden when pulling_content_set is absent')

console.log('✅ Pulling Content Set test passed')
