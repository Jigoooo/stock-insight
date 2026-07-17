export const sourceDocumentKoreanTranslationMigrationSql = `
ALTER TABLE public.source_documents
  ADD COLUMN IF NOT EXISTS title_ko text,
  ADD COLUMN IF NOT EXISTS summary_ko text,
  ADD COLUMN IF NOT EXISTS translated_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_source_documents_translation_pending
  ON public.source_documents (source_system, source_type, id)
  WHERE title_ko IS NULL;
`;
