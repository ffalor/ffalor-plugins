# Idiomatic Go examples

These examples use `terraform-plugin-testing/helper/resource`. Match the repository's pinned versions because plan-check APIs evolve.

## Acceptance lifecycle

```go
func TestAccWidgetResource_lifecycle(t *testing.T) {
    name := acctest.RandomWithPrefix("tf-acc-widget")

    resource.Test(t, resource.TestCase{
        ProtoV6ProviderFactories: testAccProtoV6ProviderFactories,
        CheckDestroy:             testAccCheckWidgetDestroy,
        Steps: []resource.TestStep{
            {
                Config: testAccWidgetConfig(name, nil), // optional note omitted
                Check: resource.ComposeAggregateTestCheckFunc(
                    resource.TestCheckResourceAttrSet("example_widget.test", "id"),
                    resource.TestCheckNoResourceAttr("example_widget.test", "note"),
                ),
            },
            {
                Config: testAccWidgetConfig(name, pointer("first")),
                Check: resource.TestCheckResourceAttr(
                    "example_widget.test", "note", "first",
                ),
            },
            {
                Config: testAccWidgetConfig(name, pointer("second")),
                Check: resource.TestCheckResourceAttr(
                    "example_widget.test", "note", "second",
                ),
            },
            {
                Config: testAccWidgetConfig(name, nil),
                Check: resource.TestCheckNoResourceAttr(
                    "example_widget.test", "note",
                ),
            },
            {
                ResourceName:      "example_widget.test",
                ImportState:       true,
                ImportStateVerify: true,
            },
        },
    })
}
```

If the API/provider supplies a default, replace `TestCheckNoResourceAttr` with an exact default assertion. Avoid pointer helpers if the repository uses string config helpers; keep generated HCL readable.

## Collection transitions

```go
func testAccWidgetConfig(name string, labels []string) string {
    labelsConfig := "" // omitted, distinct from labels = []
    if labels != nil {
        quoted := make([]string, len(labels))
        for i, value := range labels {
            quoted[i] = strconv.Quote(value)
        }
        labelsConfig = fmt.Sprintf("labels = [%s]", strings.Join(quoted, ", "))
    }
    return fmt.Sprintf(`
resource "example_widget" "test" {
  name = %q
  %s
}
`, name, labelsConfig)
}
```

Use explicit steps for omitted, `[]`, one, many, update/add/remove, clear, and re-omit. For sets use `resource.TestCheckTypeSetElemAttr`; do not assert index order. For maps assert `%` count and `attribute.key` values. Nested lists use paths such as `rules.0.name`; for nested sets prefer set-element checks or custom state checks over numeric indices.

## Validation failure

```go
{
    Config:      testAccWidgetConfigInvalid(""),
    ExpectError: regexp.MustCompile(`(?i)name.*at least 1`),
}
```

Use acceptance validation cases to prove schema wiring. Test a custom validator's full boundary table directly:

```go
func TestPortValidator(t *testing.T) {
    tests := map[string]struct {
        value       types.Int64
        wantError   bool
    }{
        "minimum":       {types.Int64Value(1), false},
        "inside minimum": {types.Int64Value(2), false},
        "below minimum": {types.Int64Value(0), true},
        "maximum":       {types.Int64Value(65535), false},
        "above maximum": {types.Int64Value(65536), true},
        "null":          {types.Int64Null(), false},
        "unknown":       {types.Int64Unknown(), false},
    }
    // Construct validator.Int64Request/Response using the repository's
    // pinned Framework API, invoke ValidateInt64, and assert diagnostics.
}
```

## Replacement plan

Use the plan-check package available in the pinned `terraform-plugin-testing` version. The important contract is a plan-only transition that explicitly expects replacement, followed by an apply step proving the identity/lifecycle changes:

```go
{
    Config:   testAccWidgetImmutableConfig(name, "new-zone"),
    PlanOnly: true,
    ConfigPlanChecks: resource.ConfigPlanChecks{
        PreApply: []plancheck.PlanCheck{
            plancheck.ExpectResourceAction(
                "example_widget.test",
                plancheck.ResourceActionDestroyBeforeCreate,
            ),
        },
    },
},
```

Choose create-before-destroy or destroy-before-create according to actual lifecycle/configuration. A generic non-empty-plan check is insufficient to prove replacement.

## Import with intentional ignores

```go
{
    ResourceName:            "example_widget.test",
    ImportState:             true,
    ImportStateVerify:       true,
    ImportStateVerifyIgnore: []string{"password"}, // write-only; cannot be read
},
```

Every ignore needs a reason. Do not ignore a readable field merely to make import pass.

## Drift and disappearance

Use the real API client in the test's established hook to change a mutable field, then run the unchanged Terraform configuration and assert refreshed state/plan according to whether configuration should restore the value. For external deletion, delete through the API, refresh, and assert the resource leaves state; a later apply should recreate it. Never insert fixed sleeps—rely on production finders/waiters and bounded polling.
