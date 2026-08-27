# Testing Strategy and Lifecycle

## Contents

1. Ownership model
2. Core principles
3. Baseline managed-resource lifecycle
4. Read, refresh, drift, and disappearance
5. Import
6. Data sources
7. Unit versus acceptance selection
8. Naming and organization
9. Regression tests
10. Sweepers and cleanup

## 1. Ownership model

Classify the behavior before adding a test.

| Owner | Examples | Provider-test policy |
|---|---|---|
| Terraform Core | Configuration expression evaluation, configured-value consistency, list ordering, set uniqueness/order independence, graph ordering | Do not retest per attribute. Exercise only when provider behavior depends on it. |
| Plugin Framework | Schema flag validation, typed value plumbing, built-in default/validator/plan-modifier implementation, write-only nullification | Trust upstream tests. Add one provider wiring test only when attachment or version compatibility is risky. |
| Provider | Request expansion, response flattening, custom validation/default/plan modification, normalization, omission semantics, not-found classification, state removal | Unit-test deterministic logic and acceptance-test user-visible lifecycle effects. |
| Remote API | Defaults, canonicalization, mutable/immutable fields, asynchronous transitions, drift, disappearance, read-back omissions | Acceptance-test representative and risky paths against the real API. |

Do not confuse state echoing with provider correctness. Terraform may preserve a configured value even if the provider forgot to send it. When transmission matters, inspect the remote object or use a fake client in a provider unit/integration test.

## 2. Core principles

- Test behaviors and transitions, not schema declarations.
- Use minimal configuration to prove creation and a full or targeted configuration to prove nontrivial arguments.
- Combine create and update transitions when they share one remote object and identity preservation matters.
- Separate destructive, replacement, validation, drift, and regression scenarios when failure diagnosis improves.
- Randomize globally unique names and tag/prefix test objects for cleanup.
- Verify the final state, remote object, and expected plan action. A test that only reports “apply succeeded” is insufficient for provider-owned behavior.
- Preserve null, empty, and unknown distinctions in models until the API contract deliberately collapses them.
- Avoid exact assertions for volatile API-generated values; assert shape, non-null, or a stable relationship instead.
- Prefer typed errors and bounded waits. Never make flakiness disappear with unbounded retry.

## 3. Baseline managed-resource lifecycle

This baseline is one scenario, not one test per attribute.

| Step | Configuration transition | Expected plan | Expected result | Layer | Import |
|---|---|---|---|---|---|
| Minimal create | absent → minimal valid config | Create; computed values unknown unless safely planned | Remote object exists; configured/default/computed state is correct | Acceptance | Follow with import |
| Refresh/no-op | same config → same config | No-op after refresh | Read reproduces stable state with no diff | Acceptance | Indirectly relevant |
| In-place update | value A → value B for representative mutable fields | Update, not replace | Same identity; API and state show B | Acceptance | Import after update when imported state can reconstruct B |
| Removal/reset | configured value → omitted/null | Update or no-op per contract | State/API returns null, provider/API default, or canonical reset value | Acceptance | Verify reconstructable result |
| Delete | resource present → removed | Destroy | API object absent; not-found counts as success | Acceptance | No |
| Import | existing remote object → imported state | Read/import | Imported state equals expected prior state | Acceptance | Required when supported |

Baseline test shape:

1. Create minimal config and assert API existence, identity, and high-risk state.
2. Add or change representative mutable arguments; assert `ResourceActionUpdate` and unchanged identity.
3. Remove optional arguments; assert reset behavior.
4. Import and verify.
5. Let test cleanup destroy the object and use `CheckDestroy` for remote absence.

Add a separate full-config create only when create request construction differs materially from update, an attribute is create-only, or the API behaves differently when a field is supplied at creation.

## 4. Read, refresh, drift, and disappearance

### Read/refresh matrix

Import is not directly exercised by drift scenarios. It is relevant only when the changed/read-back value should also be reconstructable after import.

| Scenario | Setup/transition | Expected plan or refresh | Expected state | Layer |
|---|---|---|---|---|
| Stable refresh | Apply; make no remote change | Refresh then no-op | Same canonical state | Acceptance |
| Mutable drift | Change a provider-managed mutable field through API | Refresh-only shows changed state; normal plan proposes update back to config | State first reflects API; apply restores config | Acceptance |
| Computed drift | Change an API-computed field | Refresh updates state; plan is no-op unless other logic depends on it | New API value | Acceptance |
| Optional+computed drift | Change API-selected value when unconfigured | Refresh accepts API value | API value in state, no perpetual diff | Acceptance |
| Configured optional+computed drift | Change API value away from configured value | Plan restores configured value or documents API authority | Contract-specific state | Acceptance |
| Field disappears | API omits/clears a field | Refresh succeeds | Null/default/prior state only if explicitly designed | Unit + acceptance for risky mapping |
| Object disappears | Delete object out-of-band | Read removes resource from state; next plan proposes create | Resource absent from state | Acceptance |
| Transient read error | Inject or encounter retryable/nonretryable error | No accidental state removal | Prior state retained when error returned | Unit with fake client; acceptance only if controllable |

Do not use `UseStateForUnknown` to conceal a computed value that can legitimately change on Read. It is appropriate only when the prior value is safe and stable across the operation.

### Disappearance test

Delete the remote object after a successful apply, trigger refresh/plan, and assert recreation rather than a perpetual read error. If deletion occurs in a custom state check, mark the step as expecting a non-empty plan or add refresh plan checks.

## 5. Import

Test import after a meaningful configured state, not only minimal creation.

- Use `ImportState: true` and `ImportStateVerify: true`.
- Use `ImportStateKind: resource.ImportBlockWithID` when verifying import-block behavior.
- Set `ImportStateId` or `ImportStateIdFunc` for composite IDs.
- Verify import parsing failures in pure Go when parsing is factored into a helper; add an acceptance diagnostic test when the user-facing error contract matters.
- Use `ImportStateVerifyIgnore` only for values the API/import cannot reconstruct. Typical examples: write-only secrets, a creation-only bootstrap argument, or an API value never returned by Read.
- Do not ignore mutable/readable attributes to make a broken Read pass.
- After import, optionally apply the same configuration and require an empty plan. This catches incomplete import state that simple comparison can miss.

Import verification is relevant per attribute when the value is remotely readable or derivable from the import identity. It is not meaningful for write-only or intentionally configuration-only values.

## 6. Data sources

Data sources have Read/refresh behavior only. Do not apply resource CRUD, replacement, delete, or import matrices.

| Scenario | Configuration | Expected plan/state | Layer |
|---|---|---|---|
| Minimal valid lookup | Required lookup fields only | Read succeeds; stable computed fields populated | Acceptance |
| Optional filters | Omitted then configured filters | Results reflect API contract | Acceptance |
| Unknown input | Lookup references a value known after apply | Data source read is deferred to apply | Acceptance when provider integration matters |
| No match, singular | Filters match none | Clear diagnostic | Acceptance; unit-test finder |
| Multiple matches, singular | Ambiguous filters | Clear diagnostic instead of arbitrary result | Acceptance; unit-test finder |
| Zero results, plural | Valid filter with no matches | Empty collection, not error | Acceptance |
| Refresh/API change | Remote result changes | State updates on refresh | Acceptance |
| Sensitive output | API returns secret-like value | Sensitivity metadata asserted; remember sensitive is still stored | Acceptance wiring test |

Unit-test query building, pagination, filtering, sorting/normalization, and result cardinality helpers. Acceptance-test the API and framework integration.

## 7. Unit versus acceptance selection

| Subject | Pure Go unit | `resource.UnitTest` | Acceptance |
|---|---:|---:|---:|
| Expand/flatten and null/unknown branching | Preferred | No | Representative high-risk path |
| Custom validator/default/plan modifier | Preferred, table-driven | Optional framework wiring | Representative invalid/plan path |
| Built-in framework validator/modifier | No | No | At most one wiring path |
| Import ID parser | Preferred | No | Valid import + representative invalid ID |
| API error classification/not-found | Preferred | No | Disappears/destroy against real API |
| Request payload and omitted-vs-empty | Preferred with fake client | Optional | Yes when remote semantics matter |
| CRUD, asynchronous waiters, remote defaults | Helper unit tests | No | Required |
| Plan action, unknown values, replacement | Difficult/insufficient | Useful with local fake provider | Required for real resources |
| Drift and refresh | Helper unit tests | Possible with controllable local server | Required for remote behavior |

`resource.UnitTest` still invokes Terraform CLI and provider protocol. Use it only for fast tests that require no credentials or remote infrastructure; it is not a substitute for ordinary Go unit tests.

## 8. Naming and organization

Follow repository conventions first. Otherwise:

- Tests: `TestAccWidget_basic`, `TestAccWidget_attributes`, `TestAccWidget_replaceName`, `TestAccWidget_disappears`, `TestAccWidget_validation`, `TestAccWidget_regressionGH1234`.
- Pure unit tests: `TestExpandWidget`, `TestWidgetNameValidator_ValidateString`, `TestParseWidgetImportID`.
- Config helpers: `testAccWidgetConfig_minimal`, `testAccWidgetConfig_full`, `testAccWidgetConfig_description`.
- Remote checks: `stateCheckWidgetExists`, `stateCheckWidgetDisappears`, `testAccCheckWidgetDestroy`.

Use one test file beside each implementation. Put shared provider factories and prechecks in provider test support. Put finders, waiters, and API test helpers in package-level support files when reused.

Prefer `resource.ParallelTest`. Use serial `resource.Test` only for real shared-state, rate-limit, or API isolation constraints, and document why.

## 9. Regression tests

- Name the issue or failure mode.
- Reproduce the bug with the smallest configuration.
- Assert the previously incorrect plan/state/API behavior, not merely success.
- When repository workflow allows, land a failing test commit before the fix so reviewers can prove reproduction.
- Keep regression coverage even if a broader lifecycle test later overlaps it when the bug is subtle.

## 10. Sweepers and cleanup

Normal test destroy and `CheckDestroy` are primary. Add sweepers only when remote objects can leak after interrupted or failed acceptance runs.

- Register with `resource.AddTestSweepers` and enable via `resource.TestMain(m)`.
- Use an unmistakable acceptance-test name/tag prefix.
- Scope to a dedicated test account/region and never sweep broadly by type alone.
- Declare child sweepers as dependencies of parent sweepers so children run first.
- Treat per-object delete failures deliberately; return failures when continued leakage is unsafe.
- Document that sweepers are destructive and run them only in test environments.
