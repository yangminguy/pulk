import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AgentOutputDetail } from '../AgentOutputDetail'

(globalThis as typeof globalThis & { React: typeof React }).React = React

const introAnalysisOutput = {
  intro_analysis: {
    video_title: 'AI 업무 자동화 인트로 테스트',
    video_url: 'https://www.youtube.com/watch?v=intro-test',
    duration_sec: 30,
    hook_score: 76,
    retention_curve: [
      { sec: 0, pct: 100 },
      { sec: 10, pct: 86 },
      { sec: 20, pct: 74 },
      { sec: 30, pct: 68 },
    ],
    segments: [
      {
        label: '오프닝 훅',
        start_sec: 0,
        end_sec: 5,
        verdict: 'strong',
        feedback: '첫 문장이 문제를 바로 제기해 이탈을 늦춘다.',
      },
      {
        label: '가치 제안',
        start_sec: 15,
        end_sec: 30,
        verdict: 'neutral',
        feedback: '결과물 예시가 조금 늦게 등장한다.',
      },
    ],
    overall_feedback: '훅은 강하지만 15초 이전에 구체적 결과를 보여주면 더 좋다.',
  },
}

const introHtml = renderToStaticMarkup(
  <AgentOutputDetail
    agent="CMO"
    output={introAnalysisOutput}
  />,
)

assert.match(introHtml, /인트로 30초 분석/, 'Intro analysis panel heading should be rendered')
assert.match(introHtml, /AI 업무 자동화 인트로 테스트/, 'Video title should be rendered')
assert.match(introHtml, /76\/100/, 'Hook score should be rendered as a score out of 100')
assert.match(introHtml, /var\(--green/, 'Hook score >= 70 should use the green color branch')
assert.match(introHtml, /<path/, 'Retention curve should render an SVG path')
assert.match(introHtml, /오프닝 훅/, 'Each segment label should be rendered')
assert.match(introHtml, /0-5초/, 'Each segment time range should be rendered')
assert.match(introHtml, /strong/, 'Each segment verdict should be rendered')
assert.match(introHtml, /첫 문장이 문제를 바로 제기해 이탈을 늦춘다\./)
assert.match(introHtml, /훅은 강하지만 15초 이전에 구체적 결과를 보여주면 더 좋다\./)
assert.doesNotMatch(introHtml, /개선 제안/, 'Improvement suggestions section should be hidden when suggestions are absent')

const strategyDecisionOutput = {
  goal: 'PMF 메시지 방향 결정',
  recommendation: '좁은 ICP를 대상으로 문제 인식 메시지를 먼저 검증한다.',
  options: ['선택지 A: 좁은 ICP 문제 인식 메시지'],
}

const strategyHtml = renderToStaticMarkup(
  <AgentOutputDetail output={strategyDecisionOutput} />,
)

assert.match(strategyHtml, /전략 결정 패널/, 'Strategy Decision Panel should keep rendering without intro_analysis')
