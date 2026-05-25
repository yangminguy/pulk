# WORKFLOW_FACTORY_SPEC — L5 Business OS

## Purpose

Workflow Factory turns a raw business idea into an executable business workflow.

It should not create fixed templates only. It should generate context-aware workflows based on Founder DNA, company culture, memory, business type, and PMF signals.

## Input

```ts
type WorkflowFactoryInput = {
  business_idea: BusinessIdea;
  founder_dna: FounderDNA[];
  culture_rules: CompanyCulture[];
  relevant_memory: MemoryEntry[];
  current_portfolio: Business[];
  available_agents: Agent[];
  resource_constraints: string[];
  market_or_customer_hypothesis?: string;
};
```

## Output

```ts
type WorkflowFactoryOutput = {
  business_brief: string;
  founder_fit_score: number;
  opportunity_score: number;
  business_model_draft: string;
  pmf_experiment_plan: PMFExperiment;
  agent_staffing_plan: AgentAssignment[];
  workflows: Workflow[];
  seven_day_experiment: string;
  kill_criteria: string[];
  scale_criteria: string[];
  tool_requests: ToolRequest[];
  decision_items: DecisionQueue[];
};
```

## Required Generated Documents Per Business

```text
BUSINESS_BRIEF.md
FOUNDER_FIT_SCORE.md
OPPORTUNITY_SCORE.md
BUSINESS_MODEL_DRAFT.md
PMF_EXPERIMENT_PLAN.md
AGENT_STAFFING_PLAN.md
REVENUE_WORKFLOW.md
MARKETING_WORKFLOW.md
SALES_WORKFLOW.md
DELIVERY_WORKFLOW.md
BPR_WORKFLOW.md
TOOL_REQUESTS.md
7_DAY_EXPERIMENT.md
KILL_OR_SCALE_CRITERIA.md
```

## Generation Steps

### 1. Idea Intake

Normalize raw idea into:

- target customer
- problem
- value proposition
- delivery mode
- revenue hypothesis
- risk notes

### 2. Founder DNA Filter

Score:

- Founder Fit
- Interest Fit
- Skill Fit
- Energy Fit
- Brand Fit
- Risk Fit
- Long-term Asset Fit

### 3. Memory Retrieval

Retrieve relevant:

- past message wins
- failed customer groups
- prior rejected business models
- repeated bottlenecks
- sales/revenue signals
- Founder preference patterns

### 4. PMF Experiment Design

Before tool building, create one or more:

- content test
- message test
- landing test
- proposal test
- waitlist
- interview
- manual delivery MVP

### 5. Agent Staffing

Assign executive and squad agents.

Every assignment must include:

- responsibility
- expected output
- authority scope
- report rule
- automation opportunity

### 6. Workflow Generation

Generate at least:

- Revenue Workflow
- Marketing Workflow
- Sales Workflow
- Delivery Workflow
- BPR Workflow
- Tool Request Workflow

### 7. Hermes Setup

Create monitoring rules:

- stalled threshold
- experiment deadline
- approval queue watch
- memory update trigger
- BPR trigger

### 8. Kill / Scale Criteria

Every business must begin with explicit criteria.

Kill examples:

- no meaningful response after 5 content tests
- 0 replies after 30 messages
- founder fit below threshold
- delivery too heavy

Scale examples:

- paid intent
- repeated inquiry
- clear customer segment
- repeated content signal

## Rules

- PMF Experiment must come before Tool Request.
- Tool Request requires repeated work or strong demand signal.
- Workflows must be stored as structured records, not only markdown.
- Every generated recommendation must include source refs.
- Every external action must include risk level.
- Every customer data usage must include pii_level and consent scope.
