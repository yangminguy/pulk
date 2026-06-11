'use client'
import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'
import { STATUS_LABEL } from '../_lib/phases'
import type { ProjectListItem } from '../_lib/types'

// ── Project List & Create ─────────────────────────────────────────────────────
export default function ProjectSelector({ onSelect }: { onSelect: (id: string) => void }) {
  const [projects, setProjects] = useState<ProjectListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [product, setProduct] = useState('')
  const [target, setTarget] = useState('')
  const [customerProblem, setCustomerProblem] = useState('')
  const [coreOffer, setCoreOffer] = useState('')
  const [goal, setGoal] = useState('brand_growth')
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.cmoListProjects() as { projects: ProjectListItem[] }
      setProjects(res.projects ?? [])
    } catch {
      setProjects([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const create = async () => {
    if (!title.trim()) return
    setCreating(true)
    setErr(null)
    try {
      const res = await api.cmoCreateProject({
        title: title.trim(),
        product: product.trim(),
        target_audience: target.trim(),
        customer_problem: customerProblem.trim(),
        core_offer: coreOffer.trim(),
        business_goal: goal,
      })
      onSelect(res.project_id)
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : '생성 실패')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div style={{
      maxWidth: 640,
      margin: '0 auto',
      padding: '40px 20px',
    }}>
      <div style={{ marginBottom: 24 }}>
        <div className="j-overline" style={{ marginBottom: 6 }}>CMO · Video Room</div>
        <h1 style={{
          fontFamily: 'var(--font-serif)',
          fontWeight: 500,
          fontSize: 28,
          color: 'var(--ink-1)',
          margin: 0,
        }}>
          영상 프로젝트 선택
        </h1>
      </div>

      {/* Existing projects */}
      {loading ? (
        <div style={{ color: 'var(--ink-4)', fontSize: 13, textAlign: 'center', padding: 24 }}>로딩 중...</div>
      ) : projects.length > 0 ? (
        <div style={{ marginBottom: 24 }}>
          <div className="j-overline" style={{ marginBottom: 8 }}>기존 프로젝트</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {projects.map(p => (
              <button
                key={p.id}
                onClick={() => onSelect(p.id)}
                className="j-card j-card-hover"
                style={{ textAlign: 'left', border: 'none', cursor: 'pointer', padding: '12px 16px', width: '100%' }}
              >
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink-1)', marginBottom: 4 }}>{p.title}</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {p.product && (
                    <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{p.product}</span>
                  )}
                  {p.status && (
                    <span style={{
                      fontSize: 11,
                      padding: '1px 7px',
                      borderRadius: 999,
                      background: 'var(--p-butter)',
                      color: 'var(--pi-butter)',
                      fontWeight: 500,
                    }}>
                      {STATUS_LABEL[p.status] ?? p.status}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : !showForm ? (
        <div style={{ color: 'var(--ink-4)', fontSize: 13, textAlign: 'center', padding: 16, marginBottom: 16 }}>
          아직 영상 프로젝트가 없습니다.
        </div>
      ) : null}

      {/* Create form toggle */}
      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="j-btn j-btn-primary"
          style={{ width: '100%' }}
        >
          + 새 영상 프로젝트
        </button>
      ) : (
        <div style={{
          border: '1px solid var(--silver-2)',
          borderRadius: 10,
          background: 'var(--paper-surface)',
          padding: 20,
        }}>
          <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--ink-1)', marginBottom: 16 }}>새 영상 프로젝트</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', display: 'block', marginBottom: 4 }}>프로젝트 제목 *</label>
              <input
                className="j-input"
                placeholder="예: AI 마케팅팀 상품 판매용 콘텐츠 세트"
                value={title}
                onChange={e => setTitle(e.target.value)}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', display: 'block', marginBottom: 4 }}>상품</label>
              <input
                className="j-input"
                placeholder="예: AI 마케팅 자동화 팀"
                value={product}
                onChange={e => setProduct(e.target.value)}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', display: 'block', marginBottom: 4 }}>타깃 고객</label>
              <input
                className="j-input"
                placeholder="예: 마케팅팀을 둘 여력이 없는 작은 브랜드 대표"
                value={target}
                onChange={e => setTarget(e.target.value)}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', display: 'block', marginBottom: 4 }}>고객 핵심 문제</label>
              <textarea
                className="j-input"
                placeholder="예: 마케팅을 직접 해보려 해도 뭘 만들어야 할지 막막하다"
                value={customerProblem}
                onChange={e => setCustomerProblem(e.target.value)}
                rows={3}
                style={{ width: '100%', resize: 'vertical', fontFamily: 'var(--font-sans)', fontSize: 13 }}
              />
              <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 4 }}>
                키 콘텐츠 분석에 사용됩니다. 프로젝트 생성 시 한 번만 입력합니다.
              </div>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', display: 'block', marginBottom: 4 }}>핵심 제안 / 기능 요약</label>
              <input
                className="j-input"
                placeholder="예: AI가 영상 기획·대본·편집을 대신해주는 마케팅팀"
                value={coreOffer}
                onChange={e => setCoreOffer(e.target.value)}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', display: 'block', marginBottom: 4 }}>비즈니스 목표</label>
              <select
                className="j-input"
                value={goal}
                onChange={e => setGoal(e.target.value)}
              >
                <option value="brand_growth">브랜드 성장</option>
                <option value="consulting_lead">상담 신청</option>
                <option value="product_sale">상품 판매</option>
                <option value="waitlist">대기자 모집</option>
              </select>
            </div>
          </div>
          {err && (
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--red)', padding: '5px 9px', background: 'var(--red-tint)', borderRadius: 4 }}>
              {err}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button
              onClick={create}
              disabled={creating || !title.trim()}
              className="j-btn j-btn-primary"
              style={{ flex: 1 }}
            >
              {creating ? '생성 중...' : '프로젝트 생성'}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="j-btn j-btn-secondary"
            >
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
