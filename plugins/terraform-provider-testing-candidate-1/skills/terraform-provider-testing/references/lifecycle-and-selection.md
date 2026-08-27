# Lifecycle and Test Selection

## Contents

1. [Baseline CRUD story](#baseline-crud-story)
2. [Operation matrix](#operation-matrix)
3. [Refresh and drift](#refresh-and-drift)
4. [Replacement](#replacement)
5. [Unit versus acceptance](#unit-versus-acceptance)
6. [Organization and naming](#organization-and-naming)
7. [Cleanup and specialty tests](#cleanup-and-specialty-tests)

## Baseline CRUD story

Design sequential steps around one remote object where practical:

1. **Create minimal:** plan creates; apply state contains identity and all
   documented defaults/computed values; API object exists; final plan is empty.
2. **Import:** import by documented identifier; verify all API-readable state.
   Ignore only inputs that cannot be recovered (for example some write-only
   secrets), and justify every ignored path.
3. **Update:** configure representative mutable scalar, collection, and nested
   changes; plan updates; identity remains the same; API and state match; final
   plan is empty.
4. **Remove/reset:** remove optional values and clear collections; plan updates;
   state returns to null/default/canonical empty; API agrees.
5. **Delete:** normal test teardown invokes Delete; `CheckDestroy` confirms the
   object is absent, treating API not-found as success.

Use an isolated `_disappears` test to delete through the API between steps,
then refresh/plan. Read must remove the object from state, and the next plan
must propose create. Test Delete of an already-gone object when provider logic
has a distinct not-found path and the harness can exercise it safely.

## Operation matrix

| Operation | Scenario | Expected plan/state | Best level | Import relevance |
|---|---|---|---|---|
| Create | minimal and representative full request | Create action; planned computed values unknown as designed; API response fully mapped; state saved even where early-state policy matters | Acceptance; request builder unit | Follow with import |
| Create failure | validation failure; API failure after/without ID | No API for validation; useful diagnostic; no corrupt state; early identity retained only if cleanup contract requires it | Unit + acceptance for critical API path | None |
| Read | normal response | Refresh maps every readable field and yields stable plan | Acceptance; flatten unit | Core to import |
| Read not found | remote deletion | Remove resource from state; next plan create | Acceptance | Imported resource must behave same |
| Read transient/error | retry or diagnostic contract | No silent state loss | Unit; acceptance only controllable service behavior | Same after import |
| Update | each distinct request path | Update action; identity stable; only intended remote fields change | Acceptance; diff/request unit | Imported object should remain updatable when supported |
| Update failure | API rejection/partial update if meaningful | Diagnostic and state consistent with refresh/recovery contract | Unit; selective acceptance | Optional |
| Delete | existing and already absent | Destroy; object absent; not-found succeeds | Acceptance | Same behavior after import |
| Import | valid ID, malformed multipart ID, not found | Valid populates reconstructable state; malformed/no object diagnoses clearly | Acceptance; parser unit | The subject |
| Data source Read | valid lookup, no/multiple match semantics, refresh | Read/no-op; exact computed state; errors as documented | Acceptance | No import |

Acceptance harnesses ordinarily execute plan → apply → refresh → final plan for
each configuration step and fail on unexpected final differences. Still assert
important plan actions and values explicitly; otherwise an unintended replace
can masquerade as a successful update.

## Refresh and drift

Create drift through the remote API, not by editing Terraform state:

| Drift | Refresh expectation | Following plan | Test when |
|---|---|---|---|
| Mutable configured field changes remotely | State reads remote value | Update repairs to configuration | Provider manages the field |
| Computed field changes | State accepts new API value | No-op unless another rule applies | API may change it |
| Optional+computed field changes | Follow documented authority (config or API) | Repair, accept, or modifier-driven result | API can mutate/default it |
| Field disappears/becomes null | State null/default or deliberate prior-state retention | Stable and contract-consistent | API can omit fields |
| Whole object deleted | Resource removed from state | Create | Every resource with Read |
| API normalizes/reorders | Canonical state | Empty plan | Lists/sets/maps or strings are canonicalized |

Use `RefreshState: true`/refresh-oriented test steps and `RefreshPlanChecks`
where supported by the repository's `terraform-plugin-testing` version. Avoid
timing-dependent drift tests; wait for observable API convergence.

## Replacement

For each distinct `RequiresReplace` or custom replacement condition:

1. Apply A and capture identity with `statecheck.CompareValue` or a custom
   API existence check.
2. Plan configuration B with a plan-only step or pre-apply plan check.
3. Assert the resource action is replacement. Depending on library version,
   use the replacement action constant/check available in `plancheck`; verify
   the exact API before coding.
4. Apply B; assert the identity differs, B is in state/API, and the A object no
   longer exists.
5. Import B when the replacement field is API-readable.

Unit-test custom plan modifiers across null, unknown, unchanged, changed, and
conditional inputs. Acceptance-test at least one lifecycle path per distinct
replacement rule; do not repeat identical framework modifiers on every scalar.

## Unit versus acceptance

| Prefer unit tests | Prefer acceptance tests | Use both |
|---|---|---|
| expand/flatten/wrap functions; request construction; import ID parsing; custom validator truth tables; custom plan modifier requests/responses; normalization; error classification; retry state functions with fakes | schema + Terraform planning; CRUD against API; state round-trip; import; sensitivity/write-only persistence; unknown dependency flow; drift/disappearance; API defaults/canonicalization/eventual consistency | custom behavior whose correctness depends on Framework wiring or a real API representation |

Use protocol-level `resource.UnitTest` only when it adds value over ordinary Go
unit tests; it still runs Terraform and is not a substitute for pure function
tests. Use `resource.ParallelTest` for acceptance by default. Serialize tests
only for shared/global API constraints.

## Organization and naming

- Tests: `TestAcc<Resource>_basic`, `_lifecycle`, `_replace<Name>`,
  `_validation<Name>`, `_disappears`, `_regressionGH1234`.
- Pure unit tests: `Test<Resource>_<FunctionOrRule>` with table `name` values
  describing input and expected outcome.
- Config helpers: `testAcc<Resource>Config_<scenario>`; use indexed format verbs
  (`%[1]q`, `%[2]d`) and keep HCL readable.
- Checks: `stateCheck<Resource>Exists`, `stateCheck<Resource>Disappears`, and
  `testAccCheck<Resource>Destroy`, following repository convention.
- Randomize globally unique names with a recognizable acceptance-test prefix.
- Keep regression tests linked to the issue and focused on the failed contract.

Do not force a two-commit history if repository contribution rules do not ask
for it. What matters is that the regression test fails against the broken
implementation and passes with the fix; document how that was verified.

## Cleanup and specialty tests

- Always provide teardown and remote `CheckDestroy` for managed resources.
- Add sweepers only when the repository uses them and leaked billable/scarce
  resources justify repeatable cleanup. Restrict by an unmistakable test prefix;
  declare child-before-parent dependencies.
- For eventually consistent APIs, test waiter success and terminal failure in
  unit tests; acceptance tests prove the actual create/read/delete convergence.
- Ephemeral resources require Terraform 1.10+ and an echo/dependent-resource
  pattern because ephemeral values are not persisted. That is outside ordinary
  managed-resource matrices but should use `tfversion.SkipBelow` and safe secret
  assertions.
- Write-only arguments require the Terraform version documented by the current
  Framework release (Terraform 1.11+ at introduction); gate tests rather than
  assuming the runner version.
