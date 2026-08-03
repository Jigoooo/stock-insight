export const marketTopicVocabularyMigrationSql = `
-- Vocabulary for recognising market-wide news that names no company.
--
-- Measured 2026-08-03: of 4,000 current observations, 3,099 attach to a company
-- and 901 do not. Of those 901, 105 carry market vocabulary — treasury yields,
-- policy rates, tariffs, index moves — and the rest are local government notices,
-- retail promotions and property disputes that no stock page should carry.
--
-- The terms are a definition, not a measurement. Nobody can look them up; someone
-- has to decide what counts as market news. That is the same shape as the theme
-- keywords rejected on the same day, and it is allowed here for one reason: this
-- surface attaches nothing to a company. A wrong term puts an odd item in a list
-- of market news, where a wrong theme keyword would put unrelated news on a
-- specific stock's page.
--
-- In a table rather than in code so a wrong term is a row to delete, not a
-- deploy. The matched term travels to the screen so a reader can see why an item
-- is listed and judge the vocabulary rather than trust it.

CREATE TABLE IF NOT EXISTS analytics.market_topic_term (
    market_topic_term_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    topic                TEXT NOT NULL CHECK (length(btrim(topic)) > 0),
    term                 TEXT NOT NULL CHECK (length(btrim(term)) > 0),
    -- Korean particles attach directly to nouns, so a term that is a common
    -- substring of unrelated words cannot be fixed by a boundary rule. Terms are
    -- kept long enough that substring matching is safe; this records the intent
    -- so the next person does not add '금리' variants that match inside other words.
    min_length_ok        BOOLEAN NOT NULL GENERATED ALWAYS AS (char_length(btrim(term)) >= 2) STORED,
    active               BOOLEAN NOT NULL DEFAULT true,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (topic, term)
);

COMMENT ON TABLE analytics.market_topic_term IS
  'Terms that mark an event as market-wide news rather than company news. A '
  'definition, not an observation: edit rows to change what the surface shows. '
  'Never used to attach an event to a company.';

INSERT INTO analytics.market_topic_term (topic, term) VALUES
  ('rates',     '금리'),      ('rates',     '기준금리'),   ('rates',     '국채'),
  ('rates',     '연준'),      ('rates',     'FOMC'),       ('rates',     '한국은행'),
  ('rates',     'treasury'),  ('rates',     'interest rate'),
  -- 'yield' was seeded and withdrawn the same day: it is redundant with
  -- 'treasury' for bond stories and it caught "High yields, Covid-like volumes
  -- drive 23% gain" — an airline's revenue yield, not a rate.
  ('inflation', '물가'),      ('inflation', '인플레'),     ('inflation', 'CPI'),
  ('inflation', 'inflation'),
  ('fx',        '환율'),      ('fx',        '원화'),       ('fx',        '달러화'),
  ('trade',     '관세'),      ('trade',     '무역수지'),   ('trade',     '수출입'),
  ('trade',     'tariff'),    ('trade',     '공급망'),
  ('growth',    'GDP'),       ('growth',    '고용지표'),   ('growth',    '실업률'),
  ('growth',    'PMI'),       ('growth',    'jobs report'),
  ('market',    '코스피'),    ('market',    '코스닥'),     ('market',    '나스닥'),
  ('market',    'S&P 500'),   ('market',    '증시'),       ('market',    '사이드카'),
  ('market',    '서킷브레이커'),
  ('energy',    '유가'),      ('energy',    'OPEC'),       ('energy',    '원유')
ON CONFLICT (topic, term) DO NOTHING;
`;
