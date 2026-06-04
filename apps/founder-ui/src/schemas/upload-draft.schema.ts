import { z } from 'zod';

export const UploadDraftSchema = z.object({
  title: z.string().min(1, '제목을 입력해주세요.'),
  description: z.string().optional(),
  category: z.string().min(1, '카테고리를 선택해주세요.'),
  tags: z.array(z.string()).default([]),
  risk_level: z.enum(['D1', 'D2', 'D3', 'D4', 'D5']).default('D1'),
  fileId: z.string().optional(),
});

export type UploadDraftFormData = z.infer<typeof UploadDraftSchema>;
