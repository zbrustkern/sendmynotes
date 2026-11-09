import assert from 'node:assert/strict';
export function selectTarget(manifest, name, project) {
  assert(['staging', 'production'].includes(name), 'Choose staging or production explicitly.');
  const target = manifest.targets[name];
  assert.equal(project, target.project, 'Explicit project confirmation does not match target.');
  assert.equal(new URL(target.origin).protocol, 'https:');
  assert(target.bucket.startsWith(`${target.project}-`), 'Bucket must belong to target naming boundary.');
  return target;
}
export function indexSignature(index) {
  // Ordinary composite responses append an implicit document-name tiebreaker.
  // A name-only index is itself the query index, so its direction is essential.
  const ordinaryFields = index.fields.filter(f => f.fieldPath !== '__name__');
  const fields = ordinaryFields.length ? ordinaryFields : index.fields;
  return JSON.stringify({ queryScope: index.queryScope, fields: fields.map(({ fieldPath, order, arrayConfig }) => ({fieldPath, order, arrayConfig})) });
}
export function matchIndex(wanted, existing) {
  return existing.find(index => index.name.includes(`/collectionGroups/${wanted.collectionGroup}/indexes/`) && indexSignature(index) === indexSignature(wanted));
}
export function assessBucket(bucket, iam, runtime) {
  const bindings = iam?.bindings || [];
  return {
    uniformAccess: bucket?.iamConfiguration?.uniformBucketLevelAccess?.enabled === true,
    publicAccessPrevention: bucket?.iamConfiguration?.publicAccessPrevention === 'enforced',
    noPublicMembers: !bindings.some(b => b.members?.some(m => ['allUsers', 'allAuthenticatedUsers'].includes(m))),
    runtimeObjectRole: bindings.some(b => b.role === 'roles/storage.objectAdmin' && b.members?.includes(`serviceAccount:${runtime}`)),
    // Metadata permission is verified separately using testIamPermissions/impersonation.
    runtimeMetadataPermission: 'requires_runtime_fixture'
  };
}
export function safeEnvironment(env, manifest, target) {
  const values = new Map(env.map(e => [e.name, e]));
  const expected = [...manifest.plainEnvironment, ...Object.keys(manifest.secretEnvironment)];
  const config = expected.map(name => ({name, present: values.has(name), source: values.get(name)?.valueSource ? 'secret' : values.has(name) ? 'plain' : 'missing'}));
  const value = name => values.get(name)?.value;
  return {config, checks: {
    bucketMatchesTarget: value('UPLOAD_PRIVATE_BUCKET') === target.bucket,
    remindersExplicitlyOff: value('ACCOUNT_REMINDER_DELIVERY_ACTIVE') === 'false',
    stageSafety: target.reviewOnly ? ['STAGING_REVIEW_ONLY','NEXT_PUBLIC_STAGING_REVIEW_ONLY','HANDWRYTTEN_TEST_MODE'].every(n=>value(n)==='true') : !['STAGING_REVIEW_ONLY','NEXT_PUBLIC_STAGING_REVIEW_ONLY','HANDWRYTTEN_TEST_MODE'].some(n=>value(n)==='true'),
    originMatchesTarget: value('NEXT_PUBLIC_APP_URL') === target.origin,
    secretsAreReferences: Object.entries(manifest.secretEnvironment).every(([name,id]) => values.get(name)?.valueSource?.secretKeyRef?.secret?.split('/').pop() === id)
  }};
}
