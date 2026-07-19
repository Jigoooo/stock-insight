// B3 downstream read contracts. UI remains frozen; these queries preserve the
// backend acceptance shape required by future sector/graph/evidence screens.

export const SECURITY_ISSUER_SQL = `
SELECT security.entity_id AS security_entity_id,
       security.canonical_name AS security_name,
       issuer.entity_id AS issuer_entity_id,
       issuer.canonical_name AS issuer_name,
       identity.identity_match_key,
       identity.mapping_basis,
       identity.valid_from,
       identity.known_from
FROM core.security_issuer_identity identity
JOIN core.entity security ON security.entity_id=identity.security_entity_id
JOIN core.entity issuer ON issuer.entity_id=identity.issuer_entity_id
WHERE identity.security_entity_id=$1
`;

export const ENTITY_TAXONOMY_SQL = `
SELECT membership.entity_id,
       release.taxonomy_system,
       release.release_version,
       release.policy_status,
       node.code,
       node.label,
       membership.classification_status,
       membership.source_reference,
       membership.valid_from,
       membership.known_from
FROM core.entity_taxonomy_membership membership
JOIN core.taxonomy_node node ON node.taxonomy_node_id=membership.taxonomy_node_id
JOIN core.taxonomy_release release ON release.taxonomy_release_id=node.taxonomy_release_id
WHERE membership.entity_id=$1
ORDER BY release.taxonomy_system
`;
