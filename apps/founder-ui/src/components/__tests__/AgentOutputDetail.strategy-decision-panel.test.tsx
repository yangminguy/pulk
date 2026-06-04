import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AgentOutputDetail } from '../AgentOutputDetail'

(globalThis as typeof globalThis & { React: typeof React }).React = React

const html = renderToStaticMarkup(
  <AgentOutputDetail
    output={{
      goal: 'PMF 메시지 방향 결정',
      recommendation: '좁은 ICP를 대상으로 문제 인식 메시지를 먼저 검증한다.',
      options: [
        '선택지 A: 좁은 ICP 문제 인식 메시지',
        '선택지 B: 넓은 카테고리 브랜딩 메시지',
      ],
      action_items: ['CMO가 2개 메시지 변형을 작성한다.'],
    }}
  />,
)

assert.match(html, /전략 결정 패널/, 'Strategy Decision Panel heading should be rendered')
assert.match(html, /CMO 추천/, 'CMO recommendation label should be rendered')
assert.match(html, /좁은 ICP를 대상으로 문제 인식 메시지를 먼저 검증한다\./)
assert.match(html, /선택지 A: 좁은 ICP 문제 인식 메시지/)
assert.match(html, /선택지 B: 넓은 카테고리 브랜딩 메시지/)
