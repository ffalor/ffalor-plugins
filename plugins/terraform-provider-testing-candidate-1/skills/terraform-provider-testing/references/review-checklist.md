# Pull-Request Review Checklist

## Coverage model

- [ ] Attribute inventory classifies type, Required/Optional/Computed flags,
      Sensitive/WriteOnly/default, validators, plan modifiers, replacement,
      normalization, API default/canonicalization, and cross-attribute rules.
- [ ] The test plan identifies Core, Framework, provider, and API ownership.
- [ ] Cases are consolidated by behavior; no meaningless Cartesian product.
- [ ] Every provider request/response mapping and distinct remote behavior is
      exercised by a unit or acceptance test.

## Lifecycle

- [ ] Minimal create proves remote existence, key state, computed/default values,
      and stable post-refresh plan.
- [ ] Mutable scalar lifecycle covers omit → set → change → omit.
- [ ] Collections cover null/omitted, empty, one, many, update, add, remove,
      clear, and omit-after-values as applicable.
- [ ] Lists cover ordering only when provider/API behavior is involved.
- [ ] Sets cover order independence and nested identity/canonicalization risks.
- [ ] Maps cover key add, value update, key remove, and clear.
- [ ] Nested collections update a child and preserve unrelated elements.
- [ ] Update assertions prove identity stays the same.
- [ ] Delete and `CheckDestroy` prove remote removal; not-found is accepted.
- [ ] Remote disappearance causes Read to remove state and plan recreation.

## Schema semantics

- [ ] Required attributes have minimal valid and provider-relevant invalid cases;
      optional-only omission/removal scenarios are not copied onto them.
- [ ] Optional values distinguish null, zero/false/empty, and defaults.
- [ ] Computed values cover create unknown → known, update/refresh changes,
      drift, and missing/null API responses where possible.
- [ ] Optional+computed authority between configuration, prior state, and API is
      explicit and tested.
- [ ] Default omission, override, and reset are tested.
- [ ] Sensitive metadata is asserted without leaking secrets.
- [ ] Write-only values are absent/null in state; behavior is verified safely;
      import ignores only irrecoverable inputs; CLI version is gated.
- [ ] Replacement attributes have an exact replacement plan assertion and an
      applied lifecycle proving new identity and old-object deletion.

## Validation and plan logic

- [ ] Valid values and distinct invalid classes are covered.
- [ ] Min/max tests include exact boundaries and immediately inside/outside.
- [ ] Conflict, required-together, exactly-one, and at-least-one truth tables are
      complete for rules actually implemented.
- [ ] Custom validators handle null and unknown without panics or false errors.
- [ ] Custom plan modifiers cover null, unknown, unchanged, changed, and all
      conditional branches in unit tests.
- [ ] Normalization yields canonical state and an empty final plan.
- [ ] Expected create/update/replace/destroy/no-op actions are asserted where a
      wrong action could still apply successfully.

## Import, refresh, and API behavior

- [ ] Import verifies all API-reconstructable fields; every ignored field has a
      reason; composite ID parsing has unit tests.
- [ ] Remote drift is made through the API and refresh assertions match field
      authority (repair configured, accept computed, or documented hybrid).
- [ ] API defaults, reordering, rounding, omission, eventual consistency, and
      error/not-found behavior have focused tests only where they exist.
- [ ] Data-source tests cover lookup/read, validation, refresh, and documented
      zero/multiple results; they do not copy CRUD/import cases.

## Test quality

- [ ] Pure deterministic logic uses table-driven Go unit tests; Terraform/API
      behavior uses acceptance tests; both are used only for integration risk.
- [ ] Tests use `ConfigStateChecks`, typed `knownvalue` checks, and plan checks;
      legacy checks remain only where required or consistent with migration.
- [ ] Test/config/check names follow repository conventions and describe intent.
- [ ] HCL helpers use indexed formatting, unique randomized names, and no
      environment-specific constants.
- [ ] Parallel tests are isolated; serialized tests explain the shared constraint.
- [ ] Diagnostics are matched precisely without depending on incidental prose.
- [ ] Acceptance tests clean up on success and expose a safe sweeper when the
      repository and resource risk justify one.
- [ ] Regression test demonstrably fails on the broken implementation and links
      the issue when available.
- [ ] Test comments explain *why*, not mechanics visible in code.

## Scope guardrails

- [ ] No tests merely re-prove HCL parsing, primitive typing, list positions,
      set uniqueness, or unparameterized HashiCorp library internals.
- [ ] No plaintext secret assertions, state edits to simulate drift, arbitrary
      sleeps, real-account hardcoded IDs, or network calls in ordinary unit tests.
- [ ] Framework/testing symbols and Terraform version gates match `go.mod` and
      the repository's supported Terraform versions.
- [ ] Official documentation links are current:
      [Plugin Framework](https://developer.hashicorp.com/terraform/plugin/framework),
      [acceptance tests](https://developer.hashicorp.com/terraform/plugin/testing/acceptance-tests),
      [testing patterns](https://developer.hashicorp.com/terraform/plugin/testing/testing-patterns),
      [schemas](https://developer.hashicorp.com/terraform/plugin/framework/schemas),
      [validation](https://developer.hashicorp.com/terraform/plugin/framework/validation), and
      [plan modification](https://developer.hashicorp.com/terraform/plugin/framework/resources/plan-modification).
