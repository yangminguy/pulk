import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AgentOutputDetail } from '../AgentOutputDetail'
import type { AgentOutputLite } from '@/lib/api'

(globalThis as typeof globalThis & { React: typeof React }).React = React

const productStrategyOutput = {
  product_strategy: {
    product: 'Founder용 PMF 메시지 진단 카드',
    target: '초기 B2B SaaS 창업자',
    problem: '고객 문제와 메시지가 분리되어 콘텐츠 실험 학습이 누적되지 않는다.',
    goal: '7일 안에 반응률 10% 이상인 메시지 축을 찾는다.',
    confidence: 72,
    rationale: '최근 CMO 실험 결과에서 문제 인식형 메시지가 가장 높은 응답률을 보였다.',
  },
} as unknown as AgentOutputLite

const productStrategyHtml = renderToStaticMarkup(
  <AgentOutputDetail
    agent="CMO"
    output={productStrategyOutput}
  />,
)

assert.match(productStrategyHtml, /상품 전략/, 'Product strategy panel heading should be rendered')
assert.match(productStrategyHtml, /CMO/, 'Agent badge should be rendered in the product strategy panel')
assert.match(productStrategyHtml, /상품/, 'Product field label should be rendered')
assert.match(productStrategyHtml, /Founder용 PMF 메시지 진단 카드/, 'Product field value should be rendered')
assert.match(productStrategyHtml, /타깃/, 'Target field label should be rendered')
assert.match(productStrategyHtml, /초기 B2B SaaS 창업자/, 'Target field value should be rendered')
assert.match(productStrategyHtml, /문제/, 'Problem field label should be rendered')
assert.match(productStrategyHtml, /고객 문제와 메시지가 분리되어 콘텐츠 실험 학습이 누적되지 않는다\./)
assert.match(productStrategyHtml, /목표/, 'Goal field label should be rendered')
assert.match(productStrategyHtml, /7일 안에 반응률 10% 이상인 메시지 축을 찾는다\./)
assert.match(productStrategyHtml, /72\/100/, 'Confidence should render as a score out of 100')
assert.match(productStrategyHtml, /var\(--green/, 'Confidence >= 70 should use the green color branch')
assert.match(productStrategyHtml, /도출 근거/, 'Rationale disclosure label should be rendered')
assert.match(productStrategyHtml, /최근 CMO 실험 결과에서 문제 인식형 메시지가 가장 높은 응답률을 보였다\./)
assert.match(productStrategyHtml, /수정/, 'Edit button should be available from read mode')

const noProductStrategyOutput = {
  goal: 'PMF 메시지 방향 결정',
  recommendation: '좁은 ICP를 대상으로 문제 인식 메시지를 먼저 검증한다.',
  options: ['선택지 A: 좁은 ICP 문제 인식 메시지'],
}

const fallbackHtml = renderToStaticMarkup(
  <AgentOutputDetail output={noProductStrategyOutput} />,
)

assert.match(fallbackHtml, /전략 결정 패널/, 'Existing strategy decision panel should keep rendering when product_strategy is absent')
assert.doesNotMatch(fallbackHtml, /상품 전략/, 'Product strategy panel should be hidden when product_strategy is absent')
