# Strategy and Lifecycle

## Contents

1. Ownership model
2. Risk-based selection
3. Managed-resource lifecycle
4. Operation and error matrix
5. Refresh, drift, and disappearance
6. Import
7. Data sources
8. Choosing the test layer
9. Organization, regressions, and cleanup

## 1. Ownership model

Classify behavior before selecting a test.

| Owner | Examples | Provider-test policy |
|---|---|---|
| Terraform Core | Expressions, dependency graph, language typing, list order, set uniqueness/order independence, map addressing | Do not retest in isolation. Exercise only when provider behavior depends on it. |
| Plugin Framework | Schema protocol plumbing and built-in validator/default/plan-modifier algorithms | Trust upstream tests. Prove provider attachment or version compatibility once when risky. |
| Provider | Request mapping, response flattening, custom validation/planning, normalization, import parsing, diagnostics, state removal | Unit-test deterministic branches and acceptance-test user-visible effects. |
| Remote API | Defaults, canonicalization, mutability, async transitions, omissions, disappearance, throttling | Use representative real-API acceptance tests. |

Terraform may preserve a configured value in state even when the provider failed to send it. When transmission is material, inspect the remote object or verify the request through an existing fake client seam.

## 2. Risk-based selection

Prioritize scenarios by failure cost and likelihood:

1. Resource leakage or destructive replacement.
2. Secrets persisted or printed unexpectedly.
3. Read not-found, Delete not-found, partial Create, and asynchronous cleanup.
4. Clearing/removal, null versus empty, API defaults, and optional+computed authority.
5. Drift, canonicalization, collection identity, and import completeness.
6. Ordinary scalar mapping already shared by tested helpers.

Consolidate fields that share the same expand/flatten helper, endpoint, mutability, and API semantics. Split tests when behavior differs, setup is destructive, parallelism is unsafe, or a failure would obscure the scenario.

## 3. Managed-resource lifecycle

Use one coherent acceptance flow where practical:

| Step | Transition | Expected action | Proof |
|---|---|---|---|
| Minimal create | absent to minimal valid config | Create | Remote object exists; identity and important required/default/computed state are correct. |
| Meaningful update | A to B for representative mutable fields | Update | Identity is unchanged; state and API show B. |
| Removal/reset | configured to omitted/null/empty as contracted | Update, no-op, or replacement | API and state return to null, empty, default, or canonical reset value. |
| Stable refresh | same config, no remote mutation | No-op | Read reproduces stable state and final plan is empty. |
| Import | existing object to imported state | Import/Read | All reconstructable state matches; equivalent config is stable where applicable. |
| Delete | present to absent | Destroy | Typed API lookup proves absence; not-found is success. |

Add a full-config create when Create request construction differs materially from Update, a field is create-only, or the API applies different create-time semantics.

## 4. Operation and error matrix

| Operation | Scenarios to prove | Preferred layer |
|---|---|---|
| Create | Minimal/full request mapping, API-generated values, defaults, early identity state, validation failure, nil/payload/empty response, post-create failure | Unit request/error branches plus acceptance lifecycle |
| Read | Complete readable mapping, stable refresh, not-found removes state, missing field clears stale state, transient errors retain state with diagnostics | Unit flatten/error classification plus acceptance disappearance/drift |
| Update | Each distinct request path, unchanged identity, clearing, partial/API failure, computed refresh | Unit request branches plus acceptance transitions |
| Delete | Correct identifier, existing deletion, already absent success, async completion, non-not-found error | Unit classification plus acceptance `CheckDestroy` |
| Import | Valid ID, composite parsing, malformed ID, not-found, canonical state | Parser unit tests plus acceptance import |

Test diagnostics for provider-owned errors. Avoid assertions against incidental Terraform prefixes or full upstream error prose.

## 5. Refresh, drift, and disappearance

Create drift through the API, never by editing state.

| Scenario | Refresh result | Following plan |
|---|---|---|
| Configured mutable field changed remotely | State observes remote value | Terraform proposes restoring configuration. |
| Computed field changed remotely | State adopts API value | No-op unless another contract depends on it. |
| Unconfigured optional+computed field changed | State adopts API-selected value | No-op. |
| Configured optional+computed field changed | Follow documented config/API authority | Restore configuration or explicitly accept API authority. |
| API omits a field | State becomes null/default or deliberately retains prior value | Stable, contract-specific result without stale accidental data. |
| Whole object deleted | Resource leaves state | Create is planned. |

Use `RefreshState` and `RefreshPlanChecks` when a distinct refresh phase is needed. A disappearance state check may delete the object after apply and set `ExpectNonEmptyPlan: true` so the harness accepts the ensuing recreation plan.

## 6. Import

- Test import after a meaningful configured state, not only minimal creation.
- Use `ImportStateVerify: true`; use `ImportStateKind: resource.ImportBlockWithID` when import-block behavior is part of the supported contract.
- Unit-test composite ID parsing: valid segments, empty/missing/extra parts, escaping, and diagnostics.
- Ignore only write-only, creation-only, or otherwise unreadable attributes. Document why each cannot be reconstructed.
- Consider applying equivalent configuration after persisted/plannable import when incomplete imported state is a known risk.

Sensitivity alone is not a reason to ignore or include a field. Import relevance depends on whether Read can reconstruct it.

## 7. Data sources

Data sources have Read behavior, not resource CRUD, replacement, Delete, or import.

| Scenario | Expected result |
|---|---|
| Minimal valid lookup | Stable computed state and correct API result. |
| Optional filters | Omitted/configured filters produce contracted results. |
| Unknown input | Read defers to apply when required inputs are unknown. |
| Singular no match | Clear provider diagnostic. |
| Singular multiple matches | Clear ambiguity diagnostic rather than arbitrary selection. |
| Plural zero results | Empty collection, not an error. |
| API result changes | Refresh updates computed state. |

Unit-test query construction, pagination, client-side filtering, normalization, and cardinality helpers. Acceptance-test API and framework integration.

## 8. Choosing the test layer

| Subject | Pure Go | `resource.UnitTest` | Acceptance |
|---|---:|---:|---:|
| Expand/flatten, null/unknown branches | Primary | No | Representative risky round trip |
| Custom validator/default/plan modifier | Exhaustive tables | Optional wiring | User-visible consequence |
| Built-in validator/modifier | No | No | At most one provider-wiring case |
| Request construction and error classification | Primary with existing fake seam | Optional | Real API semantics |
| Import parser | Primary | No | Valid import and important invalid case |
| Plan action, state, import, drift, CRUD | Supporting only | Local/protocol cases | Primary |
| Waiter state machine | Success, timeout, terminal failure | No | Representative convergence |

`resource.UnitTest` still invokes Terraform CLI and provider protocol. Use ordinary Go tests when a pure function proves the contract.

## 9. Organization, regressions, and cleanup

- Follow repository names first. Otherwise use `_basic`, `_lifecycle`, `_replace<Name>`, `_disappears`, `_validation<Name>`, and `_regressionGH1234`.
- Use `resource.ParallelTest` by default with globally unique test resources. Serialize only for documented singleton, rate-limit, or shared-state constraints.
- A regression test must fail against the broken implementation and assert the original failure mode. Repository workflow decides whether that proof uses separate commits; do not impose a universal commit structure.
- Normal teardown plus typed remote `CheckDestroy` is primary. Add sweepers only when failed/interrupted runs can leak resources.
- Sweep only unmistakably test-owned objects in a dedicated account/region. Parent sweepers depend on child sweepers so children run first.
- Never use fixed sleeps. Use bounded waiters and expose terminal errors.
