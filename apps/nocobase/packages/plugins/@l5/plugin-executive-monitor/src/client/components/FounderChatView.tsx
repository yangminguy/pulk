// Founder Chat UI — CEO Agent와의 채팅 인터페이스
// POST /api/chat:submitInstruction 호출
// 응답: { ok, instruction_id, interpretation, tasks }

import React, { useEffect, useRef, useState, type KeyboardEvent } from 'react';

interface ChatTask {
  assigned_agent: string;
  title: string;
  risk_level?: string;
}

interface ChatMessage {
  id: string;
  role: 'founder' | 'ceo';
  content: string;
  timestamp: string;
  tasks?: ChatTask[];
}

interface SubmitResponse {
  ok: boolean;
  error?: string;
  instruction_id?: string;
  interpretation?: {
    goal?: string;
    phase?: string;
    risk_level?: string;
    approval_required?: boolean;
  };
  tasks?: ChatTask[];
}

export const FounderChatView: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const handleSubmit = async (): Promise<void> => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const userMsg: ChatMessage = {
      id: `${Date.now()}-founder`,
      role: 'founder',
      content: trimmed,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/chat:submitInstruction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_text: trimmed, source: 'chat' }),
      });
      const json = (await res.json()) as SubmitResponse;
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? 'CEO Agent 응답 실패');
      }

      const tasks = json.tasks ?? [];
      const interpretation = json.interpretation;
      const briefLines: string[] = [];

      if (interpretation?.goal) briefLines.push(`목표: ${interpretation.goal}`);
      if (interpretation?.phase) briefLines.push(`Phase: ${interpretation.phase}`);
      if (interpretation?.risk_level) briefLines.push(`Risk: ${interpretation.risk_level}`);
      if (interpretation?.approval_required) briefLines.push(`승인 필요: yes`);
      if (tasks.length > 0) briefLines.push(`\n${tasks.length}개 Agent 태스크 생성됨:`);
      tasks.forEach((t) => {
        const risk = t.risk_level ? ` (${t.risk_level})` : '';
        briefLines.push(`  • [${t.assigned_agent}] ${t.title}${risk}`);
      });

      const ceoMsg: ChatMessage = {
        id: `${Date.now()}-ceo`,
        role: 'ceo',
        content: briefLines.join('\n') || 'CEO Agent가 지시를 처리했습니다.',
        timestamp: new Date().toISOString(),
        tasks,
      };
      setMessages((prev) => [...prev, ceoMsg]);
    } catch (e) {
      setError(e instanceof Error ? e.message : '오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 200px)',
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      {/* Message list */}
      <div
        ref={listRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          background: '#f9fafb',
        }}
      >
        {messages.length === 0 && (
          <div style={{ color: '#9ca3af', textAlign: 'center', marginTop: 40, fontSize: 14 }}>
            Founder 지시를 입력하면 CEO Agent가 해석하고 Executive Agent에게 태스크를 분배합니다.
          </div>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
        {loading && (
          <div style={{ alignSelf: 'flex-start', color: '#6b7280', fontSize: 13, fontStyle: 'italic' }}>
            CEO Agent 응답 중…
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div
          style={{
            padding: '8px 16px',
            background: '#fef2f2',
            color: '#b91c1c',
            fontSize: 13,
            borderTop: '1px solid #fecaca',
          }}
        >
          {error}
        </div>
      )}

      {/* Input */}
      <div
        style={{
          borderTop: '1px solid #e5e7eb',
          padding: 16,
          background: '#fff',
          display: 'flex',
          gap: 8,
          alignItems: 'flex-end',
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Founder 지시를 입력하세요. (Enter 전송, Shift+Enter 줄바꿈)"
          rows={2}
          disabled={loading}
          style={{
            flex: 1,
            resize: 'none',
            padding: '10px 12px',
            border: '1px solid #d1d5db',
            borderRadius: 6,
            fontFamily: 'inherit',
            fontSize: 14,
            outline: 'none',
          }}
        />
        <button
          onClick={() => void handleSubmit()}
          disabled={loading || !input.trim()}
          style={{
            background: loading || !input.trim() ? '#9ca3af' : '#2563eb',
            color: '#fff',
            border: 'none',
            padding: '10px 16px',
            borderRadius: 6,
            fontSize: 14,
            fontWeight: 600,
            cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
            height: 44,
          }}
        >
          전송
        </button>
      </div>
    </div>
  );
};

const MessageBubble: React.FC<{ message: ChatMessage }> = ({ message }) => {
  const isFounder = message.role === 'founder';
  return (
    <div
      style={{
        alignSelf: isFounder ? 'flex-end' : 'flex-start',
        maxWidth: '75%',
        background: isFounder ? '#2563eb' : '#e5e7eb',
        color: isFounder ? '#fff' : '#111827',
        padding: '10px 14px',
        borderRadius: 12,
        borderBottomRightRadius: isFounder ? 2 : 12,
        borderBottomLeftRadius: isFounder ? 12 : 2,
        fontSize: 14,
        whiteSpace: 'pre-wrap',
        fontFamily: isFounder
          ? 'inherit'
          : 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        lineHeight: 1.5,
      }}
    >
      <div>{message.content}</div>
      <div
        style={{
          fontSize: 11,
          marginTop: 6,
          opacity: 0.7,
          textAlign: isFounder ? 'right' : 'left',
        }}
      >
        {new Date(message.timestamp).toLocaleTimeString()}
      </div>
    </div>
  );
};
