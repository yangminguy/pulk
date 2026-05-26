import React, { useState, useEffect } from 'react';
import { useAPIClient } from '@nocobase/client';
import { Table, Button, Space, message, Card, Modal, Form, Input, InputNumber, Select } from 'antd';

const { Option } = Select;

export const PMFExperimentsPage = () => {
  const api = useAPIClient();
  const [experiments, setExperiments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [businesses, setBusinesses] = useState<any[]>([]);
  const [form] = Form.useForm();

  const fetchExperiments = async () => {
    setLoading(true);
    try {
      const { data } = await api.resource('pmf_experiments').list();
      setExperiments(data?.data || []);
      
      const { data: bData } = await api.resource('businesses').list();
      setBusinesses(bData?.data || []);
    } catch (e) {
      message.error('Failed to load experiments');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchExperiments();
  }, [api]);

  const handleAddExperiment = async (values: any) => {
    try {
      // Create experiment
      const { data } = await api.resource('pmf_experiments').create({
        values: {
          business_id: String(values.business_id),
          hypothesis: values.hypothesis,
          format: values.format,
          target_segment: values.target_segment,
          status: 'running',
        },
      });
      
      // Also mock some metrics for this experiment based on input for simplicity
      await api.resource('pmf_experiment_metrics').create({
        values: {
          experiment_id: String(data.data.id),
          metric_name: 'customer_retention',
          metric_value: String(values.mock_retention_value || 40),
          signal_level: Math.max(1, Math.min(5, Math.ceil((values.mock_retention_value || 40) / 20))),
          evidence_ref: 'MVP mock retention input',
          collected_at: new Date().toISOString(),
        }
      });
      
      message.success('Experiment added successfully');
      setIsModalVisible(false);
      form.resetFields();
      fetchExperiments();
    } catch (e) {
      message.error('Failed to add experiment');
    }
  };

  const handleCalculateScore = async (record: any) => {
    try {
      const pmfRes = await api.resource('l5').calculatePmfScore({
        values: { experiment_id: String(record.id) }
      });
      const pmf_score = pmfRes.data?.data?.pmfResult?.pmf_score || 0;
      
      await api.resource('l5').decideToolCandidate({
        values: { pmf_score, related_business_id: String(record.business_id) }
      });
      
      message.success(`PMF Score calculated: ${pmf_score}`);
      fetchExperiments();
    } catch (e) {
      message.error('Error calculating PMF score');
    }
  };

  const columns = [
    { title: 'Business ID', dataIndex: 'business_id', key: 'business_id' },
    { title: 'Hypothesis', dataIndex: 'hypothesis', key: 'hypothesis' },
    { title: 'Status', dataIndex: 'status', key: 'status' },
    { title: 'PMF Score', dataIndex: 'pmf_score', key: 'pmf_score' },
    {
      title: 'Action',
      key: 'action',
      render: (_: any, record: any) => (
        <Space size="middle">
          <Button type="primary" onClick={() => handleCalculateScore(record)}>Calculate Score</Button>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Card title="PMF Experiments" extra={<Button type="primary" onClick={() => setIsModalVisible(true)}>Add Experiment</Button>}>
        <Table columns={columns} dataSource={experiments} rowKey="id" loading={loading} />
      </Card>
      
      <Modal
        title="Add New Experiment"
        open={isModalVisible}
        onOk={() => form.submit()}
        onCancel={() => setIsModalVisible(false)}
      >
        <Form form={form} onFinish={handleAddExperiment} layout="vertical">
          <Form.Item name="business_id" label="Business" rules={[{ required: true }]}>
            <Select>
              {businesses.map(b => (
                <Option key={b.id} value={b.id}>{b.title}</Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="hypothesis" label="Hypothesis" rules={[{ required: true }]}>
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="format" label="Format" rules={[{ required: true }]}>
            <Input placeholder="e.g. Landing Page, Concierge..." />
          </Form.Item>
          <Form.Item name="target_segment" label="Target Segment">
            <Input />
          </Form.Item>
          <Form.Item name="mock_retention_value" label="Mock Retention (%)" tooltip="Will be used to test calculatePmfScore">
            <InputNumber min={0} max={100} defaultValue={40} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
