# Import, Refresh, and Drift Testing

Three related concerns, all about the state-versus-remote relationship rather
than the config-versus-state relationship the rest of the matrix covers.

## Contents

1. [Import modes](#import-modes)
2. [What ImportStateVerify actually checks](#what-importstateverify-actually-checks)
3. [ImportStateVerifyIgnore](#importstateverifyignore)
4. [Composite and non-id import identifiers](#composite-and-non-id-import-identifiers)
5. [Where import steps belong](#where-import-steps-belong)
6. [Refresh mode](#refresh-mode)
7. [Drift on a configured attribute](#drift-on-a-configured-attribute)
8. [Drift on a computed attribute](#drift-on-a-computed-attribute)
9. [External deletion, the disappears test](#external-deletion-the-disappears-test)
10. [Delete](#delete)
11. [Values disappearing from API responses](#values-disappearing-from-api-responses)

## Import modes

`ImportStateKind` selects which real Terraform workflow the step exercises.

| Kind | Workflow | Use when |
|---|---|---|
| `resource.ImportCommandWithID` (zero value) | `terraform import` | the default, and the only kind that supports `ImportStateVerify` |
| `resource.ImportBlockWithID` | an `import` block plus `terraform plan` | additionally proving the workflow practitioners use now generates a no-op plan |
| `resource.ImportBlockWithResourceIdentity` | an `import` block using resource identity | the resource implements identity |

The two block kinds are **plannable**, and the module rejects three things for
them:

| Rejected combination | Error |
|---|---|
| plannable kind + `ImportStateVerify` | `ImportStateVerify is not supported with plannable import blocks` |
| plannable kind + `ImportStatePersist` | `ImportStatePersist is not supported with plannable import blocks` |
| plannable kind on Terraform < 1.5.0 | requires 1.5.0 or a `TerraformVersionChecks` skip |

That first row decides the pattern. `ImportStateVerify` is the deep comparison
that catches a `Read` gap, so you cannot get it and the block workflow from one
step. Write two steps:

```go
// Deep-compares imported state against the previous step's state.
{
    ResourceName:      resourceName,
    ImportState:       true,
    ImportStateVerify: true,
},
// Proves the import-block workflow plans no changes.
{
    ResourceName:    resourceName,
    ImportState:     true,
    ImportStateKind: resource.ImportBlockWithID,
    ImportPlanChecks: resource.ImportPlanChecks{
        PreApply: []plancheck.PlanCheck{
            plancheck.ExpectResourceAction(resourceName, plancheck.ResourceActionNoop),
        },
    },
},
```

The verify step is the one that must exist. Add the plannable step when import is
a documented workflow for the resource; a no-op plan there is a stronger
statement than the deep comparison, because it proves a practitioner can adopt an
existing object without Terraform proposing to change it.

Import mode does run a plan for the plannable kinds, so
`ImportPlanChecks.PreApply` is available. The published documentation page still
says import mode supports no plan checks; the field exists in the module and
works.

## What ImportStateVerify actually checks

Import mode compares the resource as produced by **import** against the resource
as produced by **create**, using the prior step's statefile as the golden
reference, and does a deep comparison. `ImportStateVerify: true` turns that
comparison into a hard assertion.

This makes an import step a strong test of `Read` in isolation, because import
populates state purely from `Read` while the create path had the create response
and the plan to draw on. Any attribute that `Create` sets but `Read` fails to
populate shows up here and nowhere else.

For the plannable kinds the comparison happens as part of the generated plan, so
a mismatch reads as an unexpected planned change. Either way the failure names
the attribute that differs, which is usually enough to point straight at the gap
in `.wrap()`.

## ImportStateVerifyIgnore

Every entry is a small hole in the strongest test in the file, so each one needs
a reason.

| Legitimate | Why |
|---|---|
| Timestamps that move between the create read and the import read, such as `last_updated` | the values genuinely differ; the attribute is not broken |
| Secrets the API never returns on read, such as an API token | `Read` cannot populate them |
| `timeouts` and other meta-arguments | not remote state |

| Not legitimate | What to do instead |
|---|---|
| An attribute that `Read` simply forgets to set | fix `Read` |
| An attribute where import produces `""` and create produced null | fix the flex usage in `.wrap()` |
| A collection whose order differs between create and import | model it as a set, or sort in `.wrap()` |
| A write-only argument | not needed; write-only values are null in state on both sides, so they already match |

Reaching for `ImportStateVerifyIgnore` to make a red test green is the single
most effective way to hide a real `Read` bug. When the fix is unclear, leave the
test failing and investigate rather than adding the entry.

## Composite and non-id import identifiers

| Field | Purpose |
|---|---|
| `ImportStateId` | a literal identifier, when it is known ahead of time |
| `ImportStateIdFunc` | derive the identifier from state, for composite IDs such as `policy_id:host_group_id` |
| `ImportStateIdPrefix` | prepend a fixed prefix to the resource's `id` |
| `ImportStateVerifyIdentifierAttribute` | the attribute holding the identifier when it is not `id` |
| `ImportStateCheck` | custom assertions over the imported state, for cases the deep comparison cannot express |
| `ImportStatePersist` | keep the imported state for subsequent steps rather than discarding it |

Composite identifiers need both halves of the round trip covered:

```go
{
    ResourceName:      resourceName,
    ImportState:       true,
    ImportStateVerify: true,
    ImportStateIdFunc: func(s *terraform.State) (string, error) {
        rs := s.RootModule().Resources[resourceName]
        return fmt.Sprintf("%s:%s", rs.Primary.Attributes["policy_id"],
            rs.Primary.Attributes["host_group_id"]), nil
    },
},
```

The **parsing** side belongs in a unit test, where malformed input is free to
explore: too few segments, too many, empty segments, wrong separator, whitespace.
Those cases produce user-facing errors and are worth being thorough about; none
of them needs Terraform.

```go
func TestParseImportID(t *testing.T) {
    t.Parallel()

    tests := map[string]struct {
        in                        string
        wantPolicy, wantHostGroup string
        wantErr                   bool
    }{
        "valid":         {in: "abc:def", wantPolicy: "abc", wantHostGroup: "def"},
        "missing colon": {in: "abc", wantErr: true},
        "empty second":  {in: "abc:", wantErr: true},
        "too many":      {in: "a:b:c", wantErr: true},
        "empty":         {in: "", wantErr: true},
    }
    // ...
}
```

## Where import steps belong

**After each distinct state**, not only at the end. An import step proves the
resource round-trips at the shape state is in right now. Importing only after the
final step proves the final shape and leaves the others unverified, and it is
usually the minimal shape (everything optional null) and the full shape
(everything populated) that expose different `Read` gaps.

The baseline lifecycle in SKILL.md places import steps after the minimal and the
full configurations for exactly that reason. Adding one after the mutate step as
well is optional; by then the shape is a variation on the full config rather than
a new one.

## Refresh mode

A step with `RefreshState: true` runs `terraform refresh` and nothing else. Its
assertions go in `RefreshPlanChecks.PostRefresh`, since `ConfigStateChecks` apply
only to config (apply) steps.

```go
{
    RefreshState: true,
    RefreshPlanChecks: resource.RefreshPlanChecks{
        PostRefresh: []plancheck.PlanCheck{
            plancheck.ExpectEmptyPlan(),
        },
    },
},
```

A bare refresh step asserting an empty plan is rarely worth adding, because every
config step already refreshes and already fails on a non-empty final plan.
Refresh steps earn their place when combined with an out-of-band mutation, which
is what the next two sections do.

## Drift on a configured attribute

The scenario: something outside Terraform changes an attribute the practitioner
configured. The correct behavior is that refresh notices, the plan proposes
restoring the configured value, and applying converges.

Capture the identifier during the create step, mutate remotely, then refresh and
assert.

```go
func TestAccWidget_drift(t *testing.T) {
    rName := acctest.RandomResourceName()
    resourceName := "crowdstrike_widget.test"
    var widgetID string

    resource.ParallelTest(t, resource.TestCase{
        PreCheck:                 func() { acctest.PreCheck(t) },
        ProtoV6ProviderFactories: acctest.ProtoV6ProviderFactories,
        CheckDestroy:             testAccCheckWidgetDestroy,
        Steps: []resource.TestStep{
            {
                Config: testAccWidgetConfig_full(rName),
                ConfigStateChecks: []statecheck.StateCheck{
                    testAccCaptureWidgetID(resourceName, &widgetID),
                },
            },
            {
                // Refresh after an out-of-band edit: the plan must propose
                // putting the configured value back.
                PreConfig:    func() { testAccSetWidgetDescription(t, &widgetID, "changed elsewhere") },
                RefreshState: true,
                RefreshPlanChecks: resource.RefreshPlanChecks{
                    PostRefresh: []plancheck.PlanCheck{
                        plancheck.ExpectNonEmptyPlan(),
                        plancheck.ExpectResourceAction(resourceName, plancheck.ResourceActionUpdate),
                    },
                },
                ExpectNonEmptyPlan: true,
            },
            {
                // Applying converges back to the configured value.
                Config: testAccWidgetConfig_full(rName),
                ConfigStateChecks: []statecheck.StateCheck{
                    statecheck.ExpectKnownValue(resourceName, tfjsonpath.New("description"),
                        knownvalue.StringExact("managed by terraform")),
                },
            },
        },
    })
}
```

`testAccCaptureWidgetID` is a small custom state check that copies `id` into the
pointer; `testAccSetWidgetDescription` calls the API directly through
`testconfig.GetTestClient()`. See `references/lifecycle-examples.md` for the
custom state check shape.

`ExpectNonEmptyPlan: true` on the refresh step is required, since a non-empty
plan otherwise fails the step.

This `TestCase` is worth adding once per resource where drift is plausible, and
it is the only test that proves `Read` actually reads rather than echoing back
whatever state already held. A `Read` that copies prior state into the response
passes every other test in the file and fails this one.

## Drift on a computed attribute

Different expectation: there is nothing in config to differ from, so refresh
adopts the remote value and the plan stays empty. The assertion is
`plancheck.ExpectEmptyPlan()` on `PostRefresh`, plus, if the value matters, a
following config step asserting the adopted value.

If a computed attribute produces a non-empty plan after refresh, something is
wrong in the schema: it is probably optional plus computed when it should be
computed only, or it carries `UseStateForUnknown()` on a value the API changes.
See `references/schema-behaviors.md`.

## External deletion, the disappears test

The scenario: the remote object is deleted outside Terraform. The correct
behavior is that `Read` removes the resource from state and the next plan
proposes creating it, rather than returning a not-found error.

```go
func TestAccWidget_disappears(t *testing.T) {
    rName := acctest.RandomResourceName()
    resourceName := "crowdstrike_widget.test"

    resource.ParallelTest(t, resource.TestCase{
        PreCheck:                 func() { acctest.PreCheck(t) },
        ProtoV6ProviderFactories: acctest.ProtoV6ProviderFactories,
        CheckDestroy:             testAccCheckWidgetDestroy,
        Steps: []resource.TestStep{
            {
                Config: testAccWidgetConfig_basic(rName),
                ConfigStateChecks: []statecheck.StateCheck{
                    testAccCheckWidgetExists(resourceName),
                    // Deletes the object after apply, before the refresh and
                    // final plan of this same step.
                    testAccCheckWidgetDisappears(resourceName),
                },
                ExpectNonEmptyPlan: true,
            },
        },
    })
}
```

The mechanics: `ConfigStateChecks` run after apply and before the step's refresh
and final plan. Deleting there means the refresh hits a missing object, `Read`
must remove the resource from state, and the final plan proposes a create, which
is why `ExpectNonEmptyPlan` is needed.

What this catches is a `Read` that returns an error on not-found instead of
calling `resp.State.RemoveResource(ctx)`. That mistake leaves practitioners
permanently stuck: every plan errors and the only escape is manual state
surgery. It is the highest-value single-step test in the file after the baseline
lifecycle.

An equivalent structure puts the deletion in the next step's `PreConfig` using an
identifier captured by an earlier state check, as in the drift test above. Use
whichever reads more clearly; the state-check form is self-contained, the
`PreConfig` form separates "delete" from "assert" more visibly.

## Delete

Delete needs no test of its own. Every `TestCase` destroys everything it created
after the last step, and `CheckDestroy` then queries the API to confirm the
object is really gone rather than merely absent from state. So a `TestCase` with
`CheckDestroy` set already is the delete test, and a `TestCase` without it is
missing one.

What `CheckDestroy` must get right is distinguishing "gone" from "the call
failed", by error type rather than message text. Treating every error as gone
makes it pass whenever the API is simply unreachable, which is the failure mode
that leaves orphaned objects in the tenant. See the implementation in
`references/lifecycle-examples.md`.

**Delete tolerating an already-deleted object** is worth implementing and awkward
to force through Terraform, because refresh runs before destroy and removes the
missing resource from state, so `Delete` is never called. Rather than contriving a
test that fights the lifecycle, cover it two other ways:

- in code review, confirm `Delete` treats a not-found response as success instead
  of returning an error
- through the sweeper, which routinely deletes objects that may already be gone
  and is exactly why `sweep.ShouldIgnoreError` exists. See
  `references/sweepers.md`.

If the resource has a genuinely unusual delete path, for instance one that must
detach dependencies first or poll for an asynchronous deletion, add a `TestCase`
whose last step is `Destroy: true` and whose `CheckDestroy` verifies the
dependent objects too. That is worth a step; re-proving that Terraform calls
Delete is not.

## Values disappearing from API responses

A narrower case than deletion: the object still exists but stops reporting a
field. Only test it where there is evidence the API does this, for instance a
field populated asynchronously or one the API drops once a related feature is
disabled.

The shape is the drift test with the mutation clearing the field instead of
changing it. Two outcomes are acceptable and which one is correct depends on the
attribute:

- for a plain `Optional` attribute, state goes to null, the plan proposes setting
  the configured value back, and applying converges
- for a `Computed` attribute, state goes to null and the plan stays empty

The failure mode to watch for is a plan that proposes a change on every run
without ever converging. If the third step's config apply leaves a non-empty
plan, the provider is fighting the API and needs a schema or `.wrap()` change,
not a test adjustment.
