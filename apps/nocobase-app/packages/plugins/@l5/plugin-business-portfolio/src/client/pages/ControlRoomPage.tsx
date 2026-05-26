import React, { useState, useEffect } from 'react';
import { useAPIClient } from '@nocobase/client';
import { Table, Button, Space, message, Card, Typography, Row, Col, Modal, Input } from 'antd';

const { Title } = Typography;

export const ControlRoomPage = () => {
  const api = useAPIClient();
  const [decisions, setDecisions] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [decisionRes, alertRes] = await Promise.all([
        api.resource('decision_queue').list(),
        api.resource('hermes_alerts').list(),
      ]);
      setDecisions(decisionRes.data?.data || []);
      setAlerts(alertRes.data?.data || []);
    } catch (e) {
      message.error('Failed to load control room data');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [api]);

  const handleDecisionAction = async (id: string, newStatus: string) => {
    try {
      await api.resource('decision_queue').update({
        filterByTk: String(id),
        values: { status: newStatus },
      });
      message.success(`Decision marked as ${newStatus}`);
      fetchData();
    } catch (e) {
      message.error('Failed to update decision');
    }
  };

  const handleAlertResolve = async (id: string) => {
    try {
      await api.resource('hermes_alerts').update({
        filterByTk: String(id),
        values: { status: 'resolved' },
      });
      message.success('Alert resolved');
      fetchData();
    } catch (e) {
      message.error('Failed to update alert');
    }
  };

  const decisionColumns = [
    { title: 'Type', dataIndex: 'decision_type', key: 'decision_type' },
    { title: 'Title', dataIndex: 'title', key: 'title' },
    { title: 'Status', dataIndex: 'status', key: 'status' },
    {
      title: 'Action',
      key: 'action',
      render: (_: any, record: any) => (
        record.status === 'open' ? (
          <Space size="middle">
            <Button type="primary" onClick={() => handleDecisionAction(record.id, 'approved')}>Approve</Button>
            <Button danger onClick={() => handleDecisionAction(record.id, 'rejected')}>Reject</Button>
          </Space>
        ) : (
          <span>{record.status}</span>
        )
      ),
    },
  ];

  const alertColumns = [
    { title: 'Severity', dataIndex: 'severity', key: 'severity' },
    { title: 'Message', dataIndex: 'message', key: 'message' },
    { title: 'Status', dataIndex: 'status', key: 'status' },
    {
      title: 'Action',
      key: 'action',
      render: (_: any, record: any) => (
        record.status === 'open' ? (
          <Button type="primary" onClick={() => handleAlertResolve(record.id)}>Resolve</Button>
        ) : (
          <span>{record.status}</span>
        )
      ),
    },
  ];

  const handleTriggerAction = async () => {
    // A quick way to test generating an alert or decision for demonstration
    try {
      await api.resource('l5').requiresFounderApproval({
        values: { decisionType: 'budget_increase', riskLevel: 'D4', title: 'Need more budget' },
      });
      message.success('Test decision generated');
      fetchData();
    } catch(e) {
      message.error('Failed to trigger action');
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <Row gutter={24}>
        <Col span={12}>
          <Card title="Pending Decisions" extra={<Button onClick={handleTriggerAction}>Test Decision</Button>}>
            <Table columns={decisionColumns} dataSource={decisions} rowKey="id" loading={loading} />
          </Card>
        </Col>
        <Col span={12}>
          <Card title="Hermes Alerts">
            <Table columns={alertColumns} dataSource={alerts} rowKey="id" loading={loading} />
          </Card>
        </Col>
      </Row>
    </div>
  );
};
