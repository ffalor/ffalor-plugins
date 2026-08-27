---
name: terraform-provider-testing
description: Design, implement, review, debug, or plan tests for Terraform Plugin Framework providers. Use whenever work involves resource or data-source CRUD/read tests, import, refresh and drift, disappearance, validation, defaults, plan modifiers, replacement, sensitive or write-only arguments, primitive/collection/nested attributes, state or plan checks, regression coverage, sweepers, ephemeral resources, or deciding between Go unit tests and terraform-plugin-testing acceptance tests. Read repository instructions and pinned dependency versions before proposing code.
---

# Terraform Provider Testing

Build the smallest suite that proves provider-owned and remote-API behavior across Terraform's lifecycle. Do not multiply tests merely to re-prove Terraform Core or Plugin Framework guarantees.

## Workflow

1. Read repository instructions, `CONTRIBUTING.md`, `go.mod`, and nearby tests before designing coverage. Inspect the schema, Terraform models, CRUD/Read/import methods, expand/flatten or wrap helpers, API client behavior, waiters, and known regressions.
2. Inventory each attribute by type and nesting; required/optional/computed/defaulted/sensitive/write-only behavior; validators and plan modifiers; update versus replacement; null/empty/unknown handling; and API defaults, mutability, ordering, canonicalization, and read-back fidelity.
3. Assign every behavior to Terraform Core, the Plugin Framework, the provider, or the remote API. Test provider/API behavior directly. Add only representative wiring coverage for framework-owned behavior.
4. Start with a baseline lifecycle, then select only applicable attribute and schema rows. Add focused cases for high-risk branches: clearing, replacement, not-found, partial failures, drift, asynchronous transitions, secrets, and regressions.
5. Choose the cheapest faithful layer: pure Go for deterministic logic; `resource.UnitTest` for provider-protocol behavior without remote infrastructure; acceptance tests for real Terraform planning/state and API lifecycle behavior.
6. Implement with repository-native factories, prechecks, clients, naming, cleanup, and assertion styles. Verify both Terraform state and the remote object when state echoing could conceal a missing request field.
7. Run focused tests first, then repository formatting, unit, lint, and broader acceptance checks as credentials permit. Report anything not run.

## Reference routing

Load only what the task needs:

- [Strategy and lifecycle](references/strategy-and-lifecycle.md): ownership, risk selection, CRUD/read/import/drift, data sources, regression tests, organization, and cleanup.
- [Attribute matrix](references/attribute-matrix.md): scalar, collection, object, nested, null/empty/unknown, and consolidation cases.
- [Schema behavior](references/schema-behavior.md): required/optional/computed/defaulted, sensitive/write-only, validation, normalization, and plan modifiers.
- [Go patterns](references/go-patterns.md): current `terraform-plugin-testing` structures, typed checks, replacement, import, drift, destroy checks, and version gates.
- [CrowdStrike repository overlay](references/crowdstrike-repository.md): required conventions for `terraform-provider-crowdstrike`.
- [Review checklist](references/review-checklist.md): risk-ordered PR and suite review.
- [Official references](references/official-references.md): current HashiCorp documentation and feature gates.

## Non-negotiable correctness rules

- Check `go.mod` before selecting symbols. Prefer APIs already used by the repository when supported.
- Use `resource.ParallelTest` by default when repository and API isolation permit it. Never also call `t.Parallel()`; `ParallelTest` already does so.
- Prefer `ConfigStateChecks`, `ConfigPlanChecks`, `statecheck`, `plancheck`, and `knownvalue` for new tests. Do not mix legacy `Check` with `ConfigStateChecks` in one step.
- Never combine `PlanOnly: true` with `ConfigPlanChecks.PreApply`; `terraform-plugin-testing` rejects that combination. For replacement, use a normal apply step with a `PreApply` action check, then prove applied identity change and old-object cleanup.
- A successful configuration step already exercises plan, apply, refresh, and a final no-diff plan. Add explicit plan checks when the action, unknown value, replacement, drift, or normalization is the behavior under test.
- Treat state equality as insufficient proof of API transmission. Use the real API or an existing fake seam when request mapping matters.
- Verify import only for state that Read can reconstruct. Explain every `ImportStateVerifyIgnore`; never ignore a readable field to hide broken Read behavior.
- Gate ephemeral-resource tests to Terraform 1.10+, write-only tests to 1.11+, and sensitive JSON state/plan checks to 1.4.6+ when required by the pinned testing library.
- `Sensitive` redacts display but still stores data. Write-only values are available only from configuration and must not enter plan/state artifacts.
- Use typed not-found classification. Permission, throttling, and transport errors do not prove deletion.
- Use bounded production waiters or polling. Never hide eventual consistency with fixed sleeps.
- Never expose secrets in HCL fixtures, state echoes, logs, diagnostics, or failed assertions.

## Output contract

When planning or reviewing tests, provide:

1. A behavior inventory with owner and risk.
2. A consolidated scenario matrix with transition, expected action, state/API result, layer, and import relevance.
3. Implemented or recommended tests and helpers using repository conventions.
4. Explicit omissions for Core/Framework guarantees and inapplicable scenarios.
5. Verification performed and remaining credential or environment limitations.
6. Review findings ordered by correctness and cleanup risk.
