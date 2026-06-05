describe('QA governance schemas', () => {
  const loadGovernance = () => require('../governance');

  it('rejects CustomerRecord without pii_level', () => {
    const { CustomerRecordSchema } = loadGovernance();

    const result = CustomerRecordSchema.safeParse({
      consent_status: 'approved',
      consent_scope: 'pmf_interview',
    });

    expect(result.success).toBe(false);
  });

  it('rejects CustomerRecord without consent_status', () => {
    const { CustomerRecordSchema } = loadGovernance();

    const result = CustomerRecordSchema.safeParse({
      pii_level: 'medium',
      consent_scope: 'pmf_interview',
    });

    expect(result.success).toBe(false);
  });

  it('accepts CustomerRecord with governance fields', () => {
    const { CustomerRecordSchema } = loadGovernance();

    const result = CustomerRecordSchema.safeParse({
      pii_level: 'medium',
      consent_status: 'approved',
      consent_scope: 'pmf_interview',
    });

    expect(result.success).toBe(true);
  });

  it('rejects ExternalAction without risk_level', () => {
    const { ExternalActionSchema } = loadGovernance();

    const result = ExternalActionSchema.safeParse({
      approval_status: 'approved',
    });

    expect(result.success).toBe(false);
  });

  it('rejects D4 ExternalAction without approval_status', () => {
    const { ExternalActionSchema } = loadGovernance();

    const result = ExternalActionSchema.safeParse({
      risk_level: 'D4',
    });

    expect(result.success).toBe(false);
  });

  it('accepts D2 ExternalAction without approval_status', () => {
    const { ExternalActionSchema } = loadGovernance();

    const result = ExternalActionSchema.safeParse({
      risk_level: 'D2',
    });

    expect(result.success).toBe(true);
  });

  it('rejects BusinessInsight with PII fields', () => {
    const { BusinessInsightSchema } = loadGovernance();

    const result = BusinessInsightSchema.safeParse({
      content: 'Founder wants a concierge workflow',
      category: 'pmf_learning',
      searchable_tags: ['workflow'],
      email: 'founder@example.com',
    });

    expect(result.success).toBe(false);
  });

  it('accepts only json, csv, and markdown export formats', () => {
    const { ExportFormatSchema } = loadGovernance();

    expect(ExportFormatSchema.safeParse('json').success).toBe(true);
    expect(ExportFormatSchema.safeParse('csv').success).toBe(true);
    expect(ExportFormatSchema.safeParse('markdown').success).toBe(true);
    expect(ExportFormatSchema.safeParse('pdf').success).toBe(false);
  });
});
