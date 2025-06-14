# Coffee Dex
[![TON](https://img.shields.io/badge/based%20on-TON-blue)](https://ton.org/)
[![License](https://img.shields.io/badge/license-BUSL--1.1-brightgreen)](./LICENSE)
[![Security Audit](https://img.shields.io/badge/audited%20by-Trail%20of%20Bits-red?logo=2fas&logoColor=white)](https://github.com/trailofbits/publications/blob/master/reviews/2025-05-swap-coffee-ton-dex-securityreview.pdf)

**Coffee DEX** is an open-source most powerful and extensible decentralized exchange **TON**-native protocol
on the TON blockchain. We truly believe that it signifies new era of both user exchanges and market evolution overall,
as it aims at not only providing the smoothest user experience by securing them in all possible ways,
negotiating gas consumption, allowing multi-hop and multi-dex swaps, as well as supporting unlimited AMM strategies
variations for a single pair of assets, but it is also built for developers and businesses.

## Licensing

The Licensed Work is provided under the terms of the Business Source License, version 1.1 (“BUSL”), as published by
MariaDB Corporation Ab.

In short, any non-commercial use is permitted as long as credit is given. More precisely, you are free to copy, modify,
create derivative works, redistribute, make non-production use of the Licensed Work or perform any other non-commercial
activities related to development & testing.

If you're looking for commercial usage (ex. launching your own DEX based on Coffee DEX's contracts) or have any
questions regarding product's license, please contact us via Telegram [@swap.coffee DEV Chat](https://t.me/swapcoffee_dev_chat).

## Notable mainnet addresses

- `EQAsf2sDPfoo-0IjnRA7l_gJBB9jyo4zqfCG_1IFCCI_Qbef` is a factory.
- `EQDbLqT_zhxpERj0EnXG2iqr1g71ODb_Xoc74R8RzUSElKGD` is a TON vault.
- `UQCz79ULW8EogUnE-8vw2AmqYAQbAX3PcdlHV_VQ75zkKmcA` is a multisig administrative wallet.
- `UQBQwb1rPdTP0DtL6FgW2ilaeoPsXuUEb1dPD4ynq2WT_DEX` is a wallet for protocol & referral fees withdrawals.

## Project structure

-   `contracts` - source code of all the smart contracts of the project and their dependencies.
-   `wrappers` - wrapper classes (implementing `Contract` from ton-core) for the contracts, including any [de]serialization primitives and compilation functions.
-   `tests` - tests for the contracts.
-   `scripts` - scripts used by the project, mainly the deployment scripts.

Detailed documentation with a description of the architecture, illustrations of user flows, TL-B schemes explanations
and lots of other useful information is available at the [link](https://docs.swap.coffee/technical-guides/dex).

## How to use

### Build

`npx blueprint build` or `yarn blueprint build`

### Test

`npx blueprint test` or `yarn blueprint test`

### Deploy or run another script

`npx blueprint run` or `yarn blueprint run`
