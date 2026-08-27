# Data Source Testing

Data sources read; they never create, update, or delete. That removes several
concerns and adds a few of its own.

## What does not apply

| Not applicable | Why |
|---|---|
| `CheckDestroy` | nothing was created |
| Import steps | no state to import into |
| Sweepers | nothing leaks |
| Disappears and drift tests | no managed lifecycle |
| Removal and update rows from the attribute matrices | a data source's attributes are read-only per apply |

What remains is: do the arguments select the right object, and are all the
computed attributes populated correctly?

## The core pattern

Create the object with the resource in the same config, then read it back with
the data source and compare the two side by side. This is stronger than pinning
literals: it verifies the data source's `Read` produces the same view of the same
object that the resource's `Read` does, and it keeps working when the API changes
a value the test did not choose.

```go
func TestAccWidgetDataSource_byName(t *testing.T) {
    rName := acctest.RandomResourceName()
    resourceName := "crowdstrike_widget.test"
    dataSourceName := "data.crowdstrike_widget.test"

    resource.ParallelTest(t, resource.TestCase{
        PreCheck:                 func() { acctest.PreCheck(t) },
        ProtoV6ProviderFactories: acctest.ProtoV6ProviderFactories,
        Steps: []resource.TestStep{
            {
                Config: testAccWidgetDataSourceConfig_byName(rName),
                ConfigStateChecks: []statecheck.StateCheck{
                    statecheck.CompareValuePairs(
                        resourceName, tfjsonpath.New("id"),
                        dataSourceName, tfjsonpath.New("id"),
                        compare.ValuesSame(),
                    ),
                    statecheck.CompareValuePairs(
                        resourceName, tfjsonpath.New("name"),
                        dataSourceName, tfjsonpath.New("name"),
                        compare.ValuesSame(),
                    ),
                    statecheck.CompareValuePairs(
                        resourceName, tfjsonpath.New("description"),
                        dataSourceName, tfjsonpath.New("description"),
                        compare.ValuesSame(),
                    ),
                    statecheck.CompareValuePairs(
                        resourceName, tfjsonpath.New("tags"),
                        dataSourceName, tfjsonpath.New("tags"),
                        compare.ValuesSame(),
                    ),
                },
            },
        },
    })
}

func testAccWidgetDataSourceConfig_byName(name string) string {
    return fmt.Sprintf(`
resource "crowdstrike_widget" "test" {
  name        = %[1]q
  region      = "us-1"
  description = "acceptance test"
  tags        = ["prod"]
}

data "crowdstrike_widget" "test" {
  name = crowdstrike_widget.test.name
}
`, name)
}
```

Cover **every attribute the data source exposes**. An attribute the data source
declares but never populates is the defect this test exists to find, and it is
invisible unless the comparison includes it.

Where the data source exposes an attribute the resource does not, or exposes it
under a different name, fall back to `statecheck.ExpectKnownValue` with
`knownvalue.NotNull()` or a regex rather than skipping it.

Referencing the resource's attribute in the data source's argument
(`crowdstrike_widget.test.name`) also creates the dependency that makes Terraform
read the data source after the resource exists.

## Computed collections return empty, never null

This is the one place the provider's null contract inverts. Practitioners consume
data source collections with `length()`, `contains()`, `for_each`, and splat
expressions, and every one of those fails on a null collection with an error the
practitioner cannot work around. So a computed collection with nothing in it must
be an **empty** collection.

That makes the assertion for a no-results collection:

```go
statecheck.ExpectKnownValue(dataSourceName, tfjsonpath.New("widgets"),
    knownvalue.ListSizeExact(0)),
```

and never `knownvalue.Null()`. If the data source returns null there, the fix is
in the data source's `Read`, not in the assertion.

The same reasoning does not extend to computed scalars, where null remains the
correct representation of "no value".

## Argument and filter matrix

| Row | Scenario | Assertion | Where |
|---|---|---|---|
| 1 | Required argument, exact match | full attribute comparison against the resource | the core pattern above |
| 2 | Each optional filter, individually | the created object is selected | one step per filter, in the same `TestCase` |
| 3 | Filters combined | the created object is selected | one step, only if combining changes the query |
| 4 | No match | the documented behavior: an error, or an empty collection for a plural data source | `ExpectError` step, or a size-zero assertion |
| 5 | Multiple matches for a singular data source | the documented behavior: an error, or a deterministic choice | `ExpectError` step, or an assertion pinning the choice |
| 6 | Invalid argument value | validator diagnostic | see `references/validators.md` |

Rows 4 and 5 are the ones most often missing, and they matter because they are
what a practitioner hits first when a filter is slightly wrong. Whichever
behavior the data source implements, it must be deliberate and documented, and
the test is what pins it.

Data source steps are cheaper than resource steps, since consecutive steps reuse
the same created resource and only re-read. Several filter permutations as
consecutive steps in one `TestCase` is the right shape.

## Plural data sources

A data source returning many objects lives in a shared tenant, so the result set
contains objects other tests and other people created. Asserting an exact count
or exact contents makes the test flaky by construction.

Assert **membership**, not equality:

```go
statecheck.ExpectKnownValue(dataSourceName, tfjsonpath.New("ids"),
    knownvalue.SetPartial([]knownvalue.Check{
        knownvalue.StringExact(/* the created id, via CompareValueCollection */),
    })),
```

`statecheck.CompareValueCollection` expresses this directly: it walks each element
of the collection and compares it against another attribute, so "the created
resource's id appears in the data source's id list" becomes one check.

```go
statecheck.CompareValueCollection(
    dataSourceName, []tfjsonpath.Path{tfjsonpath.New("widgets"), tfjsonpath.New("id")},
    resourceName, tfjsonpath.New("id"),
    compare.ValuesSame(),
),
```

Where a filter is narrow enough to be deterministic, for example filtering on the
randomized test name, an exact `ListSizeExact(1)` assertion is safe and worth
having, because it also proves the filter excludes everything else.

## Unit tests for filter logic

Filtering, sorting, and pagination assembly are pure functions and belong in unit
tests, where dozens of cases cost nothing: empty input, one match, several
matches, no match, case differences, and pagination boundaries.

Because these functions are usually unexported, add an in-package
`export_test.go` that aliases them, then call the aliases from the external
`<pkg>_test` package:

```go
// internal/widget/export_test.go
package widget

var (
    FilterByName = filterByName
    FilterByTags = filterByTags
)
```

```go
// internal/widget/widget_data_source_test.go
package widget_test

func TestFilterByName(t *testing.T) {
    got := widget.FilterByName(input, "prod")
    // ...
}
```

Every filter case moved into a unit test is an acceptance step you do not have to
run. For a data source with several filters, this is usually the difference
between a fast test file and a slow one.

## Naming

`TestAcc<Resource>DataSource_<scenario>`, for example
`TestAccWidgetDataSource_byName`, `TestAccWidgetDataSource_byTags`,
`TestAccWidgetDataSource_notFound`. Config helpers follow
`testAcc<Resource>DataSourceConfig_<scenario>`. Use `dataSourceName` and
`resourceName` variables holding the two addresses.

## Plan-time reads

Terraform reads data sources during plan when their arguments are fully known,
and defers to apply when they depend on a not-yet-created resource. In the core
pattern above the data source depends on the resource, so the read is deferred
and shows as `plancheck.ExpectResourceAction(dataSourceName, plancheck.ResourceActionRead)`
in the plan.

That assertion is rarely worth adding. It is useful in one situation: when a data
source is expected to be readable at plan time from literal arguments and
something in its implementation forces deferral, which surfaces as
`(known after apply)` in practitioners' plans and blocks them from using the
result in `count` or `for_each`.
