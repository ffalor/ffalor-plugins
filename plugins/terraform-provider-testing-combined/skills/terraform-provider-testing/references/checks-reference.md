# Checks and Test Struct Reference

API reference for `statecheck`, `plancheck`, `knownvalue`, `tfjsonpath`,
`compare`, and the `TestCase` / `TestStep` fields, as of
`terraform-plugin-testing v1.14.0` and `terraform-plugin-framework v1.17.0`.

Verify against the installed version rather than trusting this file when
something does not compile:

```bash
go doc github.com/hashicorp/terraform-plugin-testing/statecheck
go doc github.com/hashicorp/terraform-plugin-testing/knownvalue
go doc github.com/hashicorp/terraform-plugin-testing/helper/resource.TestStep
```

## Contents

1. [State checks](#state-checks)
2. [Plan checks](#plan-checks)
3. [Known value checks](#known-value-checks)
4. [tfjsonpath](#tfjsonpath)
5. [Value comparers](#value-comparers)
6. [Custom state checks](#custom-state-checks)
7. [TestCase fields](#testcase-fields)
8. [TestStep fields](#teststep-fields)
9. [Legacy Check and TestCheckFunc](#legacy-check-and-testcheckfunc)

## State checks

Supplied via `TestStep.ConfigStateChecks`, which applies to config (apply) mode
steps. All errors across the slice are aggregated and reported together.

| Check | Purpose |
|---|---|
| `statecheck.ExpectKnownValue(addr, path, check)` | the attribute has this type and value |
| `statecheck.ExpectSensitiveValue(addr, path)` | the attribute is marked sensitive (Terraform 1.4.6 or later) |
| `statecheck.CompareValue(comparer)` | accumulate the same attribute across steps and compare; call `.AddStateValue(addr, path)` in each step |
| `statecheck.CompareValuePairs(addr1, path1, addr2, path2, comparer)` | compare two attributes, usually across two resources |
| `statecheck.CompareValueCollection(addr1, []path, addr2, path2, comparer)` | compare each element of a collection against another attribute |
| `statecheck.ExpectKnownOutputValue(output, check)` | assert an output value |
| `statecheck.ExpectKnownOutputValueAtPath(output, path, check)` | assert inside an output value |
| `statecheck.ExpectIdentity(addr, map[string]knownvalue.Check)` | assert a resource identity |
| `statecheck.ExpectIdentityValue(addr, path, check)` | assert one identity attribute |
| `statecheck.ExpectIdentityValueMatchesState(addr, path)` | identity attribute equals the state attribute at the same path |
| `statecheck.ExpectIdentityValueMatchesStateAtPath(addr, identityPath, statePath)` | as above with differing paths |

`CompareValue` is created once outside the `TestCase` and reused, which is what
makes it work across steps:

```go
idUnchanged := statecheck.CompareValue(compare.ValuesSame())
// ... then in each step:
idUnchanged.AddStateValue(resourceName, tfjsonpath.New("id")),
```

## Plan checks

Supplied via `TestStep.ConfigPlanChecks` (config mode),
`TestStep.RefreshPlanChecks` (refresh mode), or `TestStep.ImportPlanChecks`
(plannable import modes).

Phases:

| Struct | Phases |
|---|---|
| `resource.ConfigPlanChecks` | `PreApply`, `PostApplyPreRefresh`, `PostApplyPostRefresh` |
| `resource.RefreshPlanChecks` | `PostRefresh` |
| `resource.ImportPlanChecks` | `PreApply` |

Checks:

| Check | Purpose |
|---|---|
| `plancheck.ExpectEmptyPlan()` | the whole plan has no operations |
| `plancheck.ExpectNonEmptyPlan()` | the plan has at least one operation |
| `plancheck.ExpectResourceAction(addr, actionType)` | the resource has this planned action |
| `plancheck.ExpectKnownValue(addr, path, check)` | the planned value is known and matches |
| `plancheck.ExpectUnknownValue(addr, path)` | the planned value is unknown |
| `plancheck.ExpectSensitiveValue(addr, path)` | the planned value is sensitive |
| `plancheck.ExpectKnownOutputValue` / `AtPath` | planned output assertions |
| `plancheck.ExpectUnknownOutputValue` / `AtPath` | planned output is unknown |
| `plancheck.ExpectNullOutputValue` / `AtPath` | planned output is null |
| `plancheck.ExpectDeferredChange(addr, reason)` | deferred action assertions |
| `plancheck.ExpectNoDeferredChanges()` | nothing deferred |

`plancheck.ResourceActionType` values:

| Constant | Meaning |
|---|---|
| `ResourceActionNoop` | no change planned |
| `ResourceActionCreate` | create |
| `ResourceActionRead` | a data source read deferred to apply |
| `ResourceActionUpdate` | in-place update |
| `ResourceActionDestroy` | delete |
| `ResourceActionDestroyBeforeCreate` | replacement, the default ordering |
| `ResourceActionCreateBeforeDestroy` | replacement with `create_before_destroy` |

## Known value checks

Used by both `statecheck.ExpectKnownValue` and `plancheck.ExpectKnownValue`.
Compose them for collections and objects.

| Check | Notes |
|---|---|
| `knownvalue.StringExact("v")` | exact string |
| `knownvalue.StringRegexp(re)` | regex, for API-generated values |
| `knownvalue.StringFunc(func(string) error)` | custom string predicate |
| `knownvalue.Bool(true)` | boolean |
| `knownvalue.BoolFunc(func(bool) error)` | custom bool predicate |
| `knownvalue.Int32Exact(5)` / `Int64Exact(5)` | integers |
| `knownvalue.Int32Func` / `Int64Func` | custom integer predicates |
| `knownvalue.Float32Exact(1.5)` / `Float64Exact(1.5)` | floats, compared with `==`, no tolerance |
| `knownvalue.Float32Func` / `Float64Func` | use these when the API round-trips floats imprecisely |
| `knownvalue.NumberExact(big.NewFloat(42))` | arbitrary-precision numbers |
| `knownvalue.NumberFunc` | custom number predicate |
| `knownvalue.Null()` | the value is null |
| `knownvalue.NotNull()` | the value is set, whatever it is |
| `knownvalue.ListExact([]Check{...})` | exact list, order significant |
| `knownvalue.ListPartial(map[int]Check{0: ...})` | specific indices only |
| `knownvalue.ListSizeExact(3)` | list length |
| `knownvalue.SetExact([]Check{...})` | exact set; your slice order is irrelevant |
| `knownvalue.SetPartial([]Check{...})` | set membership |
| `knownvalue.SetSizeExact(2)` | set size |
| `knownvalue.MapExact(map[string]Check{...})` | exact map |
| `knownvalue.MapPartial(map[string]Check{...})` | specific keys only |
| `knownvalue.MapSizeExact(1)` | key count |
| `knownvalue.ObjectExact(map[string]Check{...})` | every object attribute, all must be listed |
| `knownvalue.ObjectPartial(map[string]Check{...})` | some object attributes |
| `knownvalue.TupleExact` / `TuplePartial` / `TupleSizeExact` | dynamic attributes |

State values arrive as `json.Number` for every numeric attribute, so all the
numeric checks parse rather than type-assert. `Int64Exact` therefore passes
against an `Int32Attribute` holding an in-range value. Match the schema type for
readability, and do not read a failure as a type mismatch.

`ObjectExact` requires every attribute of the object; omitting one fails.
`ObjectPartial` is the right choice when the API populates members you do not
want to pin.

## tfjsonpath

```go
tfjsonpath.New("attribute")                              // top level
tfjsonpath.New("obj").AtMapKey("member")                 // object or map member
tfjsonpath.New("list").AtSliceIndex(0)                   // list element
tfjsonpath.New("rules").AtSliceIndex(0).AtMapKey("action") // member of a list element
tfjsonpath.New("rules").AtMapKey("ingress").AtMapKey("priority") // map nested
```

Sets have no stable index, so `AtSliceIndex` into a set is unreliable. Assert
sets whole with `SetExact` or by membership with `SetPartial`.

## Value comparers

From `github.com/hashicorp/terraform-plugin-testing/compare`, for use with the
`CompareValue*` state checks.

| Comparer | Purpose |
|---|---|
| `compare.ValuesSame()` | every accumulated value equals the previous one |
| `compare.ValuesDiffer()` | every accumulated value differs from the previous one |

These express the two most important computed-attribute properties: an
identifier must be the same across every step, and a modification timestamp must
differ after an update. See `references/schema-behaviors.md`.

## Custom state checks

Implement `statecheck.StateCheck` to assert anything state checks cannot,
principally the remote API's view:

```go
type widgetExistsCheck struct{ resourceAddress string }

func (c widgetExistsCheck) CheckState(ctx context.Context, req statecheck.CheckStateRequest, resp *statecheck.CheckStateResponse) {
    // req.State is a *tfjson.State from the terraform-json package.
    // Set resp.Error to fail; return early after setting it.
}
```

`req.State.Values.RootModule.Resources` is a slice of `*tfjson.StateResource`
matched by `Address`; attribute values live in `AttributeValues`. Use
`tfjsonpath.Traverse(resource.AttributeValues, path)` for nested lookups. Working
implementations of exists and disappears checks are in
`references/lifecycle-examples.md`.

## TestCase fields

| Field | Purpose |
|---|---|
| `PreCheck func()` | prerequisites; `func() { acctest.PreCheck(t) }` here |
| `ProtoV6ProviderFactories` | `acctest.ProtoV6ProviderFactories` |
| `CheckDestroy resource.TestCheckFunc` | verify everything is gone after the final destroy |
| `Steps []resource.TestStep` | the ordered steps |
| `TerraformVersionChecks` | gate on CLI version, for example `tfversion.SkipBelow(tfversion.Version1_11_0)` |
| `ErrorCheck` | provider-controlled error handling, such as skipping on an unsupported-feature error |
| `IsUnitTest bool` | run regardless of `TF_ACC`; prefer `resource.UnitTest` |
| `ExternalProviders` | pull in another provider, rarely needed here |

Entry points: `resource.ParallelTest` (the default), `resource.Test` (serial, not
deprecated), `resource.UnitTest` (ignores `TF_ACC`).

## TestStep fields

Config (apply) mode:

| Field | Purpose |
|---|---|
| `Config string` | inline HCL |
| `ConfigFile` / `ConfigDirectory` | HCL from `testdata`, with `config.TestNameFile` and similar helpers |
| `ConfigVariables config.Variables` | input variables for file-based configs |
| `ConfigStateChecks []statecheck.StateCheck` | state assertions |
| `ConfigPlanChecks resource.ConfigPlanChecks` | plan assertions |
| `ExpectError *regexp.Regexp` | the step must fail matching this pattern |
| `ExpectNonEmptyPlan bool` | tolerate a non-empty plan after apply |
| `PlanOnly bool` | plan without applying; incompatible with `PreApply` plan checks |
| `PreConfig func()` | run before the step, for out-of-band mutations |
| `PostApplyFunc func()` | run after the step's apply |
| `SkipFunc func() (bool, error)` | skip this step conditionally |
| `Destroy bool` | make this an explicit destroy step |
| `Taint []string` | mark resources tainted before the step |

Import mode:

| Field | Purpose |
|---|---|
| `ImportState bool` | makes this an import step |
| `ImportStateKind` | which import workflow, see `references/import-refresh-drift.md` |
| `ResourceName string` | the address to import |
| `ImportStateVerify bool` | deep-compare imported state against the prior step's state |
| `ImportStateVerifyIgnore []string` | attributes excluded from that comparison |
| `ImportStateVerifyIdentifierAttribute string` | identifier attribute when it is not `id` |
| `ImportStateId` / `ImportStateIdFunc` / `ImportStateIdPrefix` | supply or derive the import identifier |
| `ImportStateCheck ImportStateCheckFunc` | custom assertions on imported state |
| `ImportStatePersist bool` | keep the imported state for later steps |
| `ImportPlanChecks resource.ImportPlanChecks` | plan assertions for plannable import |

Refresh and query mode:

| Field | Purpose |
|---|---|
| `RefreshState bool` | makes this a refresh step |
| `RefreshPlanChecks resource.RefreshPlanChecks` | `PostRefresh` plan assertions |
| `Query bool` | makes this a query step, for list resources |
| `QueryResultChecks []querycheck.QueryResultCheck` | query result assertions |

## Legacy Check and TestCheckFunc

The official documentation directs providers to `ConfigStateChecks` and the state
check implementations instead of the `Check` field. `Check` and the
`resource.TestCheck*` helpers still work, but they are the previous generation:
assertions are imperative, errors surface one at a time unless composed with
`ComposeAggregateTestCheckFunc`, and nested and set attributes require
index-syntax strings such as `rules.0.action` and `tags.#` rather than typed
paths.

Do not write new tests with them, and do not mix `Check` and
`ConfigStateChecks` in the same step.

The one place `resource.TestCheckFunc` remains correct is
`TestCase.CheckDestroy`, whose type is `TestCheckFunc` and has no state-check
equivalent. `ImportStateCheck` and `ImportStateIdFunc` likewise take the older
`*terraform.State` type.

When updating an existing test file that uses `Check`, translate as:

| Legacy | Current |
|---|---|
| `TestCheckResourceAttr(n, "k", "v")` | `ExpectKnownValue(n, tfjsonpath.New("k"), knownvalue.StringExact("v"))` |
| `TestCheckResourceAttrSet(n, "k")` | `ExpectKnownValue(n, tfjsonpath.New("k"), knownvalue.NotNull())` |
| `TestCheckNoResourceAttr(n, "k")` | `ExpectKnownValue(n, tfjsonpath.New("k"), knownvalue.Null())` |
| `TestMatchResourceAttr(n, "k", re)` | `ExpectKnownValue(n, tfjsonpath.New("k"), knownvalue.StringRegexp(re))` |
| `TestCheckResourceAttrPair(n1, k1, n2, k2)` | `CompareValuePairs(n1, tfjsonpath.New(k1), n2, tfjsonpath.New(k2), compare.ValuesSame())` |
| `TestCheckResourceAttr(n, "l.#", "2")` | `ExpectKnownValue(n, tfjsonpath.New("l"), knownvalue.ListSizeExact(2))` |
| `TestCheckTypeSetElemAttr(n, "s.*", "v")` | `ExpectKnownValue(n, tfjsonpath.New("s"), knownvalue.SetPartial([]knownvalue.Check{knownvalue.StringExact("v")}))` |
