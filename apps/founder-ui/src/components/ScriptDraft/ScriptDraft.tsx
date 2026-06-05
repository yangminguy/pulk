'use client'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { PlainTextPlugin } from '@lexical/react/LexicalPlainTextPlugin'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import type { EditorState } from 'lexical'

function onError(error: Error) {
  console.error('[ScriptDraft]', error)
}

export default function ScriptDraft({
  onChange,
}: {
  onChange?: (text: string) => void
}) {
  const initialConfig = {
    namespace: 'ScriptDraft',
    theme: {},
    onError,
  }

  const handleChange = (editorState: EditorState) => {
    editorState.read(() => {
      onChange?.(JSON.stringify(editorState.toJSON()))
    })
  }

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div style={{ border: '1px solid var(--silver-2)', borderRadius: 8, overflow: 'hidden', position: 'relative' }}>
        <PlainTextPlugin
          contentEditable={
            <ContentEditable
              style={{
                padding: '12px 16px',
                minHeight: 200,
                outline: 'none',
                fontSize: 14,
                lineHeight: 1.7,
                fontFamily: 'var(--font-mono)',
              }}
            />
          }
          placeholder={
            <div style={{ padding: '12px 16px', color: 'var(--ink-4)', position: 'absolute', top: 0, pointerEvents: 'none' }}>
              Fountain 형식으로 스크립트를 작성하세요...
            </div>
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
        <HistoryPlugin />
        <OnChangePlugin onChange={handleChange} />
      </div>
    </LexicalComposer>
  )
}
