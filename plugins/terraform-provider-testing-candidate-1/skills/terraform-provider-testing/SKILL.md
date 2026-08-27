---
name: terraform-provider-testing
description: Design, implement, review, debug, and plan unit and acceptance tests for Terraform Plugin Framework provider resources and data sources. Use for CRUD lifecycle coverage, attribute and nested collection test matrices, validators, defaults, plan modifiers, replacement, import, refresh, drift, sensitive or write-only values, terraform-plugin-testing state/plan checks, regressions, and test PR review.
---

# Terraform Provider Testing

Build the smallest suite that proves **provider and remote API behavior** across
Terraform's lifecycle. Do not multiply tests for behavior already guaranteed by
Terraform Core or the Plugin Framework.

## Workflow

1. Read repository instructions and the resource/data-source implementation,
   schema, model conversion, API client seams, and existing test conventions.
2. Classify every behavior by owner:
   - **Core:** configuration syntax, dependency graph, primitive/collection type
     checking, set uniqueness, and list ordering semantics.
   - **Framework:** schema protocol plumbing and standard validator/plan-modifier
     mechanics. Test integration, not framework internals.
   - **Provider:** request mapping, diagnostics, normalization, state mapping,
     conditional rules, replacement choices, import parsing, and not-found logic.
   - **API:** defaults, canonicalization, eventual consistency, mutations,
     disappearance, and update/delete restrictions.
3. Inventory attributes by type, behavior flags, provider logic, API behavior,
   and lifecycle operations. Load [attribute-matrices.md](references/attribute-matrices.md)
   and select rows; do not form a Cartesian product.
4. Establish baseline create/read/update/delete/import/disappearance coverage.
   Load [lifecycle-and-selection.md](references/lifecycle-and-selection.md).
5. Add focused cases only for validators, defaults, normalization, plan
   modifiers, cross-attribute rules, nested changes, drift, unknowns, or known
   API edge cases.
6. Prefer fast unit tests for deterministic provider logic and acceptance tests
   for Terraform protocol, plans, state, and real API behavior. Use both when a
   unit-tested rule has material schema/lifecycle integration risk.
7. Use modern `terraform-plugin-testing` state and plan checks. Load
   [go-patterns.md](references/go-patterns.md) for idiomatic examples.
8. Review completeness, signal, isolation, cleanup, and import semantics with
   [review-checklist.md](references/review-checklist.md).

## Decision rules

- Make each test tell a lifecycle story with explicit transitions, expected
  plan action, expected state, and API consequence.
- Combine behaviorally equivalent primitives; specialize numeric boundaries,
  floating-point precision, normalization, and zero/false/empty versus null.
- For every optional scalar, cover `omitted -> configured -> changed -> omitted`
  and assert null or the documented provider/API default after each omission.
- For every mutable collection implemented by the provider, cover null/omitted,
  empty, one, many, mutation, addition, removal, clearing, and re-omission;
  specialize list order, set identity/uniqueness, map keys, and nested objects.
- Test required attributes with minimal valid configuration, omission/config
  errors, provider validators, and meaningful boundaries—not optional removal.
- Assert computed and optional+computed values at create, update/refresh, drift,
  disappearance/null, and import when the API can reconstruct them. Inspect
  unknown plan values and prior-state preservation only where schema logic
  promises those behaviors.
- For replacement attributes, assert a replacement plan **and** prove lifecycle
  replacement (identity changes and old remote object is gone); do not accept an
  update-only assertion.
- Treat a post-apply empty plan as necessary but insufficient. Assert important
  state and remote existence explicitly.
- Never assert secrets in clear text. Verify sensitivity, write-only state null,
  and API effect through a safe derived/readable value.
- Data sources have read/refresh and validation tests, not CRUD/replacement tests.
- Gate Terraform-version-specific features (for example write-only attributes)
  with `tfversion` checks.

## Baseline suite

For a managed resource, normally include:

- `_basic`: minimal create, API existence, key state, stable final plan, import.
- `_lifecycle`: representative mutable values and collection transitions,
  preserving identity for in-place updates.
- `_replace`: each distinct replacement mechanism or one table-driven unit
  group plus representative acceptance lifecycle.
- `_disappears`: delete remotely, refresh removes state, next plan recreates.
- `_validation`: provider-owned invalid values and attribute relationships.
- focused regression tests for previously broken behavior.

Separate tests when setup differs, parallelism is unsafe, failure would obscure
the scenario, or replacement/destructive behavior needs isolation. Otherwise,
combine sequential transitions to reduce expensive remote objects.

## Official sources

Use current HashiCorp documentation as authority and verify APIs against the
versions in `go.mod`:

- [Terraform Plugin Framework](https://developer.hashicorp.com/terraform/plugin/framework)
- [Acceptance testing](https://developer.hashicorp.com/terraform/plugin/testing/acceptance-tests)
- [Testing patterns](https://developer.hashicorp.com/terraform/plugin/testing/testing-patterns)
- [State checks](https://developer.hashicorp.com/terraform/plugin/testing/acceptance-tests/state-checks/resource)
- [Plan checks](https://developer.hashicorp.com/terraform/plugin/testing/acceptance-tests/plan-checks)
- [Framework schemas and attributes](https://developer.hashicorp.com/terraform/plugin/framework/schemas)
- [Validation](https://developer.hashicorp.com/terraform/plugin/framework/validation)
- [Plan modification](https://developer.hashicorp.com/terraform/plugin/framework/resources/plan-modification)
- [Import](https://developer.hashicorp.com/terraform/plugin/framework/resources/import)
- [Write-only attributes](https://developer.hashicorp.com/terraform/plugin/framework/resources/write-only-arguments)

Do not depend on another skill at runtime; the linked references contain the
complete testing workflow and patterns needed here.
