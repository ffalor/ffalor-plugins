# Go Patterns

## Contents

1. Test case structure
2. Baseline lifecycle
3. Typed state and plan checks
4. Replacement
5. Plan-only safety
6. Import
7. Drift and disappearance
8. Remote and destroy checks
9. Validation and configuration helpers
10. Sensitive, write-only, and ephemeral features

Check the repository's pinned `terraform-plugin-testing` and Framework versions before copying symbols. Prefer current repository patterns where they remain supported.

## 1. Test case structure

```go
func TestAccWidgetResource_lifecycle(t *testing.T) {
    rName := testAccRandomResourceName()
    resourceName := "example_widget.test"

    resource.ParallelTest(t, resource.TestCase{
        PreCheck:                 func() { testAccPreCheck(t) },
        ProtoV6ProviderFactories: testAccProtoV6ProviderFactories,
        CheckDestroy:             testAccCheckWidgetDestroy,
        Steps: []resource.TestStep{
            // Sequential lifecycle steps.
        },
    })
}
```

Use the repository's shared provider factories, prechecks, client initialization, and name generators. Protocol 6 is normal for Framework nested attributes. Use Protocol 5 only when the provider actually serves it.

`resource.ParallelTest` calls `t.Parallel()` internally. Never call both. Use `resource.Test` only for a documented shared-state, singleton, quota, or isolation constraint.

## 2. Baseline lifecycle

```go
sameID := statecheck.CompareValue(compare.ValuesSame())

Steps: []resource.TestStep{
    {
        Config: testAccWidgetConfig_minimal(rName),
        ConfigPlanChecks: resource.ConfigPlanChecks{
            PreApply: []plancheck.PlanCheck{
                plancheck.ExpectResourceAction(resourceName, plancheck.ResourceActionCreate),
                plancheck.ExpectUnknownValue(resourceName, tfjsonpath.New("id")),
            },
        },
        ConfigStateChecks: []statecheck.StateCheck{
            stateCheckWidgetExists(resourceName),
            statecheck.ExpectKnownValue(
                resourceName,
                tfjsonpath.New("name"),
                knownvalue.StringExact(rName),
            ),
            statecheck.ExpectKnownValue(
                resourceName,
                tfjsonpath.New("description"),
                knownvalue.Null(),
            ),
            sameID.AddStateValue(resourceName, tfjsonpath.New("id")),
        },
    },
    {
        Config: testAccWidgetConfig_description(rName, "updated"),
        ConfigPlanChecks: resource.ConfigPlanChecks{
            PreApply: []plancheck.PlanCheck{
                plancheck.ExpectResourceAction(resourceName, plancheck.ResourceActionUpdate),
            },
        },
        ConfigStateChecks: []statecheck.StateCheck{
            statecheck.ExpectKnownValue(
                resourceName,
                tfjsonpath.New("description"),
                knownvalue.StringExact("updated"),
            ),
            sameID.AddStateValue(resourceName, tfjsonpath.New("id")),
        },
    },
    {
        Config: testAccWidgetConfig_minimal(rName),
        ConfigStateChecks: []statecheck.StateCheck{
            statecheck.ExpectKnownValue(
                resourceName,
                tfjsonpath.New("description"),
                knownvalue.Null(),
            ),
        },
    },
    {
        ResourceName:      resourceName,
        ImportState:       true,
        ImportStateVerify: true,
        ImportStateKind:   resource.ImportBlockWithID,
    },
}
```

The harness already runs plan, apply, refresh, and final no-diff checks for ordinary configuration steps. Explicit action checks protect against a successful but unintended replacement or no-op.

## 3. Typed state and plan checks

Prefer typed checks for new coverage and do not mix `Check` with `ConfigStateChecks` in one step.

```go
ConfigStateChecks: []statecheck.StateCheck{
    statecheck.ExpectKnownValue(
        resourceName,
        tfjsonpath.New("enabled"),
        knownvalue.Bool(true),
    ),
    statecheck.ExpectKnownValue(
        resourceName,
        tfjsonpath.New("ports"),
        knownvalue.ListExact([]knownvalue.Check{
            knownvalue.Int64Exact(80),
            knownvalue.Int64Exact(443),
        }),
    ),
    statecheck.ExpectKnownValue(
        resourceName,
        tfjsonpath.New("labels"),
        knownvalue.MapPartial(map[string]knownvalue.Check{
            "env": knownvalue.StringExact("test"),
        }),
    ),
    statecheck.ExpectKnownValue(
        resourceName,
        tfjsonpath.New("members"),
        knownvalue.SetSizeExact(2),
    ),
}
```

Navigate lists with `AtSliceIndex` and objects/maps with `AtMapKey`. Never index sets. Use `CompareValuePairs` and `CompareValueCollection` following the exact signature in the pinned package and nearby repository examples.

Use `PostApplyPreRefresh` and `PostApplyPostRefresh` only when that exact phase is the subject. Do not add an explicit empty-plan check merely to duplicate the harness default.

## 4. Replacement

Use a normal applied step so one scenario proves both the plan and lifecycle:

```go
differentID := statecheck.CompareValue(compare.ValuesDiffer())

Steps: []resource.TestStep{
    {
        Config: testAccWidgetConfig_scope(rName, "scope-a"),
        ConfigStateChecks: []statecheck.StateCheck{
            stateCheckWidgetExistsAndRememberID(resourceName, &oldID),
            differentID.AddStateValue(resourceName, tfjsonpath.New("id")),
        },
    },
    {
        Config: testAccWidgetConfig_scope(rName, "scope-b"),
        ConfigPlanChecks: resource.ConfigPlanChecks{
            PreApply: []plancheck.PlanCheck{
                plancheck.ExpectResourceAction(
                    resourceName,
                    plancheck.ResourceActionReplace,
                ),
            },
        },
        ConfigStateChecks: []statecheck.StateCheck{
            differentID.AddStateValue(resourceName, tfjsonpath.New("id")),
            stateCheckWidgetExists(resourceName),
            stateCheckWidgetIDAbsent(&oldID),
        },
    },
}
```

`ResourceActionReplace` accepts either replacement order. Use `ResourceActionCreateBeforeDestroy` or `ResourceActionDestroyBeforeCreate` only when ordering is contractual. The remembered-ID helpers are repository-specific custom state checks; implement them through the sanctioned API client.

## 5. Plan-only safety

With `terraform-plugin-testing v1.14.0`, `PlanOnly: true` cannot be combined with `ConfigPlanChecks.PreApply`; the test step is rejected because plan-only mode skips that plan phase.

Prefer:

- A normal apply step with `PreApply` checks for create/update/replacement actions.
- `PlanOnly: true` with `ExpectError` for validation cases where no apply should occur.
- A normal same-config step with `PreApply: ExpectEmptyPlan()` when the pre-apply no-op itself is the contract.

If a task truly needs checks against a non-empty plan-only run, consult the pinned package documentation for the compatible phase and set `ExpectNonEmptyPlan: true`. Do not guess based on phase names.

## 6. Import

```go
{
    ResourceName:      resourceName,
    ImportState:       true,
    ImportStateVerify: true,
    ImportStateKind:   resource.ImportBlockWithID,
    // ImportStateVerifyIgnore: []string{"password_wo"},
},
```

Prefer no ignore list. Explain each ignored path. Use `ImportStateId` or `ImportStateIdFunc` for composite identifiers and table-test parsing separately. Import state is normally discarded after verification; use `ImportStatePersist` only when the following scenario intentionally acts on imported state.

Import blocks require a Terraform version that supports them (1.5+). If the repository supports older Terraform versions, use ordinary command import or add the appropriate version gate.

## 7. Drift and disappearance

Mutate or delete the object through the real API. Do not edit Terraform state.

Repository-established disappearance pattern:

```go
{
    Config: testAccWidgetConfig_minimal(rName),
    ConfigStateChecks: []statecheck.StateCheck{
        stateCheckWidgetExists(resourceName),
        deleteRemoteWidget(resourceName),
    },
    ExpectNonEmptyPlan: true,
},
```

The custom check deletes the API object after a successful apply. Refresh must remove the resource from state, making recreation a valid expected plan.

Use a distinct `RefreshState: true` step when assertions must target refresh without applying configuration. Use `RefreshPlanChecks` for refresh-specific plan phases supported by the pinned version.

## 8. Remote and destroy checks

Custom state checks receive parsed Terraform JSON state:

```go
func stateResourceAtAddress(state *tfjson.State, address string) (*tfjson.StateResource, error) {
    if state == nil || state.Values == nil || state.Values.RootModule == nil {
        return nil, fmt.Errorf("no Terraform state available")
    }

    for _, resourceState := range state.Values.RootModule.Resources {
        if resourceState.Address == address {
            return resourceState, nil
        }
    }

    return nil, fmt.Errorf("resource %s not found in state", address)
}
```

Use the ID from state to query through the repository's API client. Check for missing/incorrect ID types before calling the API.

`CheckDestroy` remains a legacy `TestCheckFunc` hook:

```go
func testAccCheckWidgetDestroy(s *terraform.State) error {
    for _, rs := range s.RootModule().Resources {
        if rs.Type != "example_widget" {
            continue
        }

        _, err := testAccClient().GetWidget(context.Background(), rs.Primary.ID)
        if err == nil {
            return fmt.Errorf("widget %s still exists", rs.Primary.ID)
        }
        if !isTypedNotFound(err) {
            return fmt.Errorf("checking widget %s deletion: %w", rs.Primary.ID, err)
        }
    }
    return nil
}
```

Adapt client calls and typed not-found matching to the repository. A generic error is not proof of destruction.

## 9. Validation and configuration helpers

Use indexed formatting and quote HCL string values:

```go
func testAccWidgetConfig_description(name, description string) string {
    return fmt.Sprintf(`
resource "example_widget" "test" {
  name        = %[1]q
  description = %[2]q
}
`, name, description)
}
```

Use `%[1]s` only for intentionally constructed raw HCL. Do not interpolate untrusted values as raw configuration.

For custom validators, table-test known valid/invalid boundaries plus null and unknown using the request/response types from the pinned Framework version. Use a representative acceptance `ExpectError` to prove schema wiring and user-visible diagnostics.

## 10. Sensitive, write-only, and ephemeral features

Gate version-specific tests:

```go
TerraformVersionChecks: []tfversion.TerraformVersionCheck{
    tfversion.SkipBelow(tfversion.Version1_11_0),
},
```

Use 1.11 for write-only, 1.10 for ephemeral resources, and 1.4.6 for sensitive JSON checks when applicable.

For write-only arguments, assert safe API effect and null state rather than the secret value. Retrieve the value in implementation code from configuration, not plan.

For ephemeral-resource value assertions, register both the provider under test and `echoprovider`, pass synthetic ephemeral data to an echo managed resource, and assert on the echo resource. For sequential changes, create a new echo resource address per step because existing echo resources preserve prior state. Never persist a production secret for the sake of a test.
