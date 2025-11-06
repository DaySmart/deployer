# Deployer

An opinionated deployment orchestrator that lets you describe a “component” in a single YAML file and deploy it with different underlying provider technologies (AWS CDK, Serverless Framework v1, hard‑coded outputs, or a Dynamic Environment provisioning lambda) using one unified CLI: `deployer`.

> Status: Experimental / Early Internal Use. Expect breaking changes.

---

## Table of Contents

- [Deployer](#deployer)
  - [Table of Contents](#table-of-contents)
  - [Overview](#overview)
  - [Features](#features)
  - [Component YAML Schema](#component-yaml-schema)
    - [Required Minimum](#required-minimum)
    - [Notes](#notes)
  - [Providers](#providers)
    - [Adding a New Provider](#adding-a-new-provider)
  - [CLI Usage](#cli-usage)
    - [Global Installation](#global-installation)
    - [Local (Repo) Execution](#local-repo-execution)
  - [Quick Start](#quick-start)
  - [Configuration \& Outputs](#configuration--outputs)
  - [Environment Output Service](#environment-output-service)
  - [Programmatic API](#programmatic-api)
    - [Contract](#contract)
  - [Architecture](#architecture)
  - [Development](#development)
    - [Local Build](#local-build)
    - [Provider Dev Tips](#provider-dev-tips)
  - [Troubleshooting \& Edge Cases](#troubleshooting--edge-cases)
    - [Potential Improvements](#potential-improvements)
  - [Contributing](#contributing)
  - [License](#license)
  - [Attribution \& Notes](#attribution--notes)

---

## Overview

The Deployer abstracts over multiple infrastructure/application deployment mechanisms. You provide a YAML “component template” that names the component, its target environment, provider selection & configuration, and arbitrary input properties. The CLI then:

1. Parses the YAML (including JSON references via `json-refs` if used in the future).
2. Instantiates the appropriate provider implementation.
3. Runs the provider deployment.
4. Collects any outputs returned by the provider and persists them to a centralized environment output service (`https://environments.daysmart.net/output`).

## Features

- Unified CLI: `deployer deploy <component.yml>`.
- Multiple providers:
  - AWS CDK (single stack synthesis & deployment).
  - Serverless Framework v1 (writes ephemeral config & runs `sls deploy`).
  - Hardcoded (inject static key/value outputs without actually deploying anything).
  - Dynamic Environment provisioning (invokes a predefined Lambda, subscribes to CodeBuild logs until completion).
- Automatic output publishing per component/environment.
- Simple YAML schema; minimal required fields.
- Extensible provider model via a switch in `lib/deployer.ts`.

## Requirements

| Concern | Minimum | Recommended |
|---------|---------|-------------|
| Node.js runtime | 18.x LTS | 22.x (current active release) |
| NPM | 8.x+ | 10.x+ |
| AWS Credentials | Standard CLI / env vars | AssumeRole with MFA (org policy) |

Why Node 22: Modern dependencies increasingly rely on stable `node:` specifiers, updated crypto APIs, and performance improvements only available in >=18; choosing 22 future‑proofs the tool and aligns with deprecation of older runtimes. Running under Node <16 can yield `Cannot find module 'node:crypto'` for packages expecting the newer resolution behavior.

### CI / CodeBuild Note
If you see errors like:
```
Error: Cannot find module 'node:crypto'
```
Update your buildspec to use a newer runtime (e.g. `runtime-versions: nodejs: 22`). Also correct any YAML typos (e.g. `upload-artificats` should be `upload-artifacts`). See example below.

**Example buildspec.yml (Node 22)**
```yaml
version: 0.2
env:
  variables:
    COMPONENT_FILE: components/orders.yaml
phases:
  install:
    runtime-versions:
      nodejs: 22
    commands:
      - npm install -g git+https://github.com/DaySmart/deployer.git#master
  pre_build:
    commands:
      - echo "Using Node $(node -v)" && deployer deploy $COMPONENT_FILE
  build:
    commands:
      - echo "Build phase complete"  # (Optional – deployment already done in pre_build)
artifacts:
  files:
    - '**/*'
```
Place `deploy` in `pre_build` if deployment is the goal; use `build` for subsequent packaging or tests.

## Component YAML Schema

Below is a consolidated schema (informal). Fields may vary slightly per provider.

```yaml
name: orders-api            # Logical component name
env: dev                    # Target environment/stage name (used in stack naming, outputs key prefix)
provider:
	name: serverless-framework  # One of: serverless-framework | hardcoded | dsicollection-dynamic-environment | cdk
	# (For provider 'cdk' only) config:
	#   constructPath: infra/orders-stack.js   # Path (relative to repo root) to module exporting one or more CDK constructs
	#   constructName: OrdersStack             # Optional; if omitted first exported symbol is used
	#   env:                                   # Standard CDK Environment
	#     account: '123456789012'
	#     region: 'us-east-1'
region: us-east-1            # (Serverless only) AWS region override; optional
input:                       # Arbitrary provider-specific properties
	SOME_VAR: some-value       # Serverless: becomes .deployer/serverless.config.yaml
	# Hardcoded provider: each key/value becomes an output
	# Dynamic environment provider example:
	# branch: feature/my-branch
	# baseEnvironment: dev
	# includeApps:
	#   - app1
	# excludeApps:
	#   - legacyApp
```

### Required Minimum

At least: `name`, `env`, and `provider.name` (plus `provider.config` for `cdk`).

### Notes

- The file is parsed by `parseYaml` (`lib/utils/parseYaml.ts`) using `js-yaml`.
- JSON references (`$ref`) could be supported since `json-refs` is included (not currently invoked explicitly).

## Providers

| Name                                | File                                               | Purpose                                                                  | Outputs Behavior                                          |
| ----------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------- |
| `serverless-framework`              | `lib/providers/serverless.ts`                      | Executes a Serverless Framework v1 deployment using runtime-built args.  | Extracts CloudFormation stack outputs and publishes them. |
| `hardcoded`                         | `lib/providers/hardcoded.ts`                       | Returns each `input` key/value directly as an output (no cloud action).  | Publishes every pair exactly.                             |
| `dsicollection-dynamic-environment` | `lib/providers/dsicollectionDynamicEnvironment.ts` | Invokes a provisioning Lambda, tails CodeBuild logs, returns no outputs. | Publishes nothing (empty array).                          |
| `cdk`                               | `lib/providers/cdk.ts`                             | Synths & deploys a single CDK stack from a construct.                    | Converts deploy result outputs to key/value pairs.        |

### Adding a New Provider

Implement a class with an async `deploy()` returning `{ outputs: Array<{key,value}> }`. Then extend the `switch(providerType)` in `lib/deployer.ts`.

## CLI Usage

Basic syntax:

```bash
deployer deploy ./path/to/component.yaml
deployer destroy ./path/to/component.yaml   # (Not implemented yet – will log error)
```

The entrypoint (`bin/index.ts`) parses positional args. Ensure your YAML path is the fourth element after Node + script – normal usage with the global binary handles this automatically.

### Global Installation

```bash
npm install -g deployer
```

### Local (Repo) Execution

```bash
npm install
npm run build
node ./bin/index.js deploy ./examples/orders.yaml
```

## Quick Start

1. Install globally or clone the repo and build.
2. Create a component YAML (see examples above).
3. Run `deployer deploy your-component.yaml`.
4. Inspect logs for provider‑specific output.
5. Query the environment output service to see persisted outputs (internal tooling).

## Configuration & Outputs

Providers return `outputs` as an array: `[{ key: string, value: string }]`. After deployment, `lib/deployer.ts` iterates outputs and calls `environmentService.putComponentOutput(env, name, key, value)`.

Component output names are namespaced as: `<env>.<component>` on the remote service.

## Environment Output Service

Defined in `lib/service/environmentService.ts`. It POSTs JSON:

```json
{
  "componentName": "dev.orders-api",
  "outputName": "RestApiUrl",
  "value": "https://abc123.execute-api.us-east-1.amazonaws.com/dev"
}
```

Endpoint: `https://environments.daysmart.net/output`.
You must have network access and any required auth (currently unauthenticated request code – ensure this is safe or add authentication later).

## Programmatic API

You can instantiate and run a deployment directly in Node:

```ts
const Deployer = require("deployer/lib/deployer");
const deployer = new Deployer("deploy", "./components/orders.yaml");
await deployer.run();
```

### Contract

- Constructor args: `(command: string, filePath: string)`.
- `command`: currently `deploy` or `destroy` (destroy not yet implemented).
- `run()`: dispatches to `deploy()` or logs an error.
- Errors: Throws if provider name unsupported or underlying provider fails.

## Architecture

```
component.yaml ──▶ parseYaml ──▶ Deployer ──▶ Provider (strategy) ──▶ Deploy
																											│
																											└──▶ outputs array ──▶ environmentService POST
```

Key modules:

- `lib/deployer.ts`: Orchestrator & provider factory.
- `lib/providers/*`: Provider implementations.
- `lib/utils/parseYaml.ts`: YAML loader.
- `lib/service/environmentService.ts`: Output publishing.

## Development

Scripts (`package.json`):

- `npm run build` – compile TypeScript.
- `npm run watch` – incremental compilation.
- `npm test` – placeholder (Jest not yet added as a dependency; future enhancement).

Dependencies of note:

- `@aws-cdk/core`, `aws-cdk` for CDK deployments.
- `serverless` for Serverless Framework integration.
- `aws-sdk` for Lambda, CloudWatch Logs, CodeBuild interactions.
- `js-yaml` for YAML parsing.
- `json-refs` included (future: YAML `$ref` expansion).
- `minimist` for CLI arg parsing.

### Local Build

```bash
npm install
npm run build
```

### Provider Dev Tips

- CDK: ensure `constructPath` points at a built JS file (after `tsc`).
- Serverless: inputs are written to `.deployer/serverless.config.yaml`; merge logic could be extended.
- Dynamic Environment: requires the provisioning Lambda ARN hardcoded in `dsicollectionDynamicEnvironment.ts`. Update if ARN changes.
- Hardcoded: ideal for wiring outputs without deployment (e.g., referencing pre-existing resources).

## Troubleshooting & Edge Cases

| Issue                                | Cause                                                     | Mitigation                                       |
| ------------------------------------ | --------------------------------------------------------- | ------------------------------------------------ |
| `The provider X is not implemented!` | Misspelled provider name in YAML                          | Use one of the supported names.                  |
| No outputs published                 | Provider returned empty array (e.g., dynamic environment) | Confirm provider should emit outputs.            |
| CDK construct not found              | `constructName` missing or mismatch                       | Set `provider.config.constructName` explicitly.  |
| Serverless deploy picks wrong stage  | `env` value incorrect                                     | Verify `env` in YAML; maps to `-s` flag.         |
| AWS auth errors                      | Missing credentials                                       | Export `AWS_PROFILE` or env vars before running. |
| Hanging dynamic environment          | Long CodeBuild duration                                   | Watch logs; process polls every 60s.             |
| Jest tests fail to run               | Jest not installed                                        | Add `jest` & config or remove script.            |

### Potential Improvements

- Implement `destroy` logic for all providers.
- Add Jest + sample tests.
- Support `$ref` expansion for large templated YAMLs.
- Add authentication / headers for environment output service.
- Structured logging & log levels.
- TypeScript types for component schema and provider responses.

## Contributing

1. Fork repository.
2. Create feature branch: `git checkout -b feature/awesome`.
3. Implement changes + add/update docs.
4. Run build & (future) tests.
5. Open PR describing provider or feature additions.

Please maintain backward compatibility when possible and document breaking changes clearly.

## License

Apache License 2.0. See `LICENSE` file.

---

## Attribution & Notes

Internal tooling created by DaySmart. Use responsibly; review code before production usage.

If you have questions or suggestions, open an issue at the repository’s GitHub issues page.
