# Ontology RFC Process (P1-W3)

> Scope: how a change to the controlled vocabulary — entity types, predicates, or
> taxonomy nodes — is proposed, reviewed, and recorded so that graph meaning is
> auditable and never drifts silently. This document governs
> `migration 033_entity_resolution_ontology` and the tables it creates in the
> `knowledge` schema.

## Why this exists

The truth graph is only trustworthy if the *meaning* of its edges is stable and
every change to that meaning is recorded. Two failure modes this process blocks:

1. **Silent predicate drift** — a predicate quietly changes semantics, so old
   and new facts are compared as if they meant the same thing.
2. **Ambiguous entity merges** — two entities are auto-linked on weak evidence,
   collapsing distinct real-world things into one node.

## Ledgers

| Table | Role |
|---|---|
| `knowledge.ontology_rfc` | The proposal. `scope` ∈ {entity_type, predicate, taxonomy}. `status` ∈ {draft, review, accepted, rejected, superseded}. |
| `knowledge.ontology_revision` | Append-only outcome of an accepted RFC. `compatibility` ∈ {additive, backward, breaking}. A `breaking` revision **must** carry a `migration_ledger_ref`. |
| `knowledge.ontology_crosswalk` | External-standard mapping (LEI Level 1/2, FIBO, ISO 3166, UN M49). |
| `knowledge.resolution_candidate` | A proposed same-entity pair with a blocking key. Self-pairs are rejected. |
| `knowledge.resolution_feature` | Typed, append-only evidence for a candidate (name similarity, id overlap, graph check). |
| `knowledge.resolution_decision` | Append-only decision: `auto_link`, `needs_review`, or `non_link`, with a defensible basis. |

## Lifecycle

```
draft ──▶ review ──▶ accepted ──▶ (ontology_revision emitted)
              │
              ├──▶ rejected
              └──▶ superseded (by a later RFC on the same subject)
```

- An RFC only becomes fact through an `ontology_revision`. The revision is
  append-only; a correction is a **new** revision superseding the previous one
  of the same RFC (enforced by `guard_ontology_revision_write`).
- `known_from >= effective_from` on every revision (no future-known leak).

## Machine gates (enforced in DB, not just process)

1. **Ambiguous-auto-link block.** `resolution_decision` cannot record
   `auto_link` when `classifier_score` is null or below
   `knowledge.resolution_policy.resolution_auto_link_threshold` (default 0.90).
   Below the floor the only permitted outcomes are `needs_review` or `non_link`.
   Changing the threshold is itself an auditable row insert.
2. **Decision basis required.** A concrete `auto_link` / `non_link` needs either
   a `classifier_score` or a `reviewer_id`; `needs_review` may abstain.
3. **Breaking-change ledger requirement.** A `breaking` ontology revision is
   rejected unless it names the `migration_ledger_ref` that carries the change.
4. **Append-only.** `resolution_candidate`, `resolution_feature`,
   `resolution_decision`, and `ontology_revision` reject UPDATE/DELETE.

## Legacy seed

Existing controlled predicates in `knowledge.predicate_ontology_revision` are
seeded one-to-one as `legacy-predicate-seed:<predicate>` RFCs with a single
`additive` revision, giving pre-existing vocabulary an auditable provenance
anchor. No existing predicate row is modified. The resolution ledger starts
empty — resolution is a forward-only audited activity, not a backfilled guess.

## Authoring a change

1. Insert an `ontology_rfc` (`status = draft`).
2. Attach rationale and, for entity merges, `resolution_feature` evidence.
3. Move to `review`; a reviewer records the outcome.
4. On `accepted`, emit an `ontology_revision` with the correct `compatibility`.
   For `breaking`, first land the migration and cite it in `migration_ledger_ref`.
5. Never mutate a prior row — supersede it.
