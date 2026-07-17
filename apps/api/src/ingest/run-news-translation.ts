import pg, { type PoolClient, type QueryResultRow } from 'pg';

import {
  identityTranslation,
  parseTranslationResponse,
  type TranslationInput,
  type TranslationOutput,
} from './news-translation.ts';

const DEFAULT_MODEL = 'gemini-3.1-flash-lite';
const DEFAULT_LIMIT = 100;
const BATCH_SIZE = 12;

type PendingRow = QueryResultRow & {
  id: string | number | bigint;
  title: string;
  summary: string | null;
};

type PgModule = {
  Pool: new (options: { connectionString: string; max?: number }) => {
    connect: () => Promise<PoolClient>;
    end: () => Promise<void>;
  };
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function cliLimit(): number {
  const index = process.argv.indexOf('--limit');
  if (index < 0) return DEFAULT_LIMIT;
  const value = Number(process.argv[index + 1]);
  if (!Number.isInteger(value) || value < 1 || value > 500) {
    throw new Error('--limit must be an integer between 1 and 500');
  }
  return value;
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

async function geminiTranslate(
  inputs: readonly TranslationInput[],
  apiKey: string,
  model: string,
): Promise<TranslationOutput[]> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const prompt = [
    'Translate the following financial/news text into natural, concise Korean.',
    'Preserve company names, tickers, numbers, and meaning. Do not add facts, advice, or commentary.',
    'Return every id exactly once. summaryKo may be omitted only when summary is absent.',
    JSON.stringify(inputs),
  ].join('\n');
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 4096,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        required: ['translations'],
        properties: {
          translations: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              required: ['id', 'titleKo'],
              properties: {
                id: { type: 'STRING' },
                titleKo: { type: 'STRING' },
                summaryKo: { type: 'STRING' },
              },
            },
          },
        },
      },
    },
  };

  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) throw new Error(`Gemini translation failed with HTTP ${response.status}`);
      const payload = (await response.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('Gemini translation returned no text');
      const outputs = parseTranslationResponse(JSON.parse(text) as unknown, inputs);
      if (outputs.length !== inputs.length) {
        throw new Error(`Gemini returned ${outputs.length}/${inputs.length} valid translations`);
      }
      return outputs;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
    }
  }
  throw lastError;
}

async function myMemoryTranslate(input: TranslationInput): Promise<TranslationOutput> {
  async function translate(value: string): Promise<string> {
    const endpoint = new URL('https://api.mymemory.translated.net/get');
    endpoint.searchParams.set('q', value.slice(0, 450));
    endpoint.searchParams.set('langpair', 'en|ko');
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`MyMemory fallback failed with HTTP ${response.status}`);
    const payload = (await response.json()) as {
      responseData?: { translatedText?: string };
      responseStatus?: number;
    };
    const translated = payload.responseData?.translatedText?.trim();
    if (payload.responseStatus !== 200 || !translated) {
      throw new Error('MyMemory fallback returned no translation');
    }
    return translated;
  }

  const titleKo = await translate(input.title);
  const summaryKo = input.summary ? await translate(input.summary) : undefined;
  return { id: input.id, titleKo, ...(summaryKo ? { summaryKo } : {}) };
}

async function loadPending(client: PoolClient, limit: number): Promise<TranslationInput[]> {
  const result = await client.query<PendingRow>(
    `SELECT id, title, summary
       FROM public.source_documents
      WHERE source_system = 'rss_news'
        AND source_type = 'news'
        AND title_ko IS NULL
        AND coalesce(title, '') <> ''
      ORDER BY id
      LIMIT $1`,
    [limit],
  );
  return result.rows.map((row) => ({
    id: String(row.id),
    title: row.title,
    ...(row.summary?.trim() ? { summary: row.summary.trim() } : {}),
  }));
}

async function run(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const limit = cliLimit();
  const Pool = (pg as PgModule).Pool;
  const pool = new Pool({ connectionString: required('DATABASE_URL'), max: 1 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const pending = await loadPending(client, limit);
    await client.query('COMMIT');

    const identity = pending.flatMap((input) => {
      const translated = identityTranslation(input);
      return translated ? [translated] : [];
    });
    const identityIds = new Set(identity.map((item) => item.id));
    const external = pending.filter((item) => !identityIds.has(item.id));

    if (!apply) {
      console.log(
        JSON.stringify({
          mode: 'dry-run',
          readOnly: true,
          pending: pending.length,
          koreanIdentity: identity.length,
          externalTranslation: external.length,
          model: process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL,
        }),
      );
      return;
    }

    const apiKey = required('GEMINI_API_KEY');
    const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
    const translated: TranslationOutput[] = [...identity];
    let gemini = 0;
    let fallback = 0;

    for (const batch of chunks(external, BATCH_SIZE)) {
      try {
        const outputs = await geminiTranslate(batch, apiKey, model);
        translated.push(...outputs);
        gemini += outputs.length;
      } catch {
        for (const input of batch) {
          translated.push(await myMemoryTranslate(input));
          fallback += 1;
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      }
    }

    await client.query('BEGIN');
    await client.query("SELECT set_config('lock_timeout', '5s', true)");
    for (const item of translated) {
      await client.query(
        `UPDATE public.source_documents
            SET title_ko = $2,
                summary_ko = $3,
                translated_at = now()
          WHERE id = $1::bigint
            AND title_ko IS NULL`,
        [item.id, item.titleKo, item.summaryKo ?? null],
      );
    }
    await client.query('COMMIT');
    console.log(
      JSON.stringify({
        mode: 'apply',
        pending: pending.length,
        translated: translated.length,
        koreanIdentity: identity.length,
        gemini,
        fallback,
        model,
      }),
    );
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Preserve original failure.
    }
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

await run();
