# Sweepers

Sweepers delete test resources that leaked from failed, interrupted, or timed-out
acceptance test runs. Without them a shared tenant slowly fills with orphans
until quota errors start failing unrelated tests.

Every new resource ships with a sweeper.

## How the pieces fit

This provider wraps the upstream sweeper machinery in `internal/sweep`, so a
resource package implements a `SweeperFunc` and registers it; the package handles
the client, orchestration, logging, and error classification.

| Symbol | Purpose |
|---|---|
| `sweep.Register(name, f, dependencies...)` | register a sweeper under a resource type name |
| `sweep.SweeperFunc` | `func(ctx, *client.CrowdStrikeAPISpecification) ([]sweep.Sweepable, error)` |
| `sweep.NewSweepResource(id, name, deleteFunc)` | build one sweepable item |
| `sweep.ResourcePrefix` | `tf-acc-test-`, the prefix `acctest.RandomResourceName` applies |
| `sweep.SkipSweepError(err)` | transient or permission errors that should skip the sweeper rather than fail it |
| `sweep.ShouldIgnoreError(err)` | per-delete errors safe to ignore, such as already-deleted |
| `sweep.IsNotFoundError` / `IsConflictError` / `IsForbiddenError` | error classification |
| `sweep.Trace` / `Debug` / `Info` / `Warn` / `Error` | leveled logging |
| `sweep.SharedClient(ctx)` | the API client, called for you by `Register` |

`internal/sweep/sweep_test.go` owns `TestMain` and calls each package's
`RegisterSweepers`.

## Implementation

Create `internal/<pkg>/sweep.go`:

```go
package widget

import (
    "context"
    "fmt"
    "strings"

    "github.com/crowdstrike/gofalcon/falcon/client"
    "github.com/crowdstrike/gofalcon/falcon/client/widgets"
    "github.com/crowdstrike/terraform-provider-crowdstrike/internal/sweep"
)

// RegisterSweepers is called from internal/sweep/sweep_test.go.
func RegisterSweepers() {
    sweep.Register("crowdstrike_widget", sweepWidgets)
}

func sweepWidgets(ctx context.Context, cl *client.CrowdStrikeAPISpecification) ([]sweep.Sweepable, error) {
    var sweepables []sweep.Sweepable

    queryParams := widgets.NewQueryWidgetsParamsWithContext(ctx)
    queryResp, err := cl.Widgets.QueryWidgets(queryParams)
    if sweep.SkipSweepError(err) {
        sweep.Warn("Skipping widget sweep: %s", err)
        return nil, nil
    }
    if err != nil {
        return nil, fmt.Errorf("listing widgets: %w", err)
    }
    if queryResp.Payload == nil || len(queryResp.Payload.Resources) == 0 {
        return sweepables, nil
    }

    getParams := widgets.NewGetWidgetsParamsWithContext(ctx)
    getParams.Ids = queryResp.Payload.Resources
    getResp, err := cl.Widgets.GetWidgets(getParams)
    if sweep.SkipSweepError(err) {
        sweep.Warn("Skipping widget sweep: %s", err)
        return nil, nil
    }
    if err != nil {
        return nil, fmt.Errorf("getting widgets: %w", err)
    }
    if getResp.Payload == nil {
        return sweepables, nil
    }

    for _, w := range getResp.Payload.Resources {
        if w == nil || w.ID == nil {
            continue
        }

        // Only sweep what the tests created.
        if !strings.HasPrefix(w.Name, sweep.ResourcePrefix) {
            sweep.Trace("Skipping %s (not a test resource)", w.Name)
            continue
        }

        sweepables = append(sweepables, sweep.NewSweepResource(*w.ID, w.Name, deleteWidget))
    }

    return sweepables, nil
}

func deleteWidget(ctx context.Context, cl *client.CrowdStrikeAPISpecification, id string) error {
    params := widgets.NewDeleteWidgetsParamsWithContext(ctx)
    params.Ids = []string{id}

    if _, err := cl.Widgets.DeleteWidgets(params); err != nil {
        if sweep.ShouldIgnoreError(err) {
            sweep.Debug("Ignoring delete error for widget %s: %s", id, err)
            return nil
        }
        return err
    }

    return nil
}
```

Then register it in `internal/sweep/sweep_test.go`:

```go
func registerSweepers() {
    // ... existing registrations
    widget.RegisterSweepers()
}
```

## The prefix filter is the safety mechanism

A sweeper runs against a real tenant and deletes things. The
`strings.HasPrefix(name, sweep.ResourcePrefix)` guard is what keeps it from
deleting objects a human created, and it is the one line in the file that must
not be wrong.

Two consequences for test design:

- tests must name resources with `acctest.RandomResourceName()`, which applies
  the prefix; a hardcoded name is unsweepable
- resources identified by something other than a name need an equivalent marker.
  `acctest.RandomUUID()` exists for this: it generates UUID-shaped values with the
  fixed `00000000-0000-` prefix so the sweeper can filter on it. Filter on that
  prefix rather than sweeping every object of the type.

If a resource type has no field a sweeper can filter on, that is worth raising in
review before the resource merges, because the alternative is either an unsafe
sweeper or permanent leakage.

## Dependencies

When one resource type must be deleted before another, the sweeper that must run
**second** declares the first as a dependency, because dependencies run before
the sweeper declaring them:

```go
// Widgets reference gadgets, so gadgets cannot be deleted until widgets are gone.
sweep.Register("crowdstrike_gadget", sweepGadgets, "crowdstrike_widget")
```

Getting this backwards produces conflict errors on every run that look like
transient API failures.

## Error handling

Three distinct cases, and conflating them makes sweeper output useless:

- **Listing fails transiently or for lack of permission**: `sweep.SkipSweepError`,
  log a warning, return `nil, nil`. The tenant may not have the feature enabled,
  and that is not a failure.
- **Listing fails for a real reason**: return a wrapped error so the run reports
  it.
- **A single delete fails harmlessly**, already deleted or being deleted:
  `sweep.ShouldIgnoreError`, log at debug, return nil so the rest of the sweep
  continues.

## Running

```bash
# Every sweeper
TF_ACC=1 go test ./internal/sweep -v -sweep=default

# One sweeper by its registered name
TF_ACC=1 go test ./internal/sweep -v -sweep=default -sweep-run=crowdstrike_widget

# Continue past failures to see everything that is stuck
TF_ACC=1 go test ./internal/sweep -v -sweep=default -sweep-allow-failures
```

Sweepers delete real objects. Run them against a development tenant only.

## Verifying a new sweeper

The cheap check: run the resource's acceptance tests, interrupt them mid-run so
resources leak, then run the sweeper with `-sweep-run` scoped to that resource and
confirm it reports deleting exactly the leaked objects. A sweeper that reports
zero sweepables when leaked resources exist is filtering on the wrong field, and
one that reports objects you did not create is missing the prefix guard.
