import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AgentOutputDetail } from '../AgentOutputDetail'

(globalThis as typeof globalThis & { React: typeof React }).React = React

const strategyDecisionOutput = {
  goal: 'PMF 메시지 방향 결정',
  recommendation: '좁은 ICP를 대상으로 문제 인식 메시지를 먼저 검증한다.',
  options: [
    '선택지 A: 좁은 ICP 문제 인식 메시지',
    '선택지 B: 넓은 카테고리 브랜딩 메시지',
  ],
  action_items: ['CMO가 2개 메시지 변형을 작성한다.'],
}

const defaultAgentHtml = renderToStaticMarkup(
  <AgentOutputDetail
    output={strategyDecisionOutput}
  />,
)

assert.match(defaultAgentHtml, /전략 결정 패널/, 'Strategy Decision Panel heading should be rendered')
assert.match(defaultAgentHtml, /CMO 추천/, 'CMO recommendation label should default to CMO')
assert.match(defaultAgentHtml, /좁은 ICP를 대상으로 문제 인식 메시지를 먼저 검증한다\./)
assert.match(defaultAgentHtml, /선택지 A: 좁은 ICP 문제 인식 메시지/)
assert.match(defaultAgentHtml, /선택지 B: 넓은 카테고리 브랜딩 메시지/)

const ctoAgentHtml = renderToStaticMarkup(
  <AgentOutputDetail
    agent="CTO"
    output={strategyDecisionOutput}
  />,
)

assert.match(ctoAgentHtml, /CTO 추천/, 'Recommendation label should use the provided agent')
