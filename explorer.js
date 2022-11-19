#!/usr/bin/env node
// Usage: node explorer.js tomlFN zombieNetPath
var toml = require('toml');
var fs = require('fs');
var Crawler = require('./substrate/crawler.js');
var ExplorerDB = require('./substrate/explorerDB.js');

class ZombieNetExplorer extends ExplorerDB {
    crawlers = {};
    
    async setup_relaychain(chainID, chainName, id, relay) {
	let node = relay[0];
	let WSEndpoint = node.wsUri;
	let RPCEndpoint = "";
	let sql = `insert into chain (chainID, chainName, id, WSEndpoint, evmRPC ) values ( '${chainID}', '${chainName}', '${id}', '${WSEndpoint}', '${RPCEndpoint}') on duplicate key update WSEndpoint = values(WSEndpoint), blocksFinalized = 1, blocksCovered = 1`
	this.batchedSQL.push(sql)
	await this.update_batchedSQL();

	// KEY OPERATION: crawls relaychain given WSEndpoint has been inserted above
	this.crawlers[chainID] = new Crawler();
	return this.crawlers[chainID];
    }

    async setup_parachain(paraID, chainName, id, rpc_port, para, features) {
	let nodes = para.nodes;
	let node = nodes[0]; // pick first node
	let chainID = paraID;
	let WSEndpoint = node.wsUri;
	let RPCEndpoint = rpc_port ? `http://127.0.0.1:${rpc_port}` : "";
	let sql = `insert into chain (chainID, chainName, id, WSEndpoint, evmRPC, features ) values ( '${paraID}', '${chainName}', '${id}', '${WSEndpoint}', '${RPCEndpoint}', '${features}') on duplicate key update WSEndpoint = values(WSEndpoint), features = values(features), blocksFinalized = 1, blocksCovered = 1`
	this.batchedSQL.push(sql)
	this.batchedSQL.push(`create table if not exists block${paraID} like block0`);
	this.batchedSQL.push(`create table if not exists assetholder${paraID} like assetholder0`);
	await this.update_batchedSQL();

	// KEY OPERATION: crawls parachain given WSEndpoint has been inserted above
	this.crawlers[chainID] = new Crawler()
	return this.crawlers[chainID];
    }

    async run(tomlFN, zombieFN) {
	try {
	    let tomlString = await fs.readFileSync(tomlFN, "utf8");
	    let zombieString = await fs.readFileSync(zombieFN, "utf8");
	    console.log("toml file:", tomlFN, "ZombieNet file:", zombieFN);
	    var zombie = JSON.parse(zombieString);
	    var TOML = toml.parse(tomlString);
	    await this.setup_relaychain(0, TOML.relaychain.chain, TOML.relaychain.chain, zombie.relay);
	    for ( const p of TOML.parachains ) {
		let paraID = p.id;
		let chainName = p.chain;
		let collator = p.collators[0];
		let name = collator.name;
		let rpc_port = collator.rpc_port;
		let features = p.features ? p.features : [];
		console.log(features, zombie.paras[paraID]);
		await this.setup_parachain(paraID, chainName, name, rpc_port, zombie.paras[paraID], features);
	    }

	    for (const chainID of Object.keys(this.crawlers)) {
		// initialize all crawlers
		await this.crawlers[chainID].assetManagerInit();
		this.crawlers[chainID].crawlBlocks(chainID);
	    }
	} catch (e) {
	    console.log(e);
	    console.log("Parsing error on line " + e.line + ", column " + e.column + ": " + e.message);
	}
    }
}

async function main() {
    let explorer = new ZombieNetExplorer();
    let tomlFN = "moonbase.toml";
    let zombieNetPath = "/tmp/zombie-eedcfcda5fe9e14b2fbbbae66d251468_-980778-QXkuEUhaJf4j/zombie.json"
    process.argv.forEach(function(val, index, array) {
        if (index == 2 && val.length > 0) {
            tomlFN = val;
        }
        if (index == 3 && val.length > 0) {
            zombieNetPath = val;
        }
    });

    await explorer.run(tomlFN, zombieNetPath);
}

main()
    .then(() => {
	
    })
    .catch((e) => {
        console.error('ERROR', e);
        process.exit(1);
    });
