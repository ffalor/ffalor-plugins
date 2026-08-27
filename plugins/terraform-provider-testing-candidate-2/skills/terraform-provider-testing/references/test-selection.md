# Test selection and organization

## Contents

- [Selection rules](#selection-rules)
- [Unit tests](#unit-tests)
- [Acceptance tests](#acceptance-tests)
- [Naming and structure](#naming-and-structure)
- [Avoid redundant tests](#avoid-redundant-tests)

## Selection rules

Use a unit test when the contract can be proved with values and diagnostics without Terraform Core or a live API. Use an acceptance test when the contract depends on configuration parsing, planning, protocol state, import, refresh, or the real API. Use both when custom logic drives a critical user-visible lifecycle effect.

| Concern | Unit | Acceptance |
|---|---:|---:|
| Pure expand/flatten and normalization | Primary | Representative round trip |
| Custom validator/default/plan modifier | Exhaustive table | Wiring and important lifecycle effect |
| Stock Framework validator/modifier | Usually no | One wiring/effect test if risky |
| Schema flags/type/description | Only if repo convention has schema tests | Behavior is preferable |
| Request parameters/error mapping | Primary with fake client if seams exist | Happy path and distinctive API semantics |
| CRUD, import, refresh, drift | Supporting | Primary |
| Eventual consistency/not-found | Waiter/finder unit cases | Representative lifecycle |
| Terraform language/Core semantics | No | No, unless verifying provider schema integration |

## Unit tests

Prefer table-driven tests named around the provider contract. Include null, unknown, empty, and malformed values when custom code handles them. Inspect diagnostics by summary/detail or severity rather than brittle whole-message matching unless exact text is contractual. Do not mock Terraform Core.

For validators and plan modifiers, instantiate the implementation and construct the Framework request/response type. Check all outputs: diagnostics, planned value, and replacement flags where applicable. Keep framework-version-specific request construction consistent with the repository's locked dependency.

For API mapping, use the provider's existing client abstraction. Avoid introducing a large abstraction solely to chase coverage; pure request-builder and response-flattener functions are often the cleanest seam.

## Acceptance tests

Use `resource.Test` with `resource.TestCase`, `ProtoV6ProviderFactories` for Framework providers, `CheckDestroy`, and ordered `resource.TestStep` entries. Common step tools:

- `Config` for a configuration state;
- `Check` composed with `resource.ComposeAggregateTestCheckFunc`;
- `PlanOnly` plus `ConfigPlanChecks` for plan assertions;
- `ImportState`, `ImportStateVerify`, and justified `ImportStateVerifyIgnore`;
- `ExpectError` for configuration/validation failures;
- `PreConfig` for safe out-of-band API mutation where repository patterns support it.

Use random/unique resource names and cleanup-safe configuration. Tests must be independently runnable, parallel only when API quotas and shared fixtures permit, and resilient to API-generated/canonical values. Assert exact stable values; use non-empty/regex/type checks for nondeterministic timestamps and IDs.

A baseline resource sequence:

1. minimal create with omitted optionals; assert identity, required values, null/default/computed state;
2. configured/update steps that cover distinct request paths;
3. removal/clearing step;
4. refresh/drift step if provider/API risk exists;
5. import verification;
6. automatic destroy plus `CheckDestroy`.

Import is often best after the final configured state. Put replacement transitions in a separate test when they obscure ordinary update coverage.

## Naming and structure

Follow repository convention first. Otherwise use:

- `TestAccWidgetResource_basic` — baseline CRUD and import;
- `TestAccWidgetResource_optionalAttributes`;
- `TestAccWidgetResource_collections`;
- `TestAccWidgetResource_requiresReplace`;
- `TestAccWidgetResource_drift` / `_disappears`;
- `TestWidgetModelFlatten_*`, `TestWidgetValidator_*`, `TestWidgetPlanModifier_*`.

Name config helpers `testAccWidgetResourceConfigMinimal`, `...ConfigFull`, and parameterize only meaningful differences. Keep the transition visible at the test call site. Group checks by step and add comments explaining API quirks, not restating code.

## Avoid redundant tests

Do not test:

- every combination of independent attributes;
- Terraform's basic required-argument or collection-language implementation beyond verifying schema wiring;
- every valid value accepted by a stock validator;
- identical CRUD mapping branches repeatedly;
- sensitive redaction as if it prevented state storage;
- ordering for sets or exact ordering when the API contract is unordered;
- import reconstruction of write-only inputs;
- unknown values that provider code never observes.

Add specialized coverage when an attribute has a distinct conversion helper, validator/modifier, default, normalization, replacement rule, cross-field relation, remote API quirk, or past regression.
