'use client';

import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { UploadDraftSchema, type UploadDraftFormData } from '../schemas/upload-draft.schema';

const CATEGORIES = ['마케팅', '영상', '디자인', '문서', '기타'];
const RISK_LEVELS = ['D1', 'D2', 'D3', 'D4', 'D5'] as const;

interface UploadDraftCardProps {
  onSubmit?: (data: UploadDraftFormData, file?: File) => void;
}

export function UploadDraftCard({ onSubmit }: UploadDraftCardProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState('');

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(UploadDraftSchema),
    defaultValues: { title: '', description: '', category: '', tags: [] as string[], risk_level: 'D1' as const, fileId: '' },
  });

  const tags = watch('tags') ?? [];

  const onDrop = useCallback((accepted: File[]) => {
    const f = accepted[0];
    if (!f) return;
    setFile(f);
    if (f.type.startsWith('image/')) {
      setPreview(URL.createObjectURL(f));
    } else {
      setPreview(null);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
  });

  const addTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const v = tagInput.trim();
    if (!v || tags.includes(v)) return;
    setValue('tags', [...tags, v]);
    setTagInput('');
  };

  const removeTag = (t: string) => {
    setValue('tags', tags.filter((x) => x !== t));
  };

  const doSubmit = (data: Record<string, unknown>) => {
    onSubmit?.(data as UploadDraftFormData, file ?? undefined);
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="mb-4 text-lg font-semibold">드래프트 업로드</h3>

      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={`mb-4 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition ${
          isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
        }`}
      >
        <input {...getInputProps()} />
        {preview ? (
          <img src={preview} alt="미리보기" className="mb-2 max-h-40 rounded" />
        ) : file ? (
          <p className="text-sm text-gray-600">{file.name}</p>
        ) : (
          <p className="text-sm text-gray-500">
            파일을 드래그하거나 클릭하여 선택하세요
          </p>
        )}
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit(doSubmit)} className="space-y-4">
        {/* 제목 */}
        <div>
          <label className="mb-1 block text-sm font-medium">제목</label>
          <input
            {...register('title')}
            className="w-full rounded border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
            placeholder="드래프트 제목"
          />
          {errors.title && (
            <p className="mt-1 text-sm text-red-500">{errors.title.message}</p>
          )}
        </div>

        {/* 설명 */}
        <div>
          <label className="mb-1 block text-sm font-medium">설명</label>
          <textarea
            {...register('description')}
            className="w-full rounded border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
            rows={3}
            placeholder="설명 (선택)"
          />
        </div>

        {/* 카테고리 */}
        <div>
          <label className="mb-1 block text-sm font-medium">카테고리</label>
          <select
            {...register('category')}
            className="w-full rounded border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
            defaultValue=""
          >
            <option value="" disabled>
              카테고리 선택
            </option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          {errors.category && (
            <p className="mt-1 text-sm text-red-500">{errors.category.message}</p>
          )}
        </div>

        {/* Risk Level */}
        <div>
          <label className="mb-1 block text-sm font-medium">Risk Level</label>
          <select
            {...register('risk_level')}
            className="w-full rounded border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
          >
            {RISK_LEVELS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>

        {/* 태그 */}
        <div>
          <label className="mb-1 block text-sm font-medium">태그</label>
          <div className="flex flex-wrap gap-1 mb-2">
            {tags.map((t) => (
              <span
                key={t}
                className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-800"
              >
                {t}
                <button
                  type="button"
                  onClick={() => removeTag(t)}
                  className="text-gray-500 hover:text-red-500"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={addTag}
            className="w-full rounded border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
            placeholder="태그 입력 후 Enter"
          />
        </div>

        <button
          type="submit"
          className="w-full rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
        >
          업로드
        </button>
      </form>
    </div>
  );
}

export default UploadDraftCard;
