import { generateWorkflow } from '../generator';
import type { WorkflowFactoryInput } from '../types';

const baseInput: WorkflowFactoryInput = {
  business_idea: 'B2B SaaS 영업 자동화 솔루션',
};

describe('generateWorkflow', () => {
  it('returns WorkflowFactoryOutput with all required fields', () => {
    const output = generateWorkflow(baseInput);
    expect(output).toHaveProperty('business_brief');
    expect(output).toHaveProperty('pmf_experiment_plan');
    expect(output).toHaveProperty('agent_staffing_plan');
    expect(output).toHaveProperty('generated_at');
  });

  it('business_brief.founder_fit_score is 70 with no context', () => {
    const output = generateWorkflow(baseInput);
    expect(output.business_brief.founder_fit_score).toBe(70);
  });

  it('business_brief.founder_fit_score increases with founder_context', () => {
    const output = generateWorkflow({
      ...baseInput,
      founder_context: '10년 B2B 영업 경험',
    });
    expect(output.business_brief.founder_fit_score).toBe(80);
  });

  it('business_brief.founder_fit_score increases with both contexts', () => {
    const output = generateWorkflow({
      ...baseInput,
      founder_context: '10년 B2B 영업 경험',
      memory_context: '이전 SaaS 실패 학습',
    });
    expect(output.business_brief.founder_fit_score).toBe(85);
  });

  it('pmf_experiment_plan.experiment_type is message_test by default', () => {
    const output = generateWorkflow(baseInput);
    expect(output.pmf_experiment_plan.experiment_type).toBe('message_test');
  });

  it('pmf_experiment_plan.experiment_type is customer_interview when idea contains interview', () => {
    const output = generateWorkflow({ business_idea: 'customer interview 기반 수요 검증' });
    expect(output.pmf_experiment_plan.experiment_type).toBe('customer_interview');
  });

  it('pmf_experiment_plan.experiment_type is landing_page when idea contains landing', () => {
    const output = generateWorkflow({ business_idea: 'landing page로 수요 측정' });
    expect(output.pmf_experiment_plan.experiment_type).toBe('landing_page');
  });

  it('pmf_experiment_plan.experiment_type is waitlist when idea contains waitlist', () => {
    const output = generateWorkflow({ business_idea: 'waitlist 기반 얼리어답터 모집' });
    expect(output.pmf_experiment_plan.experiment_type).toBe('waitlist');
  });

  it('agent_staffing_plan.primary_agent is CMO', () => {
    const output = generateWorkflow(baseInput);
    expect(output.agent_staffing_plan.primary_agent).toBe('CMO');
  });

  it('agent_staffing_plan.task_assignments.length === 4', () => {
    const output = generateWorkflow(baseInput);
    expect(output.agent_staffing_plan.task_assignments).toHaveLength(4);
  });

  it('task_assignments covers CMO, CTO, CPO, RiskQA', () => {
    const output = generateWorkflow(baseInput);
    const agents = output.agent_staffing_plan.task_assignments.map((t) => t.agent);
    expect(agents).toContain('CMO');
    expect(agents).toContain('CTO');
    expect(agents).toContain('CPO');
    expect(agents).toContain('RiskQA');
  });

  it('pmf_experiment_plan.timeline_days === 7', () => {
    const output = generateWorkflow(baseInput);
    expect(output.pmf_experiment_plan.timeline_days).toBe(7);
  });
});
