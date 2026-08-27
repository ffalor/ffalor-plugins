---
name: terraform-provider-testing
description: Design, implement, review, debug, or plan tests for Terraform Plugin Framework provider resources and data sources. Use for CRUD and import acceptance tests, attribute lifecycle matrices, collections and nested attributes, validators, defaults, plan modifiers, replacement, sensitive or write-only arguments, refresh and drift, state/plan checks, test organization, regressions, sweepers, and deciding between Go unit tests and terraform-plugin-testing acceptance tests.
---

# Terraform Provider Testing

Build the smallest test suite that proves provider-owned and API-owned behavior. Do not create a Cartesian product of types and schema flags, and do not retest guarantees that belong solely to Terraform Core or the Plugin Framework.

## Workflow

1. Inspect the resource or data source schema, models, CRUD/read/import methods, helpers, API client behavior, and existing tests. Check `go.mod` before choosing APIs or version-gated features.
2. Inventory each attribute by:
   - Terraform type and nesting shape
   - Required, optional, computed, optional+computed, defaulted, sensitive, or write-only behavior
   - Update versus replacement semantics
   - Validators, plan modifiers, normalization, and cross-attribute relationships
   - Remote API defaults, mutability, ordering, omission/null/empty behavior, and read-back fidelity
3. Assign ownership for each behavior: Terraform Core, Plugin Framework, provider, or remote API. Test provider/API behavior; use at most a representative wiring test for framework behavior.
4. Select scenarios from the matrices. Consolidate equivalent scalar cases and expand only where type shape, provider logic, or API semantics differ.
5. Choose the cheapest correct layer:
   - Pure Go unit tests for deterministic provider helpers, custom validators/defaults/plan modifiers, conversions, normalization, and error classification.
   - `resource.UnitTest` only for fast Terraform CLI integration that uses no remote infrastructure.
   - Acceptance tests for Core/framework/provider integration and all real API lifecycle behavior.
6. Implement a baseline create/read/update/delete/import path, then add targeted attribute, plan, drift, and regression scenarios.
7. Review expected plan action, final state, remote object, import relevance, and the final empty plan for every transition.

## Required references

Read these before designing or reviewing a complete resource test suite:

- [Testing strategy and lifecycle](references/testing-strategy.md) — ownership boundaries, baseline CRUD, refresh/drift, data sources, unit-versus-acceptance decisions, organization, regression tests, and sweepers.
- [Attribute lifecycle matrices](references/attribute-matrices.md) — primitive, collection, object, nested, null/empty/unknown, and specialized lifecycle cases.
- [Schema behaviors](references/schema-behaviors.md) — required/optional/computed/defaulted/sensitive/write-only behavior, replacement, validators, relationships, normalization, and plan modifiers.
- [Go testing patterns](references/go-patterns.md) — current `terraform-plugin-testing` structures, plan/state checks, import, replacement, custom checks, validation unit tests, and ephemeral-resource coverage.
- [Pull-request review checklist](references/review-checklist.md) — consolidated completeness and quality gate.

Load [Official HashiCorp references](references/official-docs.md) when confirming current framework/testing APIs, feature version requirements, or reviewing links for a deliverable.

## Decision rules

- Treat configuration equality, list ordering, set uniqueness, set order independence, and schema flag enforcement as Core/framework behavior unless the provider transforms or the API changes them.
- Assert configured arguments only when proving provider transmission, normalization, API round-trip, drift, regression behavior, or schema wiring. State equality alone does not prove the API received a value.
- For API-backed attributes, verify both Terraform state and the remote object when feasible. Use typed API not-found checks for destroy/disappears.
- Use `ConfigStateChecks` and typed `knownvalue` checks for new tests. Use `ConfigPlanChecks` for create/update/replacement/no-op and unknown-value assertions. Keep legacy `TestCheckFunc` for `CheckDestroy` or established suites.
- Every replacement attribute needs a plan-only replacement assertion and an applied lifecycle assertion showing identity change and cleanup.
- Every supported resource import needs state verification. Ignore only attributes that import cannot reconstruct, such as write-only or intentionally configuration-only values, and document every ignore.
- A successful acceptance step normally includes plan, apply, refresh, and a final no-diff check. Add explicit plan checks when action type, unknown values, replacement, drift, or normalization is the behavior under test.
- Gate write-only tests to Terraform 1.11+ and ephemeral-resource tests to Terraform 1.10+.
- Never expose secrets in test failures, state echoes, fixtures, logs, or environment-variable diagnostics.

## Output expectations

When planning or reviewing tests, produce:

1. A behavior inventory with ownership and risk.
2. A consolidated scenario matrix listing configuration transition, expected plan, expected state/remote result, layer, and import relevance.
3. The implemented or recommended Go tests and helpers.
4. Explicit omissions for Core/framework guarantees that do not need provider tests.
5. Review findings ordered by correctness risk, with missing lifecycle coverage called out precisely.
