import React, { useState } from 'react';
import { TaskMonitorView } from './TaskMonitorView.js';
import { ApprovalQueueView } from './ApprovalQueueView.js';
import { FounderBriefPreview } from './FounderBriefPreview.js';
import { MemoryReview } from './MemoryReview.js';
import { FounderChatView } from './FounderChatView.js';
import { WorkflowFactoryView } from './WorkflowFactoryView.js';

type Tab = 'chat' | 'monitor' | 'approval' | 'brief' | 'memory' | 'workflow';

export const ExecutiveMonitor: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('chat');

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 1200, margin: '0 auto', background: '#f9fafb', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '16px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#111827' }}>Agent Control Tower</h1>
            <p style={{ margin: '4px 0 0', fontSize: 14, color: '#6b7280' }}>L5 Business OS - Founder Workspace</p>
          </div>
        </div>
        
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 24, marginTop: 24, borderBottom: '2px solid transparent' }}>
          <TabButton active={activeTab === 'chat'} onClick={() => setActiveTab('chat')}>CEO 채팅</TabButton>
          <TabButton active={activeTab === 'monitor'} onClick={() => setActiveTab('monitor')}>현황 모니터</TabButton>
          <TabButton active={activeTab === 'approval'} onClick={() => setActiveTab('approval')}>승인 대기</TabButton>
          <TabButton active={activeTab === 'brief'} onClick={() => setActiveTab('brief')}>Founder Brief</TabButton>
          <TabButton active={activeTab === 'memory'} onClick={() => setActiveTab('memory')}>Memory Review</TabButton>
          <TabButton active={activeTab === 'workflow'} onClick={() => setActiveTab('workflow')}>워크플로 팩토리</TabButton>
        </div>
      </header>

      {/* Content */}
      <main style={{ padding: '24px', flex: 1 }}>
        {activeTab === 'chat' && <FounderChatView />}
        {activeTab === 'monitor' && <TaskMonitorView />}
        {activeTab === 'approval' && <ApprovalQueueView />}
        {activeTab === 'brief' && <FounderBriefPreview />}
        {activeTab === 'memory' && <MemoryReview />}
        {activeTab === 'workflow' && <WorkflowFactoryView />}
      </main>
    </div>
  );
};

const TabButton: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    style={{
      background: 'none',
      border: 'none',
      padding: '0 0 12px',
      margin: 0,
      fontSize: 15,
      fontWeight: active ? 600 : 500,
      color: active ? '#2563eb' : '#6b7280',
      borderBottom: active ? '2px solid #2563eb' : '2px solid transparent',
      cursor: 'pointer',
      transform: 'translateY(1px)', // align with parent border
    }}
  >
    {children}
  </button>
);
