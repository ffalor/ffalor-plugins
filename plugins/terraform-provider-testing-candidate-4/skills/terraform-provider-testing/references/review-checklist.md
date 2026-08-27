# Pull-Request Review Checklist

Use this as a risk-based gate. Mark non-applicable items explicitly instead of forcing artificial tests.

## Sections

1. Scope and ownership
2. Baseline lifecycle
3. Attribute coverage
4. Collections and nesting
5. Validators, relationships, and normalization
6. Plan modifiers and replacement
7. Sensitive and write-only
8. Import, refresh, and drift
9. Data sources
10. Test layer and implementation quality
11. Cleanup and final validation

## Scope and ownership

- [ ] Resource/data-source schema, models, CRUD/Read/import, API behavior, and existing regressions were inventoried.
- [ ] Each tested behavior is labeled Core-, framework-, provider-, or API-owned.
- [ ] The suite avoids a Cartesian product and explains consolidated or omitted cases.
- [ ] High-risk branches—null/empty, clear/reset, replacement, drift, not-found, secrets—have direct coverage.
- [ ] Provider request mapping is verified by API inspection or a fake client where state echoing could hide a bug.

## Baseline lifecycle

- [ ] Minimal create asserts remote existence, identity, and stable important state.
- [ ] Full/create-only fields are tested on create when request construction differs from update.
- [ ] Representative mutable attributes update in place and preserve identity.
- [ ] Optional configured values can be removed and return to null/default/reset behavior.
- [ ] Stable refresh produces no diff.
- [ ] Delete removes the remote object; typed not-found is accepted, other errors are not.
- [ ] Out-of-band deletion removes the resource from state and plans recreation.
- [ ] Asynchronous APIs use bounded waits and tests verify readiness/deletion rather than timing guesses.

## Attribute coverage

- [ ] Every behaviorally distinct optional scalar covers omitted create, configured create, update, and removal.
- [ ] Required attributes cover valid create and update/replacement; only meaningful omission/validation diagnostics are tested.
- [ ] Boolean tests cover both values when provider/API behavior differs.
- [ ] Integer/number/float boundaries and precision are tested only when validators/conversions/API impose them.
- [ ] Null, empty, and unknown are covered where provider logic or API semantics distinguish them.
- [ ] Computed values are unknown when required, populated after apply, refreshed, and handled when API values disappear.
- [ ] Optional+computed attributes cover unconfigured API selection, configured values, removal to API selection, and drift in both modes.
- [ ] Defaults cover omission, override, and removal back to default; custom defaults have unit tests.

## Collections and nesting

- [ ] Collection coverage includes omitted/null, explicit empty, one, multiple, update, add, remove, remove-all, and omit-after-values when meaningful.
- [ ] Lists cover provider/API ordering behavior and nested index updates.
- [ ] Sets use order-independent assertions and cover element identity/API nondeterministic ordering when risky.
- [ ] Maps cover key add, value update, key removal, clear, and omit-after-values.
- [ ] Objects/single nested cover whole-object null/populated/removal and child update/removal.
- [ ] List/set/map nested cover object add/update/remove/clear and unknowns where provider code handles them.
- [ ] Child plan modifiers under list/set nesting do not assume prior-state realignment after reorder/removal.
- [ ] Independent remote child objects were considered for separate-resource modeling.

## Validators, relationships, and normalization

- [ ] Custom validators have table-driven valid, invalid, exact boundary, inside, outside, null, and unknown tests.
- [ ] Conflicts, required-together, exactly-one-of, at-least-one-of, and conditional relationships cover every valid/invalid combination implemented.
- [ ] Invalid configuration cannot mutate the API.
- [ ] Built-in framework validator internals are not duplicated.
- [ ] Provider/API normalization asserts canonical state and an empty final plan.
- [ ] API sorting, deduplication, rounding, or defaults use a schema/type consistent with actual semantics.

## Plan modifiers and replacement

- [ ] Custom plan modifiers cover create/update/destroy and known/null/unknown values in unit tests.
- [ ] `UseStateForUnknown` is used only for values that are safe to preserve.
- [ ] Each replacement attribute has a plan-only `ResourceActionReplace` assertion.
- [ ] Each replacement attribute has an applied lifecycle test proving identity change and old-object cleanup.
- [ ] Conditional replacement has both replacing and non-replacing branches.
- [ ] In-place updates explicitly assert `ResourceActionUpdate` where accidental replacement would be costly.

## Sensitive and write-only

- [ ] Sensitive attributes have representative sensitivity metadata coverage and no false claim that state is encrypted.
- [ ] Secrets do not appear in configs committed with real values, logs, state echoes, or failure messages.
- [ ] Write-only tests are gated to Terraform 1.11+.
- [ ] Write-only values are read from configuration, produce null plan/state, and are verified via a safe observable API effect.
- [ ] Write-only update has a version/keeper/private-state trigger or an explicitly tested replacement design.
- [ ] No write-only set/set-nested schema exists; write-only nested parents have all write-only children.

## Import, refresh, and drift

- [ ] Supported resources include valid import with state verification.
- [ ] Composite import IDs have pure parser tests and representative acceptance coverage.
- [ ] Every `ImportStateVerifyIgnore` entry is documented and genuinely unreconstructable.
- [ ] Import after a meaningful/full state reconstructs all remotely readable attributes.
- [ ] Applying equivalent configuration after import is no-op when that workflow is supported.
- [ ] Mutable drift, computed drift, and configured optional+computed drift follow the documented authority model.
- [ ] API fields becoming null/missing do not panic, retain stale data accidentally, or create perpetual diffs.

## Data sources

- [ ] Singular data source covers successful lookup, no match, and multiple match when search can be ambiguous.
- [ ] Plural data source accepts zero results as an empty collection.
- [ ] Optional filters and unknown/deferred inputs are covered when provider logic exists.
- [ ] Refresh updates computed result state.
- [ ] No resource-only CRUD/import/replacement tests were copied onto a data source.

## Test layer and implementation quality

- [ ] Deterministic conversions, parsers, custom validators/defaults/modifiers, and error classification use fast pure Go unit tests.
- [ ] Real API lifecycle, plan actions, import, refresh, drift, and waiters use acceptance tests.
- [ ] `resource.UnitTest` is used only for fast local/protocol tests, not remote infrastructure.
- [ ] New assertions use typed `ConfigStateChecks` / `ConfigPlanChecks`; legacy checks remain only where justified.
- [ ] Set assertions never use indexes.
- [ ] Config helpers use indexed formatting verbs and safe quoting.
- [ ] Names follow repository grammar and explain the behavior under test.
- [ ] Parallel tests do not share names, remote singleton state, or unsafe rate-limit assumptions.
- [ ] Regression tests reproduce and assert the original failure mode.
- [ ] Version-gated features have Terraform version checks.

## Cleanup and final validation

- [ ] Acceptance tests clean up on success and `CheckDestroy` proves remote absence.
- [ ] Sweepers, if present, are scoped to unmistakable test objects and a test-only environment.
- [ ] No fixed sleeps mask eventual consistency.
- [ ] Final plans are empty except in steps explicitly testing drift/disappearance/non-empty plans.
- [ ] Unit tests pass without acceptance credentials.
- [ ] Targeted acceptance tests pass repeatedly or documented external instability is isolated.
- [ ] Official HashiCorp links and APIs match versions pinned by the provider.
