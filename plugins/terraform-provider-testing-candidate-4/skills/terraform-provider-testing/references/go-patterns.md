# Go Testing Patterns

## Contents

1. Provider factory and test case
2. Baseline lifecycle example
3. Typed state and plan checks
4. Replacement and identity checks
5. Import
6. Configuration helpers
7. Custom API checks and destroy
8. Validator unit tests
9. Legacy checks
10. Ephemeral resources
11. Sweepers

Adapt imports and constructors to the provider’s pinned module versions. Prefer APIs already used by the repository when they remain supported.

## 1. Provider factory and test case

`terraform-plugin-testing/helper/resource` drives Terraform CLI with an in-process Plugin Framework provider:

```go
var testAccProtoV6ProviderFactories = map[string]func() (tfprotov6.ProviderServer, error){
    "example": providerserver.NewProtocol6WithError(New("test")()),
}

func TestAccWidget_basic(t *testing.T) {
    resourceName := "example_widget.test"
    rName := acctest.RandStringFromCharSet(12, acctest.CharSetAlphaNum)

    resource.ParallelTest(t, resource.TestCase{
        PreCheck:                 func() { testAccPreCheck(t) },
        ProtoV6ProviderFactories: testAccProtoV6ProviderFactories,
        CheckDestroy:             testAccCheckWidgetDestroy,
        Steps: []resource.TestStep{
            // Steps...
        },
    })
}
```

Do not call `t.Parallel()` if the repository’s `resource.ParallelTest` convention already handles parallelism incompatibly; follow local precedent. Use Protocol 5 only when the provider/schema requires it. Nested attributes require protocol 6.

Important `TestCase` fields:

| Field | Use |
|---|---|
| `PreCheck` | Fail early for credentials/account prerequisites |
| `ProtoV5ProviderFactories` / `ProtoV6ProviderFactories` | Framework provider servers |
| `TerraformVersionChecks` | Gate write-only, ephemeral, sensitivity, or other CLI-version features |
| `CheckDestroy` | Verify remote deletion after test cleanup |
| `Steps` | Sequential configurations sharing Terraform state |

Use `resource.UnitTest` only for fast provider-protocol tests that require no remote infrastructure. Normal acceptance tests use `resource.ParallelTest` or `resource.Test` and run with `TF_ACC=1`.

```go
func testAccPreCheck(t *testing.T) {
    t.Helper()
    if os.Getenv("EXAMPLE_API_TOKEN") == "" {
        t.Fatal("EXAMPLE_API_TOKEN must be set for acceptance tests")
    }
}
```

Fail on the missing variable name, never its secret value.

Important `TestStep` fields:

| Field | Use |
|---|---|
| `Config` | HCL configuration for a normal step |
| `ConfigStateChecks` | Typed assertions against resulting state |
| `ConfigPlanChecks` | Assertions around configuration plan/apply/refresh phases |
| `RefreshPlanChecks` | Assertions for refresh-only planning |
| `PlanOnly` | Plan without apply; ideal for replacement or validation action checks |
| `ExpectError` | Require a diagnostic matching a regular expression |
| `ExpectNonEmptyPlan` | Allow/require the post-apply plan difference intentionally created by drift/disappearance |
| `Destroy` | Explicit destroy step |
| `PreConfig` | Per-step setup, commonly an out-of-band API mutation |
| `ImportState` and related fields | Import and verify state |

## 2. Baseline lifecycle example

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
                resourceName, tfjsonpath.New("name"),
                knownvalue.StringExact(rName),
            ),
            statecheck.ExpectKnownValue(
                resourceName, tfjsonpath.New("description"),
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
                resourceName, tfjsonpath.New("description"),
                knownvalue.StringExact("updated"),
            ),
            sameID.AddStateValue(resourceName, tfjsonpath.New("id")),
        },
    },
    {
        Config: testAccWidgetConfig_minimal(rName),
        ConfigStateChecks: []statecheck.StateCheck{
            statecheck.ExpectKnownValue(
                resourceName, tfjsonpath.New("description"),
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
},
```

By default, successful configuration steps exercise plan, apply, refresh, and a final plan that must be empty. Add explicit plan checks where the action or planned value is itself the behavior under test.

## 3. Typed state and plan checks

Prefer `ConfigStateChecks` over the legacy flat-map `Check` field for new tests. Do not mix them in the same step.

### State values

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
    statecheck.ExpectKnownValue(
        resourceName,
        tfjsonpath.New("settings"),
        knownvalue.ObjectPartial(map[string]knownvalue.Check{
            "mode": knownvalue.StringExact("active"),
        }),
    ),
}
```

Useful exact checks include `Int32Exact`, `Int64Exact`, `Float32Exact`, `Float64Exact`, `NumberExact`, `StringRegexp`, `Null`, and `NotNull`.

Navigate with `tfjsonpath.New("list").AtSliceIndex(0).AtMapKey("name")` or map keys with `AtMapKey`. Do not index sets.

### Plan phases and actions

```go
ConfigPlanChecks: resource.ConfigPlanChecks{
    PreApply: []plancheck.PlanCheck{
        plancheck.ExpectResourceAction(resourceName, plancheck.ResourceActionUpdate),
        plancheck.ExpectKnownValue(
            resourceName,
            tfjsonpath.New("name"),
            knownvalue.StringExact("planned-name"),
        ),
    },
    PostApplyPostRefresh: []plancheck.PlanCheck{
        plancheck.ExpectEmptyPlan(),
    },
}
```

Available action assertions include create, read, update, destroy, no-op, destroy-before-create, create-before-destroy, and order-independent replacement.

Use `plancheck.ExpectUnknownValue` for computed values that must be unknown during plan. Do not assert unknown merely because it happens today; assert it when it is a schema contract or protects against inconsistent plans.

### Cross-step and cross-resource comparison

```go
same := statecheck.CompareValue(compare.ValuesSame())
different := statecheck.CompareValue(compare.ValuesDiffer())

// Add one value in each sequential step.
same.AddStateValue(resourceName, tfjsonpath.New("id"))
different.AddStateValue(resourceName, tfjsonpath.New("id"))

statecheck.CompareValuePairs(
    resourceName, tfjsonpath.New("network_id"),
    "example_network.test", tfjsonpath.New("id"),
    compare.ValuesSame(),
)
```

Use `CompareValueCollection` when checking whether a state value occurs in a collection.

## 4. Replacement and identity checks

Plan-only proof:

```go
{
    Config:   testAccWidgetConfig_immutableName("new-name"),
    PlanOnly: true,
    ConfigPlanChecks: resource.ConfigPlanChecks{
        PreApply: []plancheck.PlanCheck{
            plancheck.ExpectResourceAction(
                resourceName,
                plancheck.ResourceActionReplace,
            ),
        },
    },
},
```

Applied proof:

```go
differentID := statecheck.CompareValue(compare.ValuesDiffer())

// Add to state checks in the A and B apply steps.
differentID.AddStateValue(resourceName, tfjsonpath.New("id"))
```

Also verify the prior remote ID is gone. `ResourceActionReplace` accepts either destroy-before-create or create-before-destroy; use the specific action enum when ordering is contractual.

## 5. Import

```go
{
    ResourceName:      resourceName,
    ImportState:       true,
    ImportStateVerify: true,
    ImportStateKind:   resource.ImportBlockWithID,
    // ImportStateVerifyIgnore: []string{"password_wo"},
},
```

For composite identifiers, use `ImportStateId` or `ImportStateIdFunc`. Keep the parser in a pure function and table-test valid segments, empty parts, extra parts, escaping rules, and diagnostics.

## 6. Configuration helpers

Use indexed formatting verbs so adding arguments does not silently reorder placeholders:

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

- `%[1]q` safely quotes Go strings for HCL string literals.
- `%[1]s` inserts intentional raw HCL.
- Keep each helper self-contained and minimal for the scenario.
- Do not interpolate untrusted/raw values with `%s`.

## 7. Custom API checks and destroy

State checks can verify the remote object, not only Terraform state. Keep API access and address lookup in reusable helpers.

```go
type widgetExistsCheck struct {
    address string
}

func (c widgetExistsCheck) CheckState(
    ctx context.Context,
    req statecheck.CheckStateRequest,
    resp *statecheck.CheckStateResponse,
) {
    stateResource, err := stateResourceAtAddress(req.State, c.address)
    if err != nil {
        resp.Error = err
        return
    }

    id, ok := stateResource.AttributeValues["id"].(string)
    if !ok || id == "" {
        resp.Error = fmt.Errorf("%s has no id", c.address)
        return
    }

    if _, err := testAccClient().GetWidget(ctx, id); err != nil {
        resp.Error = fmt.Errorf("reading %s from API: %w", c.address, err)
    }
}
```

A disappears check deliberately deletes the API object after a successful state lookup. The next refresh must remove the Terraform resource from state and plan recreation.

`CheckDestroy` still uses the legacy `TestCheckFunc`:

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
        if !isNotFound(err) {
            return err
        }
    }
    return nil
}
```

Use typed not-found matching. A permission, throttling, or transport error is not proof of deletion.

## 8. Validator unit tests

Test custom validators directly and table-drive boundaries, null, and unknown:

```go
func TestWidgetNameValidator_ValidateString(t *testing.T) {
    t.Parallel()

    tests := map[string]struct {
        value     types.String
        wantError bool
    }{
        "valid":   {value: types.StringValue("widget-1")},
        "empty":   {value: types.StringValue(""), wantError: true},
        "null":    {value: types.StringNull()},
        "unknown": {value: types.StringUnknown()},
    }

    for name, test := range tests {
        t.Run(name, func(t *testing.T) {
            t.Parallel()

            req := validator.StringRequest{ConfigValue: test.value}
            var resp validator.StringResponse

            widgetNameValidator{}.ValidateString(context.Background(), req, &resp)

            if got := resp.Diagnostics.HasError(); got != test.wantError {
                t.Fatalf("HasError() = %t, want %t: %v", got, test.wantError, resp.Diagnostics)
            }
        })
    }
}
```

Package request/response types can move across framework versions; use the interfaces from the provider’s pinned version. For built-in validators, test provider wiring with one acceptance invalid value instead of copying upstream unit tests.

```go
{
    Config:      testAccWidgetConfig_invalidName(""),
    ExpectError: regexp.MustCompile(`name must not be empty`),
},
```

## 9. Legacy checks

Established providers may still use:

```go
Check: resource.ComposeAggregateTestCheckFunc(
    resource.TestCheckResourceAttr(resourceName, "name", rName),
    resource.TestCheckResourceAttrSet(resourceName, "id"),
    resource.TestCheckNoResourceAttr(resourceName, "removed"),
)
```

`ComposeAggregateTestCheckFunc` reports all failures; `ComposeTestCheckFunc` stops at the first. Prefer typed `ConfigStateChecks` for new coverage, especially nested values and sets.

## 10. Ephemeral resources

Preserve ephemeral-resource coverage when the provider implements them:

- Gate to Terraform 1.10+.
- Direct integration: feed ephemeral output to a dependent provider/resource and require apply success.
- Exact values: use `terraform-plugin-testing/echoprovider` to capture ephemeral data in an echo managed resource, then use normal state checks on the echo resource.
- Create a new echo resource address for each sequential step because echo preserves prior state for existing instances.
- Never persist a real production secret merely to assert it; use synthetic test credentials/data.

```go
resource.UnitTest(t, resource.TestCase{
    TerraformVersionChecks: []tfversion.TerraformVersionCheck{
        tfversion.SkipBelow(tfversion.Version1_10_0),
    },
    ProtoV6ProviderFactories: map[string]func() (tfprotov6.ProviderServer, error){
        "echo": echoprovider.NewProviderServer(),
    },
    Steps: []resource.TestStep{
        {
            Config: testEphemeralConfig(),
            ConfigStateChecks: []statecheck.StateCheck{
                statecheck.ExpectKnownValue(
                    "echo.test",
                    tfjsonpath.New("data").AtMapKey("username"),
                    knownvalue.StringExact("test-user"),
                ),
            },
        },
    },
})
```

## 11. Sweepers

```go
func TestMain(m *testing.M) {
    resource.TestMain(m)
}

func init() {
    resource.AddTestSweepers("example_widget", &resource.Sweeper{
        Name: "example_widget",
        F:    sweepWidgets,
    })
}
```

Filter by a test-only prefix/tag and dedicated account. For parent-child APIs, the parent sweeper declares child sweeper names in `Dependencies` so children run first.
