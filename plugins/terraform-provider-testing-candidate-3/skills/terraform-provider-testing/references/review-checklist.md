# Review Checklist

Mark non-applicable items explicitly. Findings should identify the missing behavior and resulting risk rather than demanding mechanical matrix completion.

## Scope and ownership

- [ ] Repository instructions, `go.mod`, implementation, schema, models, CRUD/Read/import, helpers, API behavior, and nearby tests were inspected.
- [ ] Core, Framework, provider, and API ownership is explicit.
- [ ] Scenarios are consolidated by behavior rather than a Cartesian product.
- [ ] State echo cannot conceal an untested request-mapping bug.
- [ ] High-risk clearing, replacement, not-found, drift, partial failure, secret, and cleanup branches have direct proof.

## Managed lifecycle

- [ ] Minimal or common create proves remote existence, identity, key state, defaults/computed values, and stability.
- [ ] Distinct create-time request paths are covered.
- [ ] Mutable behavior updates in place and preserves identity.
- [ ] Optional values and collections can be removed/cleared to the contracted result.
- [ ] Read maps all readable fields and clears API-omitted stale values.
- [ ] Read not-found removes state; the next plan recreates.
- [ ] Delete proves typed remote absence; already absent succeeds and unrelated errors fail.
- [ ] Async operations use bounded production waiters, not sleeps.
- [ ] Import verifies all reconstructable state and every ignore has a reason.

## Attributes and schema

- [ ] Distinct optional scalars cover omitted, configured, changed, and removed states.
- [ ] Required attributes omit inapplicable optional-removal scenarios.
- [ ] Zero/false/empty/null and numeric boundaries are tested only where provider/API semantics differ.
- [ ] Collections cover meaningful omitted, empty, cardinality, mutation, clearing, and re-omission paths.
- [ ] Lists test API ordering, sets use order-independent assertions, and maps cover distinct key operations.
- [ ] Nested values cover parent/child removal, sibling preservation, identity, API omission, and unknown handling where custom code observes it.
- [ ] Computed and optional+computed fields express API/config authority and refresh behavior.
- [ ] Framework defaults and API-selected defaults are not conflated.
- [ ] Sensitive values are not mistaken for write-only values or assumed importable merely because stored.
- [ ] Write-only values use Terraform 1.11+, remain absent from artifacts, and have a safe change trigger/effect assertion.

## Validation, planning, and normalization

- [ ] Custom validators include exact/adjacent boundaries, distinct invalid classes, null, unknown, paths, and diagnostics.
- [ ] Cross-attribute truth tables cover all implemented valid and invalid combinations.
- [ ] Invalid configurations cannot mutate the API.
- [ ] Custom plan modifiers cover create/update/destroy and known/null/unknown inputs.
- [ ] `UseStateForUnknown` is limited to safe stable values and does not hide drift.
- [ ] Each distinct replacement rule has an exact plan action plus applied identity and cleanup proof.
- [ ] Normalization yields canonical state and an empty final plan on create, update, refresh, and import as applicable.

## Test implementation

- [ ] Pure deterministic logic uses table-driven Go tests; real protocol/API behavior uses acceptance tests.
- [ ] New checks use typed `ConfigStateChecks`/`ConfigPlanChecks`; legacy checks remain only for migration or `CheckDestroy`.
- [ ] No step mixes legacy `Check` with `ConfigStateChecks`.
- [ ] `resource.ParallelTest` is not paired with `t.Parallel()`.
- [ ] No `PlanOnly: true` step uses `ConfigPlanChecks.PreApply`.
- [ ] Config helpers use indexed verbs and safe quoting.
- [ ] Sets are never indexed.
- [ ] Test resources are unique, isolated, and independently runnable.
- [ ] Regression tests reproduce the original failure rather than merely succeeding.
- [ ] Sensitive values, credentials, and real account identifiers cannot appear in failures or committed fixtures.

## CrowdStrike repository

- [ ] Tests use `internal/acctest` factories, prechecks, configuration, and naming helpers.
- [ ] Remote checks use `gofalcon`/`internal/testconfig`, never direct HTTP.
- [ ] `tferrors` operation-specific 404, nil response, payload error, and empty-resource behavior is covered where changed.
- [ ] Early Create state is tested when follow-up failure could otherwise leak a Falcon object.
- [ ] Sweepers use `internal/sweep` ownership prefixes and only test accounts.
- [ ] Focused unit/acceptance tests, `make fmt-check`, and `make lint` were run or limitations were reported.

## Final quality

- [ ] Final plans are empty except where a non-empty drift/disappearance plan is intentional.
- [ ] `CheckDestroy` or equivalent typed remote verification detects leaks.
- [ ] No fixed sleeps, broad sweepers, state-file mutation, brittle volatile-value assertions, or unjustified import ignores remain.
- [ ] Symbols and Terraform feature gates match pinned dependencies.
