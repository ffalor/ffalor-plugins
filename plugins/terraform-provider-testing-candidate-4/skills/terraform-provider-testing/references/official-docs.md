# Official HashiCorp References

Confirm the provider’s pinned versions in `go.mod` before copying an API. The Plugin Framework documentation is versioned; use the matching documentation version when behavior differs.

## Plugin Framework

- [Plugin Framework overview](https://developer.hashicorp.com/terraform/plugin/framework)
- [Resources](https://developer.hashicorp.com/terraform/plugin/framework/resources)
- [Create](https://developer.hashicorp.com/terraform/plugin/framework/resources/create)
- [Read](https://developer.hashicorp.com/terraform/plugin/framework/resources/read)
- [Update](https://developer.hashicorp.com/terraform/plugin/framework/resources/update)
- [Delete](https://developer.hashicorp.com/terraform/plugin/framework/resources/delete)
- [Import](https://developer.hashicorp.com/terraform/plugin/framework/resources/import)
- [Plan modification](https://developer.hashicorp.com/terraform/plugin/framework/resources/plan-modification)
- [Default values](https://developer.hashicorp.com/terraform/plugin/framework/resources/default)
- [Write-only arguments](https://developer.hashicorp.com/terraform/plugin/framework/resources/write-only-arguments)
- [Data sources](https://developer.hashicorp.com/terraform/plugin/framework/data-sources)
- [Validation](https://developer.hashicorp.com/terraform/plugin/framework/validation)
- [Attributes overview](https://developer.hashicorp.com/terraform/plugin/framework/handling-data/attributes)
- [Accessing values](https://developer.hashicorp.com/terraform/plugin/framework/handling-data/accessing-values)
- [Types](https://developer.hashicorp.com/terraform/plugin/framework/types)
- [Data consistency errors](https://developer.hashicorp.com/terraform/plugin/framework/resources/plan-modification#terraform-data-consistency-rules)

### Attribute type pages

- [String](https://developer.hashicorp.com/terraform/plugin/framework/handling-data/attributes/string)
- [Boolean](https://developer.hashicorp.com/terraform/plugin/framework/handling-data/attributes/bool)
- [Int32](https://developer.hashicorp.com/terraform/plugin/framework/handling-data/attributes/int32)
- [Int64](https://developer.hashicorp.com/terraform/plugin/framework/handling-data/attributes/int64)
- [Number](https://developer.hashicorp.com/terraform/plugin/framework/handling-data/attributes/number)
- [Float32](https://developer.hashicorp.com/terraform/plugin/framework/handling-data/attributes/float32)
- [Float64](https://developer.hashicorp.com/terraform/plugin/framework/handling-data/attributes/float64)
- [List](https://developer.hashicorp.com/terraform/plugin/framework/handling-data/attributes/list)
- [Set](https://developer.hashicorp.com/terraform/plugin/framework/handling-data/attributes/set)
- [Map](https://developer.hashicorp.com/terraform/plugin/framework/handling-data/attributes/map)
- [Object](https://developer.hashicorp.com/terraform/plugin/framework/handling-data/attributes/object)
- [Single nested](https://developer.hashicorp.com/terraform/plugin/framework/handling-data/attributes/single-nested)
- [List nested](https://developer.hashicorp.com/terraform/plugin/framework/handling-data/attributes/list-nested)
- [Set nested](https://developer.hashicorp.com/terraform/plugin/framework/handling-data/attributes/set-nested)
- [Map nested](https://developer.hashicorp.com/terraform/plugin/framework/handling-data/attributes/map-nested)

## Provider testing

- [Testing overview](https://developer.hashicorp.com/terraform/plugin/testing)
- [Acceptance tests](https://developer.hashicorp.com/terraform/plugin/testing/acceptance-tests)
- [Testing patterns](https://developer.hashicorp.com/terraform/plugin/testing/testing-patterns)
- [Resource state checks](https://developer.hashicorp.com/terraform/plugin/testing/acceptance-tests/state-checks/resource)
- [Plan checks](https://developer.hashicorp.com/terraform/plugin/testing/acceptance-tests/plan-checks)
- [Import testing](https://developer.hashicorp.com/terraform/plugin/testing/acceptance-tests/import)
- [Sweepers](https://developer.hashicorp.com/terraform/plugin/testing/acceptance-tests/sweepers)
- [Ephemeral-resource acceptance tests](https://developer.hashicorp.com/terraform/plugin/testing/acceptance-tests/ephemeral-resources)
- [Debugging acceptance tests](https://developer.hashicorp.com/terraform/plugin/testing/acceptance-tests/troubleshooting)

## Official source and API references

- [terraform-plugin-framework](https://github.com/hashicorp/terraform-plugin-framework)
- [terraform-plugin-testing](https://github.com/hashicorp/terraform-plugin-testing)
- [terraform-plugin-framework-validators](https://github.com/hashicorp/terraform-plugin-framework-validators)
- [terraform-plugin-testing plancheck package](https://pkg.go.dev/github.com/hashicorp/terraform-plugin-testing/plancheck)
- [terraform-plugin-testing statecheck package](https://pkg.go.dev/github.com/hashicorp/terraform-plugin-testing/statecheck)
- [terraform-plugin-testing knownvalue package](https://pkg.go.dev/github.com/hashicorp/terraform-plugin-testing/knownvalue)
- [Terraform Plugin Framework Go API](https://pkg.go.dev/github.com/hashicorp/terraform-plugin-framework)

## Feature gates

- Write-only arguments: Terraform 1.11+.
- Ephemeral resources: Terraform 1.10+.
- Resource identity, when tested: Terraform 1.12+.
- Sensitive state/plan check helpers may have their own minimum Terraform/testing-library versions; follow current package documentation and the provider’s pinned dependency.
