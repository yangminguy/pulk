# SECURITY_DATA_GOVERNANCE — L5 Business OS

## Core Principle

Business insights and customer-identifiable data must be separated.

```text
Business insights can become reusable company memory.
Customer personal data must remain purpose-bound, access-controlled, and minimized.
```

## Source of Truth

Core data should live in:

- PostgreSQL
- NocoBase collections
- portable L5 schemas

Not source of truth:

- Langfuse
- Formbricks
- Activepieces
- LLM provider logs
- notification tools

## Data Categories

| Category | Example | Default Access | Usage |
|---|---|---|---|
| Founder Data | Founder DNA, decisions | Founder only/trusted admin | OS improvement |
| Company Data | Culture, rules, workflows | Founder + authorized agents | Operations |
| Business Insight | PMF learnings, message patterns | Founder + relevant agents | Reusable if anonymized |
| Customer PII | name, email, phone | Restricted | Consented purpose only |
| Customer Sensitive Context | revenue, pain points | Highly restricted | Minimized and purpose-bound |
| Agent Logs | outputs, tool calls | Founder + QA/admin | Debugging |
| External Automation Data | webhook payloads | Restricted | Delivery only |

## Required Fields

Every customer-related record must include:

- `pii_level`
- `consent_status` or `consent_scope`
- `allowed_usage`
- `source_ref`

Every external action must include:

- `risk_level`
- `approval_status`
- `approved_by`
- `approved_at`
- `audit_log_ref`

## PII Levels

```text
none: no identifiable information
low: public or low-risk identifier
medium: email/phone/company/contact context
high: sensitive consultation, revenue, legal, private context
```

## LLM Data Minimization

Before sending data to LLMs:

- mask names, emails, phones unless necessary
- use customer segment summaries by default
- send minimum necessary fields only
- avoid raw sensitive PII in Langfuse traces
- mark every LLM call with `pii_level`

## Agent Access Policy

### CEO Agent

- Can access summarized business context
- Can access anonymized customer segment insights
- Needs approval for raw customer PII

### Chief of Staff Agent

- Can access decision queue and summary data
- Should use anonymized summaries by default

### CMO/CRO Agents

- Can access PMF experiment summaries
- Can access contact data only for approved outreach tasks

### Risk/QA Agent

- Can audit PII usage
- Can block unsafe external actions

### External Automation

- Receives only fields required for delivery
- Must not receive broad customer records

## Consent Scope for PMF Experiments

Recommended consent scope:

```text
- Service and business idea validation
- Customer interview/contact
- Consultation or proposal follow-up
- Related service/product information
- Marketing, branding, automation, or AI solution development research
- Anonymized insight analysis and internal service improvement
```

Avoid:

```text
We can use your information for any future purpose.
```

## Export Requirement

Core records must be exportable as:

- JSON
- CSV
- Markdown

## Backup Requirement

MVP:

- manual database dump
- Git-tracked schema/config docs
- periodic export of key collections

Later:

- scheduled DB backup
- object storage backup
- encrypted retention

## Audit Log Requirement

Log:

- who accessed customer PII
- which agent used which data
- which LLM call included PII
- which external automation sent data out
- who approved external actions
- what was exported and by whom
