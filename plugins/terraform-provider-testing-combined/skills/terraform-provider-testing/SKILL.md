---
name: terraform-provider-testing
description: Design, write, review, audit, debug, or plan tests for Terraform Plugin Framework provider resources and data sources in this CrowdStrike provider. Use this skill whenever the request involves adding or changing tests, acceptance tests, unit tests, test coverage, test matrices, sweepers, statecheck / plancheck / knownvalue assertions, ConfigStateChecks, ImportState verification, ExpectError or validation tests, refresh and drift behavior, replacement-vs-in-place plan behavior, failing or flaky test debugging, or deciding which tests a given attribute or schema behavior needs. Also load it before reading or reviewing any _test.go file in this provider, so test code is judged against current terraform-plugin-testing practice rather than whatever patterns happen to be in the repo already.
metadata:
  version: "1.0.0"
---

# Terraform Provider Testing

Tests for Plugin Framework resources and data sources: what to test, where each
test belongs, and how to keep the whole matrix cheap enough that people actually
run it.

## This skill and the official docs are the standard

Derive test structure, coverage, and naming from **the schema under test** plus
this skill and the HashiCorp documentation linked at the bottom. Do not read
existing `_test.go` files in this repository to decide what good looks like.

This codebase has been through many iterations. Some tests use the legacy
`resource.TestCheckFunc` style that the official docs now steer away from, test
naming is inconsistent, and coverage is uneven. Treating those files as the
standard propagates exactly the problems this skill exists to fix. Read an
existing test file only when the task is to change that specific file, and then
read it as *the thing being fixed*, not as the pattern to copy.

## Whose behavior is it? The first filter

Before writing a test, decide which layer owns the behavior. Only two of the
four layers are worth spending live API calls on.

| Layer | Examples | Test it? |
|---|---|---|
| **Terraform Core** | missing `Required` attribute errors; type mismatch errors; unknown value propagation; a configured value cannot change during apply; set element order is not significant; destroy ordering | No. Core guarantees it. |
| **Plugin Framework** | `Default` applied when config is null; `Computed` + null config becomes unknown when the plan differs; `WriteOnly` values nullified in plan and state; `RequiresReplace()` marks replacement; validators run and surface diagnostics | No, not the mechanism. Test *your wiring* of it (the value you chose, the attribute you attached it to). |
| **Provider (this repo)** | `.wrap()` API-to-state mapping; flex null normalization; expand config-to-API; Read drift detection and not-found handling; import ID parsing; custom validators and plan modifiers; computed value derivation | **Yes.** This is the target. |
| **Remote API** | returns `""` or `[]` for unset fields; silently drops a field; normalizes, sorts, or upper-cases values; assigns computed values; eventual consistency; ignores part of an update | **Yes**, and only an acceptance test can. |

The framework's built-in test lifecycle already covers a large slice of the
provider layer for free: every `TestStep` runs **plan, apply, refresh, final
plan**, and a non-empty final plan fails the step. That means every step you
write already proves the config applies cleanly, `Read` round-trips without
drift, and state matches config. You never need an assertion for those.

## The flex and validator null contract

This provider normalizes API empty values to Terraform null. Schema validators
(`fwvalidators.StringNotWhitespace()`, list/set size validators) stop a user
from configuring `""` or `[]`, and `flex.*ToFramework` functions convert the
API's `""` and `[]` to `types.StringNull()` / a null collection in `.wrap()`.

The consequence for every assertion you write: **an unset optional attribute is
`knownvalue.Null()`, never `StringExact("")` and never `ListSizeExact(0)`.** An
explicitly empty collection in config is a validation error, not a state value.
See `references/schema-behaviors.md` for how this reshapes the omitted / empty /
null rows of each matrix, and CONTRIBUTING.md "State Consistency with flex and
Validators" for the provider-side rationale.

Computed collections on data sources are the exception: they should return an
empty collection rather than null, because `length()`, `contains()`, and
`for_each` all fail on null. See `references/data-sources.md`.

## Unit test or acceptance test?

Acceptance tests here run against a live CrowdStrike tenant. Every step costs
real API calls and wall-clock time. Choose by asking **does this need a live
round trip to be meaningful?**

**Unit test** (`go test`, no `TF_ACC`, free, milliseconds):
- validators: valid values, invalid values, every boundary, null and unknown handling
- `.wrap()` / flatten and expand functions: nil pointers, empty strings, empty slices, missing optional fields
- import ID parsing and any string or ID formatting helper
- normalization helpers, sort and dedupe logic, JSON marshalling of opaque settings
- custom plan modifier logic that is pure computation over request values

**Acceptance test** (`TF_ACC=1`, minutes, real resources):
- anything whose answer depends on what the API actually returns or accepts
- drift detection, refresh, replacement-versus-in-place plan behavior
- import round-tripping
- one thin step per validator confirming it is actually attached to the schema
  in the right place, since a perfectly unit-tested validator wired to the wrong
  attribute passes its unit tests and still ships broken

The general rule: **push value-level correctness down into unit tests and
reserve acceptance tests for behavior that only Terraform plus the real API can
demonstrate.** A matrix row that a unit test can answer should never become an
extra acceptance step.

## Cost discipline

A matrix that implies dozens of steps per attribute is a matrix nobody runs.
Three habits keep it affordable:

1. **Collapse scenarios into successive steps of one `TestCase`, not separate
   `TestCase`s.** A `TestCase` pays resource creation and destruction once;
   additional steps are just plan/apply/refresh/plan against a resource that
   already exists. Ten steps in one `TestCase` cost far less than ten
   `TestCase`s of one step.
2. **Drive every optional attribute through the same lifecycle simultaneously.**
   The baseline lifecycle below moves *all* optionals from omitted to set to
   changed to removed in the same steps, which covers the omitted / set /
   updated / removed rows for the whole schema at once.
3. **Give a scenario its own `TestCase` only when it needs different steps**,
   not because it is conceptually separate. That means: mutually exclusive
   config modes, replacement behavior (needs its own plan check), external
   deletion, and validation errors.

`ExpectError` steps fail during validate or plan, so they never create anything.
Grouping several invalid configs as consecutive `ExpectError` steps in one
`TestCase` is cheap.

## Baseline CRUD lifecycle

One `TestCase` per resource carries most of the matrix. This is the shape;
`references/lifecycle-examples.md` has the worked version with config helpers,
assertions, and custom state checks.

```go
func TestAccWidget_basic(t *testing.T) {
    rName := acctest.RandomResourceName()
    resourceName := "crowdstrike_widget.test"

    resource.ParallelTest(t, resource.TestCase{
        PreCheck:                 func() { acctest.PreCheck(t) },
        ProtoV6ProviderFactories: acctest.ProtoV6ProviderFactories,
        CheckDestroy:             testAccCheckWidgetDestroy,
        Steps: []resource.TestStep{
            // 1. Minimal config: only Required attributes.
            //    Assert computed values are set, optionals are null,
            //    optional+computed carry their documented default.
            {Config: testAccWidgetConfig_basic(rName), ConfigStateChecks: ...},

            // 2. Import round-trip at the minimal shape.
            {ResourceName: resourceName, ImportState: true, ImportStateVerify: true},

            // 3. Full config: every optional set, collections with several
            //    elements. Assert each configured value.
            {Config: testAccWidgetConfig_full(rName), ConfigStateChecks: ...},

            // 4. Import round-trip at the full shape.
            {ResourceName: resourceName, ImportState: true, ImportStateVerify: true},

            // 5. Mutated config: change scalars, update one collection element,
            //    add one, remove one, change a nested object field.
            {Config: testAccWidgetConfig_updated(rName), ConfigStateChecks: ...},

            // 6. Back to minimal: every optional removed. Assert they return to
            //    null (or, for optional+computed, to the documented behavior).
            {Config: testAccWidgetConfig_basic(rName), ConfigStateChecks: ...},
        },
    })
}
```

Import steps go **after each new state**, not only at the end, so each shape is
proven to round-trip rather than just the last one.

`ImportStateVerify: true` is the assertion that earns the step: it deep-compares
imported state against the prior step's state and is the only thing that catches
an attribute `Create` sets but `Read` forgets. It requires the default import
kind. `ImportStateKind: resource.ImportBlockWithID` exercises the newer
`import`-block workflow but **rejects `ImportStateVerify`**, so it is an
additional step asserting a no-op plan, not a replacement for this one. See
`references/import-refresh-drift.md`.

`resource.ParallelTest` is the default for independent tests. `resource.Test` is
not deprecated, it simply forces serial execution; use it only when tests share
state. `resource.UnitTest` runs regardless of `TF_ACC` and suits tests that need
no real API.

## Workflow

1. **Read the schema**, not the existing tests. List every attribute with its
   type and its behavior flags (`Required`, `Optional`, `Computed`, `Sensitive`,
   `WriteOnly`, `Default`, `Validators`, `PlanModifiers`). Note anything the API
   is documented to normalize or derive.
2. **Build the matrix** from that list using `references/attribute-matrix.md`
   (primitives and behavior flags), `references/collections-matrix.md`
   (list, set, map, object, nested), and `references/schema-behaviors.md`
   (computed, defaults, replacement, plan modifiers, normalization).
3. **Split the matrix** into unit rows and acceptance rows using the rule above.
   Write the unit tests first: they are free, fast, and shrink the acceptance
   surface.
4. **Fold the acceptance rows into as few `TestCase`s as possible**, starting
   from the baseline lifecycle and adding a `TestCase` only for a scenario that
   genuinely needs different steps.
5. **Write assertions** with `ConfigStateChecks` and `ConfigPlanChecks`. See
   `references/checks-reference.md` for the available checks and value matchers.
6. **Cover the error branches** the change touches, using
   `references/error-contract.md`. Read-404 and Delete-404 are the two that break
   users when wrong.
7. **Add the sweeper** if the resource is new: `references/sweepers.md`.
8. **Run, then self-review** against `references/review-checklist.md`.

## Naming and organization

- Test files sit next to the code they cover: `internal/<pkg>/widget_resource_test.go`,
  `internal/<pkg>/widget_data_source_test.go`. Unit tests for a file live in that
  file's `_test.go`; never create a catch-all `unit_test.go`.
- Acceptance tests: `TestAcc<Resource>_<scenario>`, for example `TestAccWidget_basic`,
  `TestAccWidget_disappears`, `TestAccWidget_requiresReplace`.
  Data sources: `TestAcc<Resource>DataSource_<scenario>`.
- When a test pins a specific value, extend to `TestAcc<Resource>_<attribute>_<value>`
  with camelCase for the value: `TestAccIOCIndicator_type_md5`,
  `TestAccTask_frequency_oneTime`.
- Unit tests: standard Go naming, `TestWrapWidget`, `TestParseImportID`.
- Name tests for **what they verify**, never for a ticket. `TestAccIOARuleGroup_comment`
  stays accurate as the code moves; `TestAccIOARuleGroup_commentDriftFromTicket334`
  rots. The one exception is a regression test for a reported bug:
  `TestAcc<Resource>_regressionGH<issue>`, with a doc comment linking the report,
  because tracing it back to the report is the whole point.
- Config helpers: `testAcc<Resource>Config_<description>(...)`, at the **bottom**
  of the file after the test functions, using indexed verbs (`%[1]q`).
  Parameterize instead of duplicating: two helpers differing by one literal
  should be one helper taking that literal as an argument.
- Resource addresses in configs use the `.test` label
  (`crowdstrike_widget.test`), held in a `resourceName` variable.
- No `provider` blocks in test configs; the provider comes from
  `acctest.ProtoV6ProviderFactories`.
- Tests create their own dependencies in their own config so they run against a
  clean account. Never hardcode account-specific IDs. Where an extra environment
  value is genuinely required, pass the matching `acctest.OptionalEnvVar` to
  `acctest.PreCheck` so the test fails loudly with a clear message.
- Resource-specific helpers stay in that resource's test file.
  `internal/acctest` is only for things many resources share.
- To unit test unexported symbols, add an in-package `export_test.go` aliasing
  them (`var WrapWidget = wrapWidget`) and call the alias from the external
  `<pkg>_test` package.

## Provider test helpers

`internal/acctest` (import as `"…/internal/acctest"`):

| Helper | Purpose |
|---|---|
| `acctest.ProtoV6ProviderFactories` | Provider factory map for `TestCase` |
| `acctest.PreCheck(t, optionalEnvVars...)` | Verifies credentials, initializes the shared Falcon test client |
| `acctest.RandomResourceName()` | Random name prefixed `tf-acc-test-` so sweepers can find it |
| `acctest.RandomUUID()` | UUID-shaped value with the sweepable `00000000-0000-` prefix |
| `acctest.SHA256(seed)` / `acctest.MD5(seed)` | Deterministic hashes for hash-shaped attributes |
| `acctest.ConfigCompose(configs...)` | Concatenates config fragments |
| `acctest.StringListOrNull(...)` / `StringSetOrNull(...)` | Build `types.List` / `types.Set` in unit tests, null when empty |
| `acctest.RequireHostGroupID` and siblings | `OptionalEnvVar` values for `PreCheck` |

`internal/testconfig` holds the shared Falcon client (`InitializeTestClient`,
`GetTestClient`) that `acctest.PreCheck` wires up; custom state checks that call
the API directly get their client from `testconfig.GetTestClient()`.
`internal/sweep` holds sweeper registration and the `tf-acc-test-`
`ResourcePrefix`.

## Commands

Use direct `go` commands, not `make` targets, so flags and scope are explicit.

```bash
# Unit tests (no live API)
unset TF_ACC && go test ./internal/... -v -timeout 15m

# Acceptance tests for one package
TF_ACC=1 go test ./internal/<pkg> -v -timeout 120m -parallel 10

# A single test
TF_ACC=1 go test ./internal/<pkg> -v -timeout 120m -run TestAccWidget_basic

# Sweepers (clean up leaked test resources; dev tenants only)
TF_ACC=1 go test ./internal/sweep -v -sweep=default
TF_ACC=1 go test ./internal/sweep -v -sweep=default -sweep-run=crowdstrike_widget

# Debugging: TF_LOG=DEBUG surfaces raw gofalcon API calls
TF_LOG=DEBUG TF_ACC=1 go test ./internal/<pkg> -v -run TestAccWidget > /tmp/test.log 2>&1
grep -i "error\|inconsistent\|<attribute>" /tmp/test.log
```

Credentials come from `FALCON_CLIENT_ID`, `FALCON_CLIENT_SECRET`, and
`FALCON_CLOUD` (defaults to `autodiscover`).

Capture a failing run to a file once and interrogate the log rather than
re-running repeatedly. Each rerun costs real time and real API calls; save a
fresh run for after you have changed something.

## References

Load these as the task requires. Each topic lives in exactly one file.

| File | Contents |
|---|---|
| `references/lifecycle-examples.md` | Worked baseline lifecycle, config helper style, custom `StateCheck` implementations, exists / destroy / disappears helpers, regression tests |
| `references/attribute-matrix.md` | Test matrix for string, bool, int, number, float attributes, and how to read a matrix |
| `references/collections-matrix.md` | Matrices for list, set, map, object, single/list/set/map nested attributes |
| `references/schema-behaviors.md` | Required, optional, computed, optional+computed, sensitive, write-only, defaults, replacement, plan modifiers, normalization, the null contract in depth |
| `references/validators.md` | Validator and cross-attribute testing: boundaries, conflicts, required-together, exactly-one-of, at-least-one-of |
| `references/import-refresh-drift.md` | Import modes and verification, refresh steps, drift and external-deletion testing |
| `references/error-contract.md` | `internal/tferrors` CRUD error branches: which 404 removes state, which is success, and where each branch belongs |
| `references/checks-reference.md` | `statecheck`, `plancheck`, `knownvalue`, `tfjsonpath`, comparers, and the `TestCase` / `TestStep` field reference |
| `references/data-sources.md` | Data source testing, `CompareValuePairs`, computed collection conventions |
| `references/sweepers.md` | Sweeper implementation and registration |
| `references/review-checklist.md` | Consolidated pull-request review checklist |

## Official documentation

- [Testing Patterns](https://developer.hashicorp.com/terraform/plugin/testing/testing-patterns)
- [TestCase](https://developer.hashicorp.com/terraform/plugin/testing/acceptance-tests/testcase) · [TestStep](https://developer.hashicorp.com/terraform/plugin/testing/acceptance-tests/teststep)
- [State Checks](https://developer.hashicorp.com/terraform/plugin/testing/acceptance-tests/state-checks/resource) · [Plan Checks](https://developer.hashicorp.com/terraform/plugin/testing/acceptance-tests/plan-checks) · [Known Value Checks](https://developer.hashicorp.com/terraform/plugin/testing/acceptance-tests/known-value-checks)
- [Import Mode](https://developer.hashicorp.com/terraform/plugin/testing/acceptance-tests/import-mode) · [Sweepers](https://developer.hashicorp.com/terraform/plugin/testing/acceptance-tests/sweepers) · [Unit Testing](https://developer.hashicorp.com/terraform/plugin/testing/unit-testing)
- [Framework acceptance tests](https://developer.hashicorp.com/terraform/plugin/framework/acctests) · [Plan Modification](https://developer.hashicorp.com/terraform/plugin/framework/resources/plan-modification) · [Defaults](https://developer.hashicorp.com/terraform/plugin/framework/resources/default) · [Validation](https://developer.hashicorp.com/terraform/plugin/framework/validation) · [Write-only Arguments](https://developer.hashicorp.com/terraform/plugin/framework/resources/write-only-arguments)
- Per-attribute-type semantics, when a matrix row hinges on what the type
  actually guarantees: [Schemas](https://developer.hashicorp.com/terraform/plugin/framework/schemas) · [Data types](https://developer.hashicorp.com/terraform/plugin/framework/types) · [Attributes](https://developer.hashicorp.com/terraform/plugin/framework/handling-data/attributes) — the per-type pages hang off that last one (`.../attributes/string`, `/bool`, `/int32`, `/int64`, `/float64`, `/list`, `/set`, `/map`, `/object`, `/single-nested`, `/list-nested`, `/set-nested`, `/map-nested`)

The Framework docs site serves only the newest version. When a question turns on
whether a feature exists in the version this provider compiles against, trust
`go doc` and `go.mod` over the site.
