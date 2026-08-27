# Official References

Confirm repository versions in `go.mod` before copying an API. Generated Go documentation for the pinned module is authoritative for exact symbols and field compatibility.

## Plugin Framework

- [Framework overview](https://developer.hashicorp.com/terraform/plugin/framework)
- [Resources](https://developer.hashicorp.com/terraform/plugin/framework/resources)
- [Data sources](https://developer.hashicorp.com/terraform/plugin/framework/data-sources)
- [Schemas and attributes](https://developer.hashicorp.com/terraform/plugin/framework/resources/schema)
- [Handling data](https://developer.hashicorp.com/terraform/plugin/framework/handling-data)
- [Validation](https://developer.hashicorp.com/terraform/plugin/framework/validation)
- [Plan modification](https://developer.hashicorp.com/terraform/plugin/framework/resources/plan-modification)
- [Defaults](https://developer.hashicorp.com/terraform/plugin/framework/resources/default)
- [Import](https://developer.hashicorp.com/terraform/plugin/framework/resources/import)
- [Write-only arguments](https://developer.hashicorp.com/terraform/plugin/framework/resources/write-only-arguments)
- [Data consistency rules](https://developer.hashicorp.com/terraform/plugin/framework/resources/plan-modification#terraform-data-consistency-rules)

## terraform-plugin-testing

- [Testing overview](https://developer.hashicorp.com/terraform/plugin/testing)
- [Acceptance tests](https://developer.hashicorp.com/terraform/plugin/testing/acceptance-tests)
- [Testing patterns](https://developer.hashicorp.com/terraform/plugin/testing/testing-patterns)
- [TestCase](https://developer.hashicorp.com/terraform/plugin/testing/acceptance-tests/testcase)
- [TestStep](https://developer.hashicorp.com/terraform/plugin/testing/acceptance-tests/teststep)
- [State checks](https://developer.hashicorp.com/terraform/plugin/testing/acceptance-tests/state-checks/resource)
- [Known-value checks](https://developer.hashicorp.com/terraform/plugin/testing/acceptance-tests/known-value-checks)
- [Plan checks](https://developer.hashicorp.com/terraform/plugin/testing/acceptance-tests/plan-checks)
- [Import tests](https://developer.hashicorp.com/terraform/plugin/testing/acceptance-tests/import)
- [Sweepers](https://developer.hashicorp.com/terraform/plugin/testing/acceptance-tests/sweepers)
- [Ephemeral-resource tests](https://developer.hashicorp.com/terraform/plugin/testing/acceptance-tests/ephemeral-resources)
- [Troubleshooting](https://developer.hashicorp.com/terraform/plugin/testing/acceptance-tests/troubleshooting)
- [`helper/resource` Go API](https://pkg.go.dev/github.com/hashicorp/terraform-plugin-testing/helper/resource)
- [`statecheck` Go API](https://pkg.go.dev/github.com/hashicorp/terraform-plugin-testing/statecheck)
- [`plancheck` Go API](https://pkg.go.dev/github.com/hashicorp/terraform-plugin-testing/plancheck)
- [`knownvalue` Go API](https://pkg.go.dev/github.com/hashicorp/terraform-plugin-testing/knownvalue)

## Feature gates

- Sensitive values in `terraform show -json`: Terraform 1.4.6+.
- Configuration-driven import blocks: Terraform 1.5+.
- Ephemeral resources: Terraform 1.10+.
- Write-only arguments: Terraform 1.11+.
- Resource identity/import identity features: verify the exact Terraform and testing-library minimum before use.

These gates describe Terraform CLI support, not merely Framework package availability. Always add `TerraformVersionChecks` to acceptance tests that require them.
