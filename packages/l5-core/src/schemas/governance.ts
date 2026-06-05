import { z } from 'zod';

const PIILevel = z.enum(['none', 'low', 'medium', 'high']);
const RiskLevel = z.enum(['D1', 'D2', 'D3', 'D4', 'D5']);
const ConsentStatus = z.enum(['pending', 'approved', 'rejected', 'expired']);

export const CustomerRecordSchema = z.object({
  pii_level: PIILevel,
  consent_status: ConsentStatus,
  consent_scope: z.string().min(1),
});

export const ExternalActionSchema = z.object({
  risk_level: RiskLevel,
  approval_status: z.string().optional(),
}).refine(
  (data) => {
    if (['D3', 'D4', 'D5'].includes(data.risk_level)) {
      return data.approval_status != null;
    }
    return true;
  },
  { message: 'D3-D5 actions require approval_status' },
);

export const BusinessInsightSchema = z.object({
  content: z.string(),
  category: z.string(),
  searchable_tags: z.array(z.string()),
}).strict();

export const ExportFormatSchema = z.enum(['json', 'csv', 'markdown']);
