// Failing tests for CMO Chat UI — spec: docs/specs/cmo-chat-ui-spec.md
// Covers AC-1 (page exists), AC-2 (sidebar megaphone icon), AC-4 (result card fields), AC-5 (approval CTA)
// These tests FAIL (red) until the implementation is done.

import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ICONS } from '../Icon'

;(globalThis as typeof globalThis & { React: typeof React }).React = React

// ─── AC-1: /cmo page module exists and exports default ─────────────────────
// This import will throw ERR_MODULE_NOT_FOUND until src/app/cmo/page.tsx is created.
let CmoPage: React.ComponentType | null = null
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('../../app/cmo/page')
  CmoPage = mod.default ?? null
} catch {
  // expected to fail before implementation
}
assert.ok(CmoPage, 'AC-1: /cmo page should exist and export a default component')

// ─── AC-2: Icon module includes megaphone icon for CMO nav ─────────────────
assert.ok(ICONS['megaphone'], 'AC-2: Icon module should include a megaphone icon for CMO sidebar nav')

// ─── AC-4 + AC-5: CmoResultCard renders plan fields + approval CTA ─────────
// CmoResultCard is exported from components/CmoResultCard (moved out of page for Next.js 14 compat)
let CmoResultCard: ((props: Record<string, unknown>) => React.ReactElement) | null = null
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('../CmoResultCard')
  CmoResultCard = mod.CmoResultCard ?? null
} catch {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../../app/cmo/page')
    CmoResultCard = mod.CmoResultCard ?? null
  } catch {
    // expected to fail before implementation
  }
}
assert.ok(CmoResultCard, 'AC-4: CmoResultCard should be exported from CmoResultCard component')

const planHtml = renderToStaticMarkup(
  React.createElement(CmoResultCard!, {
    plan: {
      decision: '문제 인식 메시지 A/B 테스트 실행',
      reasoning: 'PMF 스코어 기반 세그먼트 분석 결과',
      next_action: '3개 카피 변형 초안 작성',
      risk_level: 'D3',
      requires_founder_approval: true,
    },
    onApprove: () => {},
    onReject: () => {},
    approved: false,
  }),
)

// AC-4: plan fields rendered
assert.match(planHtml, /문제 인식 메시지 A\/B 테스트 실행/, 'AC-4: decision text should render')
assert.match(planHtml, /PMF 스코어 기반 세그먼트 분석 결과/, 'AC-4: reasoning text should render')
assert.match(planHtml, /3개 카피 변형 초안 작성/, 'AC-4: next_action text should render')
assert.match(planHtml, /D3/, 'AC-4: risk level badge should render')

// AC-5: approval CTA when requires_founder_approval
assert.match(planHtml, /승인/, 'AC-5: approve button should render when requires_founder_approval is true')

console.log('✅ All CMO Chat UI tests passed')
