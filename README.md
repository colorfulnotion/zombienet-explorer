# ZombieNet Block Explorer

[ZombieNet](https://github.com/paritytech/zombienet) is a cli tool to easily spawn ephemeral Polkadot/Substrate networks and perform tests against them.
A single ZombieNet is set up with a single toml file (Example: [Astar](https://github.com/AstarNetwork/Astar/blob/master/third-party/zombienet/multi_parachains.toml)) and  relay chain (ie `polkadot`) and parachain binaries (eg `astar`, `moonbeam`, `acala`):

```
./zombienet-linux -p native spawn multi-parachains.toml
```
and completes with a set of working WS Endpoints, which can be put into [polkadot.js apps](https://polkadot.js.org/apps/).

ZombieNet Explorer indexes a ZombieNet using purely local setup (just Mysql, no external HTTP API calls).
It is based off [Polkaholic.io](https://polkaholic.io) which is a Multi-Chain Block Explorer for Polkadot/Kusama and their parachains which uses a Google Cloud backend.

## Set up

1. Set up mysql instance with Docker:
```
TODO
```

2. Using the above, set up the explorer using
```
node explorer.js -base-path /tmp/ multi-parachains.toml 
```

This will initialize all the mysql tables using the toml f 
* Block Explorer: http://localhost:3000/ will show you the ZombieNet explorer.  
* API: http://localhost:3001/ will show you the chains in JSON form.  For API documentation, check the [Polkaholic.io](https://docs.polkaholic.io)

You should then see the "chain" table populated with the relay chain (chainID = 0) and each paraID (e.g. chainID = 2000, 2007).

Key tables:
* `chain` - stores N records for N chains, with the state of the chain kept in a single record in the `chain` table
* `block${chainID}` - Each chain's blocks are stored in a `block${chainID}`
* `hash` - stores extrinsics, block hashes, XCM message hashs
* `xcmmessages` - stores key info about XCMmmessages 
* `xcmtransfers` - stores XCM transfers + remote executions

```
mysql> select * from chain where chainID = 0 \G
*************************** 1. row ***************************
                     chainID: 0
                          id: polkadot
                      prefix: 0
                   chainName: Polkadot
                  relayChain: polkadot
                  WSEndpoint: wss://rpc.polkadot.io
                 WSEndpoint2:
                 WSEndpoint3: NULL
...
               blocksCovered: 11092165
             blocksFinalized: 11092162
            lastCleanChainTS: NULL
               blocksCleaned: 9729723
                 displayName: Polkadot Relay Chain
             standardAccount: *25519
                    decimals: [10]
                     symbols: ["DOT"]
                     website: https://polkadot.network
                 coingeckoID: polkadot
```

The end setup for mysql:
```
mysql> show tables;
+--------------------------+
| Tables_in_defi           |
+--------------------------+
| account                  |
| address                  |
| addressTopN              |
| apikey                   |
| asset                    |
| assetInit                |
| assetholder0             |
| assetholder2000          |
| assetholder2007          |
| block0                   |
| block2000                |
| block2007                |
...
| blocklog                 |
| blockunfinalized         |
| bqlog                    |
| chain                    |
| chainEndpoint            |
| chainPalletStorage       |
| chainhostnameendpoint    |
| xcmlog                   |
| xcmmap                   |
| xcmmessages              |
| xcmmessagesrecent        |
| xcmtransfer              |
| xcmtransferdestcandidate |
+--------------------------+
```

Block numbers are keyed by 8 digit hex (instead of decimal) to support prefix scans by the indexer.

* The `subscribeStorage` events result in a call to fetch the block and turn it _manually_ into sidecar compatible form, resulting in cells in both the `block` and `trace` column family with a call to `processBlock` and `processTrace`.
* The `subscribeFinalizedHeads` events result in cells in only the `finalized` column family.  Multiple block candidates at a given height result in multiple columns, but when a block is finalized, other non-finalized candidates are deleted.

Here is the crawlBlocks process on chain 8 (karura), run _manually_ on one node:
```
# root@moonriver:~/go/src/github.com/colorfulnotion/polkaholic/substrate# ./crawlBlocks 2000
chain API connected 2000
2022-07-09 11:42:51        API/INIT: RPC methods not decorated: evm_blockLimits
You are connected to ACALA chain 2000 endpoint=... with types + rpc + signedExt
...
subscribeStorage Acala bn=1396814 0x0d5aaa4b68bce292eafe392b52870a13d0e3f416beb86b69b6d6c90185049c03: cbt read chain2000 prefix=0x0015504e
subscribeFinalizedHeads Acala 1396812 CHECK: cbt read chain2000 prefix=0x0015504c |   update chain set blocksFinalized = '1396812', lastFinalizedDT = Now() where chainID = '2000'
...
```

Here is a single block for chain 0, 2000, 2007:
```
The above log shows how to inspect with `cbt` on the command line.
In most cases there will be multiple cells for `finalized` due to multiple indexers, but any row with a `finalized` cell should have only one block/trace matching column.

The tip of each crawled chain is held in the `chain` table in the `blocksCovered` column.
```
mysql> select chainID, chainName, lastCrawlDT, blocksCovered from chain where crawling = 1;
+---------+---------------------+---------------------+---------------+
| chainID | chainName           | lastCrawlDT         | blocksCovered |
+---------+---------------------+---------------------+---------------+
|       0 | Polkadot            | 2022-07-09 18:55:00 |      11092883 |
...
```


## Contributing

### Contributing Guidelines

[Contribution Guidelines](CONTRIBUTING.md)

### Contributor Code of Conduct

[Code of Conduct](CODE_OF_CONDUCT.md)

## License

Polkaholic is [GPL 3.0 licensed](LICENSE).
