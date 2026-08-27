# CRUD Error Contract

Every CRUD method in this provider routes API failures through
`internal/tferrors`, which turns a `gofalcon` error into a diagnostic and decides
whether the resource stays in state. These branches are provider-owned, so they
are worth testing, but most of them are cheaper to prove without a live tenant.

Verify the API before relying on this file:

```bash
go doc ./internal/tferrors
```

## The branches

`tferrors.NewDiagnosticFromAPIError(operation, err, apiScopes, options...)`
classifies by HTTP status. `operation` is one of `tferrors.Create`,
`tferrors.Read`, `tferrors.Update`, `tferrors.Delete`.

| Status | Result |
|---|---|
| 400 | `NewBadRequestError`, detail from the payload when present |
| 403 | `403 Forbidden` with the required scopes rendered from `apiScopes` |
| 404 | `NewNotFoundError`, whose summary is `tferrors.NotFoundErrorSummary` |
| 409 | `NewConflictError` |
| 207 | multi-status; payload errors are unpacked individually |
| 429 | `NewTooManyRequestsError` |

`NewDiagnosticFromAPIError` **always returns an error diagnostic, including for
404.** Removing a resource from state is a decision the calling method makes, not
something the helper does.

## What each method is expected to do

| Method and condition | Expected behavior |
|---|---|
| Create or Update, any API error | Error diagnostic naming the operation and required scopes. A 404 stays an error; there is nothing to drop from state. |
| Create, nil response or payload | `NewEmptyResponseError(tferrors.Create)`, never a nil-pointer panic. |
| Read, 404 | `NewResourceNotFoundWarningDiagnostic()` plus `resp.State.RemoveResource(ctx)`, so the next plan proposes creation. Warning, not error. |
| Read, empty resource list | Treated exactly like 404: warn and remove from state. |
| Read, any other error | Error diagnostic; state is left intact so a transient failure cannot destroy it. |
| Delete, 404 | Return with no diagnostic. The object is already gone, which is success. |
| Delete, payload-level errors | `NewDiagnosticFromPayloadErrors(tferrors.Delete, payload.Errors)`. |
| Any method, payload-level errors | Surfaced before empty-resource handling, so a real API complaint is not reported as "not found". |

The Read-404 and Delete-404 rows are the two that actually break users when they
are wrong: a Read that errors instead of removing state strands a practitioner
whose resource was deleted out of band, and a Delete that errors on 404 makes
`terraform destroy` unrunnable after a partial failure.

## Where to test each branch

| Branch | Layer | How |
|---|---|---|
| Read 404 removes state | **acceptance** | The disappears test in `references/import-refresh-drift.md`. Deleting through the API and refreshing is the only faithful proof. |
| Delete 404 succeeds | **acceptance**, incidentally | A disappears test whose resource is already gone at destroy time exercises this for free. Assert it deliberately only if the resource has custom delete logic. |
| Create/Update error diagnostics | **acceptance**, one case | An `ExpectError` step with a config the API rejects. One representative case per resource, not one per field. |
| Nil response, empty payload, payload errors | **unit** | These need a controllable client. Table-test the helper that wraps the API call, through `export_test.go`, rather than trying to make a live tenant return a nil payload. |
| Scope rendering in a 403 | **skip** | `scopes.GenerateScopeDescription` is shared and has its own coverage. Testing it per resource re-tests someone else's code. |

A note on cost: do not build an `ExpectError` acceptance step for every status
code. The classification lives in one shared function; once you have proven the
resource passes the right `Operation` and `apiScopes` into it, the per-status
mapping is `tferrors`' responsibility, not the resource's.

## Reviewing this in a PR

- [ ] Read distinguishes not-found from other errors and only removes state for
      not-found.
- [ ] Read treats an empty resource list the same as a 404.
- [ ] Delete treats 404 as success.
- [ ] No method returns a bare `err.Error()` where a `tferrors` constructor
      exists, because that loses the operation and scope context.
- [ ] Nil response and nil payload are handled before any dereference.
- [ ] `CheckDestroy` classifies not-found by error type, not by string matching,
      so a permission or throttling error is never mistaken for deletion.
