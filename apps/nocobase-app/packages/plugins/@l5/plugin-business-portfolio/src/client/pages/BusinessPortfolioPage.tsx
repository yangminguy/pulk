import React, { useState, useEffect } from 'react';
import { useAPIClient } from '@nocobase/client';
import { Table, Button, Space, message, Card, Modal, Form, Input } from 'antd';

export const BusinessPortfolioPage = () => {
  const api = useAPIClient();
  const [ideas, setIdeas] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [form] = Form.useForm();

  const fetchIdeas = async () => {
    setLoading(true);
    try {
      const { data } = await api.resource('business_ideas').list();
      setIdeas(data?.data || []);
    } catch (e) {
      message.error('Failed to load ideas');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchIdeas();
  }, [api]);

  const handleAddIdea = async (values: any) => {
    try {
      await api.resource('business_ideas').create({
        values: {
          ...values,
          source: 'founder',
          status: 'idea',
          risk_level: 'D3',
        },
      });
      message.success('Idea added successfully');
      setIsModalVisible(false);
      form.resetFields();
      fetchIdeas();
    } catch (e) {
      message.error('Failed to add idea');
    }
  };

  const handleRunFounderFit = async (id: string) => {
    try {
      await api.resource('l5').scoreFounderFit({
        values: { business_idea_id: String(id) }
      });
      await api.resource('l5').generateBusinessBrief({
        values: { business_idea_id: String(id) }
      });
      message.success('Founder Fit and Brief generated successfully');
      fetchIdeas();
    } catch (e) {
      message.error('Error running Founder Fit');
    }
  };

  const handleViewBrief = async (id: string) => {
    try {
      const { data } = await api.resource('business_briefs').list({
        filter: { business_id: String(id) }
      });
      if (data?.data?.length > 0) {
        Modal.info({
          title: data.data[0].title,
          content: (
            <div style={{ whiteSpace: 'pre-wrap' }}>
              {data.data[0].summary}
            </div>
          ),
          width: 800,
        });
      } else {
        message.info('No brief found for this idea.');
      }
    } catch (e) {
      message.error('Failed to fetch brief');
    }
  };

  const handleCreateBusiness = async (record: any) => {
    try {
      // Typically we'd request approval first or create the business directly
      await api.resource('businesses').create({
        values: {
          title: record.title,
          one_liner: record.raw_description,
          status: 'planned',
          founder_fit_score: record.founder_fit_score,
          opportunity_score: record.opportunity_score,
          created_from_idea_id: String(record.id),
        },
      });
      await api.resource('business_ideas').update({
        filterByTk: String(record.id),
        values: { status: 'business_created' },
      });
      message.success('Business created successfully');
      fetchIdeas();
    } catch (e) {
      message.error('Error creating business');
    }
  };

  const columns = [
    { title: 'Title', dataIndex: 'title', key: 'title' },
    { title: 'Status', dataIndex: 'status', key: 'status' },
    { title: 'Founder Fit', dataIndex: 'founder_fit_score', key: 'founder_fit_score' },
    { title: 'Opp. Score', dataIndex: 'opportunity_score', key: 'opportunity_score' },
    {
      title: 'Action',
      key: 'action',
      render: (_: any, record: any) => (
        <Space size="middle">
          <Button type="primary" onClick={() => handleRunFounderFit(record.id)}>Run Founder Fit</Button>
          <Button onClick={() => handleViewBrief(record.id)}>View Brief</Button>
          <Button onClick={() => handleCreateBusiness(record)}>Create Business</Button>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Card title="Business Portfolio (Ideas)" extra={<Button type="primary" onClick={() => setIsModalVisible(true)}>Add Idea</Button>}>
        <Table columns={columns} dataSource={ideas} rowKey="id" loading={loading} />
      </Card>
      
      <Modal
        title="Add New Business Idea"
        open={isModalVisible}
        onOk={() => form.submit()}
        onCancel={() => setIsModalVisible(false)}
      >
        <Form form={form} onFinish={handleAddIdea} layout="vertical">
          <Form.Item name="title" label="Title" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="raw_description" label="Description" rules={[{ required: true }]}>
            <Input.TextArea rows={4} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
