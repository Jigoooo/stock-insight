// B9 — canonical pipeline registry + SLO evaluation (master plan §8 B9).
// Declares the CANONICAL dataset dependency graph for B0~B8 producers and a
// pure freshness-SLO evaluator. Existing Node workers stay behavior owners;
// this registry is the single source of truth a future Dagster (or any
// orchestrator) reads. Operational cutover remains separately approved.

import {
  buildPipelineDag,
  verifyProducerCoverage,
  type PipelineDag,
  type PipelineEdge,
  type PipelineNode,
  type ProducerCoverageReport,
} from './pipeline-dag.ts';

export const CANONICAL_PIPELINE_NODES: readonly PipelineNode[] = [
  { datasetKey: 'ingestion.raw_object', producerKey: 'ingest-fetchers' },
  { datasetKey: 'ingestion.source_revision', producerKey: 'source-revision-store' },
  { datasetKey: 'knowledge.document_chunk', producerKey: 'b4-chunking-worker' },
  { datasetKey: 'knowledge.claim', producerKey: 'b4-knowledge-extraction' },
  { datasetKey: 'knowledge.relation_ledger', producerKey: 'b6-relation-builders' },
  { datasetKey: 'analytics.graph_snapshot', producerKey: 'b7-snapshot-builder' },
  { datasetKey: 'analytics.impact_path_v2', producerKey: 'b7-impact-builder' },
  { datasetKey: 'analytics.relation_measurement', producerKey: 'b7-measurement-worker' },
  { datasetKey: 'analytics.graph_community', producerKey: 'b7-community-worker' },
  { datasetKey: 'serving.content_pack', producerKey: 'b8-pack-builder' },
  { datasetKey: 'ops.outbox_event', producerKey: 'b1-outbox-writers' },
];

export const CANONICAL_PIPELINE_EDGES: readonly PipelineEdge[] = [
  { from: 'ingestion.raw_object', to: 'ingestion.source_revision' },
  { from: 'ingestion.source_revision', to: 'knowledge.document_chunk' },
  { from: 'knowledge.document_chunk', to: 'knowledge.claim' },
  { from: 'ingestion.source_revision', to: 'knowledge.relation_ledger' },
  { from: 'knowledge.claim', to: 'knowledge.relation_ledger' },
  { from: 'knowledge.relation_ledger', to: 'analytics.graph_snapshot' },
  { from: 'analytics.graph_snapshot', to: 'analytics.impact_path_v2' },
  { from: 'analytics.graph_snapshot', to: 'analytics.relation_measurement' },
  { from: 'analytics.graph_snapshot', to: 'analytics.graph_community' },
  { from: 'analytics.graph_snapshot', to: 'serving.content_pack' },
  { from: 'analytics.impact_path_v2', to: 'serving.content_pack' },
  // Pack items anchor relation_measurement rows directly (item_kind='measurement'),
  // so a measurement-only refresh must recompute the pack (HIGH fix, B9 review).
  { from: 'analytics.relation_measurement', to: 'serving.content_pack' },
  { from: 'knowledge.relation_ledger', to: 'ops.outbox_event' },
  { from: 'serving.content_pack', to: 'ops.outbox_event' },
];

export function buildCanonicalPipelineDag(): {
  dag: PipelineDag;
  coverage: ProducerCoverageReport;
} {
  const dag = buildPipelineDag(CANONICAL_PIPELINE_NODES, CANONICAL_PIPELINE_EDGES);
  return { dag, coverage: verifyProducerCoverage(dag) };
}

export type DatasetSloInput = {
  datasetKey: string;
  lastSuccessAt: string | null;
  freshnessBudgetHours: number;
};

export type SloViolation = {
  datasetKey: string;
  reason: 'stale' | 'never_succeeded';
  ageHours: number;
  budgetHours: number;
};

export type SloReport = {
  healthy: string[];
  violations: SloViolation[];
};

export function evaluatePipelineSlo(
  inputs: readonly DatasetSloInput[],
  options: { now: Date },
): SloReport {
  const healthy: string[] = [];
  const violations: SloViolation[] = [];
  for (const input of inputs) {
    if (!Number.isFinite(input.freshnessBudgetHours) || input.freshnessBudgetHours <= 0) {
      throw new Error(`freshness budget must be positive for ${input.datasetKey}`);
    }
    if (input.lastSuccessAt === null) {
      violations.push({
        datasetKey: input.datasetKey,
        reason: 'never_succeeded',
        ageHours: Number.POSITIVE_INFINITY,
        budgetHours: input.freshnessBudgetHours,
      });
      continue;
    }
    const lastMs = new Date(input.lastSuccessAt).getTime();
    if (Number.isNaN(lastMs)) {
      violations.push({
        datasetKey: input.datasetKey,
        reason: 'never_succeeded',
        ageHours: Number.POSITIVE_INFINITY,
        budgetHours: input.freshnessBudgetHours,
      });
      continue;
    }
    const ageHours = (options.now.getTime() - lastMs) / 3_600_000;
    if (ageHours > input.freshnessBudgetHours) {
      violations.push({
        datasetKey: input.datasetKey,
        reason: 'stale',
        ageHours,
        budgetHours: input.freshnessBudgetHours,
      });
    } else {
      healthy.push(input.datasetKey);
    }
  }
  return { healthy, violations };
}
