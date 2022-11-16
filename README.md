# ZombieNet Block Explorer

[ZombieNet](https://github.com/paritytech/zombienet) is a cli tool to easily spawn ephemeral Polkadot/Substrate networks and perform tests against them.  A single ZombieNet is set up with a single toml file and parachain binaries (eg `astar-collator`, `moonbeam`, `acala`, etc.).

__ZombieNet Explorer__ indexes a ZombieNet using purely local setup (just
Mysql, no external HTTP API calls unless you use a non-standard flag).  It is based off
[Polkaholic.io](https://polkaholic.io) which is a Multi-Chain Block
Explorer for Polkadot/Kusama and their parachains which uses a Google
Cloud backend, and is useful to cover some aspects that are not well-covered by the amazing polkadot.js.
* linking and visualizing different XCM messages / extrinsic
* EVM + WASM support
* Simple Mysql analytics 

## Set up

1. Set up mysql instance with Docker and set up ZombieNet explorer tables:
```
# docker-compose up -d
# docker ps -a
# mysql -P 9093 --protocol=tcp -u root -pzombienet zombienet
```
If you have sensitive information in your ZombieNet tests (!), adjust to support your needed security.  

2. Run your ZombieNet

Shibuya/Shiden/Astar Example: [source](https://github.com/AstarNetwork/Astar/blob/master/third-party/zombienet/multi_parachains.toml)
```
./zombienet-linux -p native spawn shibuya.toml
```

Moonbase/Moonriver/Moonbeam Example:
```
./zombienet-linux -p native spawn moonbase.toml
```

Your spawned ZombieNet will contain a /tmp directory with a "zombie.json" file:
```
/tmp/zombie-3a4c7ea3d3b21c7e47dd8c5ebcb9ff01_-3252492-sI20bG2wx83f/zombie.json
```

3. After your ZombieNet has spawned, set up the explorer supplying the TOML file and the zombie.json 

```
node explorer.js shibuya.toml /tmp/zombie-3a4c7ea3d3b21c7e47dd8c5ebcb9ff01_-3252492-sI20bG2wx83f/zombie.json
```

This will use the toml configuration and zombie.json file to initialize any necessary mysql tables and launch a few key processes:

1. ZombieNet Block Explorer: http://localhost:3000/ will show you the ZombieNet explorer!
2. ZombieNet API: http://localhost:3001/ will show you the chains in JSON form.  For API documentation, check the [Polkaholic.io API](https://docs.polkaholic.io)
3. Crawlers for each of the chains -- 1 for the the relay chain and 1 for each parachain

Data flow is from the crawlers into Mysql, with the block explorer and API reading data out of Mysql.

You can inspect many of the tables with the following, some of which we highlight below:
```
# mysql -P 9093 --protocol=tcp -u root -pzombinet zombinet
mysql> show tables;
+--------------------------+
| Tables_in_defi           |
+--------------------------+
| account                  |
| address                  |
| asset                    |
| assetholder0             |
| assetholder2000          |
| assetholder2007          |
| block0                   |
| block2000                |
| block2007                |
...
| blockunfinalized         |
| chain                    |
+--------------------------+
```

Key tables:
* `chain` - stores N records for N chains, with the state of the chain kept in a single record in the `chain` table
* `block${chainID}` - Each chain's blocks are stored in a `block${chainID}`
* `hash` - stores extrinsics, block hashes, XCM message hashs
* `xcmmessages` - stores key info about XCMmmessages 
* `xcmtransfers` - stores XCM transfers + remote executions

This project is entirely in node.js so there is no tower of classes, React Components to figure out.  We hope that this makes it easy to figure out how things work and twe
ak things so you can make your chain interoperate with others better and faster.

## XCM Support

You will see XCM Messages + transfers added to these tables

```
xcmmessages              
xcmtransfer              
xcmtransferdestcandidate 
```

## EVM Support

If you are dealing with an EVM chain, you may wish to bring in your own ABIs, which leads to better decoded results.

```
contractabi
```

## WASM Support

Polkadot is heavily invested in making WASM a key component of substrate.  If you are dealing with a WASM ctain, you will see these indexed in the following tables:

```
contract
contractCode
```

# Shutdown

After shutting down ZombieNet, you can shut down your mysql instance with:
```
# docker-compose down
```

# Differences between ZombieNet Explorer with Polkaholic.io

ZombieNet is about ephemeral networks that will live for a few hours
or a few days at most, whereas Polkaholic.io attempts to index
multiple years from block 1.

The backend of just using mysql for ZombieNet Explorer is sufficient,
whereas with Polkaholic.io uses a lot of BigTable / BigQuery
components in addition, with a lot of additional jobs to fetch missing
data, aggregate data.  Many views have been suppressed.

## Contributing

### Contributing Guidelines

[Contribution Guidelines](CONTRIBUTING.md)

### Contributor Code of Conduct

[Code of Conduct](CODE_OF_CONDUCT.md)

## License

Polkaholic is [GPL 3.0 licensed](LICENSE).
