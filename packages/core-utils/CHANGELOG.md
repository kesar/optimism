# @eth-optimism/core-utils

## 0.3.2

### Patch Changes

- 6daa408: update hardhat versions so that solc is resolved correctly
- dee74ef: migrate batch submitter types to core-utils
- d64b66d: reformat error context for Sentry

## 0.3.1

### Patch Changes

- 5077441: - Use raw transaction in batch submitter -- incompatible with L2Geth v0.1.2.1
  - Pass through raw transaction in l2context

## 0.3.0

### Minor Changes

- 91460d9: add Metrics and use in base-service, rename DTL services to avoid spaces
- a0a7956: initialize Sentry and streams in Logger, remove Sentry from Batch Submitter

### Patch Changes

- 0497d7d: Re-organize event typings to core-utils

## 0.2.3

### Patch Changes

- 35b99b0: add Sentry to TypeScript services for error tracking

## 0.2.2

### Patch Changes

- 01eaf2c: added extra logs to base-service / dtl to improve observability

## 0.2.1

### Patch Changes

- 5362d38: adds build files which were not published before to npm

## 0.2.0

### Minor Changes

- 6cbc54d: allow injecting L2 transaction and block context via core-utils (this removes the need to import the now deprecated @eth-optimism/provider package)
