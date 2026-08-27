---
name: terraform-provider-testing
description: Design, implement, review, debug, or plan unit and acceptance tests for Terraform Plugin Framework provider resources and data sources, including CRUD, import, refresh, drift, primitive/collection/nested attributes, schema behaviors, validators, plan modifiers, normalization, and cross-attribute relationships.
---

# Terraform Provider Testing

Use tests to prove provider-owned behavior without retesting Terraform Core or the Framework. Treat remote API semantics as an explicit contract, not an incidental implementation detail.

## Workflow

1. Read the repository instructions and its testing conventions. For a resource change, inspect its schema, model, CRUD/import code, expand/flatten logic, API client behavior, and nearby tests.
2. Inventory each attribute: type; required/optional/computed/write-only/sensitive/default; replacement and other plan modifiers; validators; normalization; cross-field rules; API defaults, omission/null/empty semantics, mutability, ordering, and eventual consistency.
3. Assign ownership before selecting tests:
   - **Terraform Core:** expression evaluation, graph/lifecycle mechanics, and basic language collection semantics. Do not re-prove these.
   - **Plugin Framework:** schema protocol mechanics and stock validator/plan-modifier behavior. Unit-test custom logic and provider wiring, not library internals.
   - **Provider:** request mapping, state mapping, diagnostics, normalization, plan behavior it configures, not-found handling, and CRUD/import behavior. Test these.
   - **Remote API:** defaults, canonicalization, generated values, ordering, omission, asynchronous behavior, and drift. Exercise representative acceptance tests.
4. Build a minimal, risk-based matrix. Start with the baseline lifecycle, then select rows from [attribute-matrix.md](references/attribute-matrix.md). Add conditional rows only where the schema or API has that behavior; never create a Cartesian product.
5. Choose the cheapest faithful layer with [test-selection.md](references/test-selection.md). Keep deterministic custom functions in unit tests; reserve acceptance tests for Terraform planning/state/protocol and real API integration.
6. Implement idiomatic tests using [go-examples.md](references/go-examples.md). Use stable assertions and unique names; never depend on test order.
7. Review coverage with [review-checklist.md](references/review-checklist.md). Run focused tests, then the repository's broader format, unit, lint, and acceptance checks as credentials permit.

## Baseline lifecycle

For every mutable resource, normally exercise one coherent acceptance flow: minimal create → read/state assertions → update mutable fields → refresh → import verification → delete with destroy verification. Add out-of-band drift/deletion steps when the API permits them safely. Split tests when replacement, destructive cases, or API cost make a single flow unclear.

For a data source, test required lookup inputs, read/state mapping, not-found/error diagnostics, computed output (including nested output), and sensitive state handling. CRUD, replacement, and import do not apply.

## Decision rules

- Test every provider branch at least once, but consolidate attributes sharing the same mapping helper and semantics.
- Give every optional scalar the four transitions: omitted create, configured create, change, then remove to null or documented default.
- Give collections null/omitted, empty, cardinality, mutation, clearing, and re-omission coverage; add ordering/uniqueness/key/nested-element cases according to collection kind.
- Test both plan and apply for `RequiresReplace`; an apply-only test can miss an unintended in-place update.
- Test custom validators and plan modifiers directly, then add acceptance coverage for user-visible wiring or lifecycle consequences.
- Assert secrets never appear in readable state for write-only attributes. `Sensitive` only redacts display and still stores the value; do not confuse it with write-only.
- Use import verification only for readable persisted state. Ignore intentionally non-importable/write-only attributes with an explicit reason.
- Prefer `ImportStateVerify` over duplicating imported-state assertions; add explicit import steps for composite/custom importers and invalid IDs.
- When API behavior is conditional or eventually consistent, assert the documented stable contract and use provider waiters rather than sleeps.

## Official references

Consult current HashiCorp documentation when APIs or guarantees may have changed:

- [Framework resources](https://developer.hashicorp.com/terraform/plugin/framework/resources)
- [Attributes and nested attributes](https://developer.hashicorp.com/terraform/plugin/framework/resources/schema)
- [Validation](https://developer.hashicorp.com/terraform/plugin/framework/validation)
- [Plan modification](https://developer.hashicorp.com/terraform/plugin/framework/resources/plan-modification)
- [Write-only arguments](https://developer.hashicorp.com/terraform/plugin/framework/resources/write-only-arguments)
- [Import](https://developer.hashicorp.com/terraform/plugin/framework/resources/import)
- [Acceptance tests](https://developer.hashicorp.com/terraform/plugin/testing/acceptance-tests)
- [`TestCase`](https://developer.hashicorp.com/terraform/plugin/testing/acceptance-tests/testcase) and [`TestStep`](https://developer.hashicorp.com/terraform/plugin/testing/acceptance-tests/teststep)
- [Testing patterns](https://developer.hashicorp.com/terraform/plugin/testing/testing-patterns)
