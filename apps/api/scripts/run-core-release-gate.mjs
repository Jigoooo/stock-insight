import { spawnSync } from 'node:child_process';

const databaseUrl=process.env.STOCK_INSIGHT_TEST_DATABASE_URL;
if(!databaseUrl){
  throw new Error('STOCK_INSIGHT_TEST_DATABASE_URL is required for the core release gate');
}

const env={
  ...process.env,
  STOCK_INSIGHT_OUTBOX_TEST_DB_URL:databaseUrl,
  STOCK_INSIGHT_SOURCE_REVISION_TEST_DB_URL:databaseUrl,
  STOCK_INSIGHT_IDENTITY_TEST_DB_URL:databaseUrl,
  STOCK_INSIGHT_KNOWLEDGE_TEST_DB_URL:databaseUrl,
  STOCK_INSIGHT_RELATION_TEST_DB_URL:databaseUrl,
};
const tests=[
  'test/outbox-crash-recovery.test.ts',
  'test/consumer-inbox-atomicity.test.ts',
  'test/outbox-atomicity.test.ts',
  'test/source-contract-integrity.test.ts',
  'test/source-revision-pit.test.ts',
  'test/raw-source-lineage-atomicity.test.ts',
  'test/taxonomy-coverage.test.ts',
  'test/identity-issuer-integrity.test.ts',
  'test/knowledge-chunk-integrity.test.ts',
  'test/verification-transition.test.ts',
  'test/report-verification-race.test.ts',
  'test/relation-ledger-transition.test.ts',
  'test/relation-ledger-integrity.test.ts',
];
const result=spawnSync(process.execPath,['--test',...tests],{
  cwd:process.cwd(),env,encoding:'utf8',maxBuffer:16*1024*1024,
});
process.stdout.write(result.stdout??'');
process.stderr.write(result.stderr??'');
if(result.status!==0){
  process.exit(result.status??1);
}
if(!/^ℹ skipped 0$/m.test(result.stdout??'')){
  throw new Error('core release gate requires skipped 0');
}
