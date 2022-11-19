// Copyright 2022 Colorful Notion, Inc.
// This file is part of Polkaholic.

// Polkaholic is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// Polkaholic is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with Polkaholic.  If not, see <http://www.gnu.org/licenses/>.

// Indexes Substrate Chains with WSS and JSON RPC using Mysql    block${chainID})
//      blockNumber (primary key)
//      lastTraceDT -- updated on storage
//      blockDT   -- updated on finalized head
//      blockHash -- updated on finalized head

const ethTool = require("./ethTool");
const fs = require('fs');
const mysql = require("mysql2");
const Indexer = require("./indexer");
const paraTool = require("./paraTool");

module.exports = class Crawler extends Indexer {
    blocksCovered = 1;
    blocksFinalized = 1;

    constructor() {
        super("crawler")
    }

    async setupChainAndAPI(chainID, withSpecVersions = true, backfill = false) {
        let chain = await this.getChain(chainID, withSpecVersions);

        await this.setupAPI(chain, backfill);
        this.isRelayChain = paraTool.isRelayChain(chainID)
        this.relayChain = chain.relayChain;
        return (chain);
    }

    fetch_trace(traces, section, method) {
	for (const x of traces) {
	    if ( x.p == section && x.s == method ) {
		if ( x.pv ) {
		    return x.pv;
		}
	    }
	}
	return null;
    }

    async crawl_block(api, chainID, blockHash) {
	// fetch the raw block data
        const signedBlock = await api.rpc.chain.getBlock(blockHash);
	// fetch the event data
        let eventsRaw = await api.query.system.events.at(blockHash);
	// fetch the traces
        let traceBlock = await api.rpc.state.traceBlock(blockHash, "state", "", "Put");

	// add the section/method to the events
        let events = eventsRaw.map((e) => {
            let eh = e.event.toHuman();
            let ej = e.event.toJSON();
            let out = JSON.parse(JSON.stringify(e));
            let data = out.event.data;
            out.event = {};
            out.event.data = data;
            out.event.method = {};
            out.event.method['pallet'] = eh.section;
            out.event.method['method'] = eh.method;
            return out
        });

	// extract the time stamp, blockNumber from the extrinsics
        let block = signedBlock.block;
        let header = block.header;
        let blockNumber = header.number;
        let isSet = false;
        for (let i = 0; i < block.extrinsics.length; i++) {
            let ex = block.extrinsics[i];
            let exj = ex.method.toJSON();
            let exh = ex.method.toHuman()
            if (exh.method == "set" && exh.section == 'timestamp' && (!isSet)) {
                block.blockTS = Math.round((exj.args.now) / 1000);
                isSet = true;
            }
        }
	//TODO: await this.initApiAtStorageKeys(blockHash, blockNumber);

	// process the key-value pairs from the traces
	let traces = [];
        if (traceBlock) {
            let traceBlockJSON = traceBlock.toJSON();
            if (traceBlockJSON && traceBlockJSON.blockTrace) {
                let rawTraces = traceBlockJSON.blockTrace.events.map((e) => {
                    let sv = e.data.stringValues
                    let v = (sv.value == 'None') ? sv.value_encoded : sv.value.replaceAll("Some(", "").replaceAll(")", "");
                    return ({
                        k: sv.key,
                        v: v
                    })
                });
		traces = rawTraces;
            } else {
                console.log("trace block FAILURE", blockHash, traceBlock, chainID, paraID)
            }
        }

	return [block, events, traces];
    }

    async crawlBlock(api, chainID, blockHash, finalized) {
        // do RPC calls to fetch block. events, trace data, with block.blockTS coming from set.timestamp;  NOTE: block does not have block.{number, hash} initialized
	let [signedBlock, events, trace] = await this.crawl_block(api, chainID, blockHash);
	let blockraw = JSON.parse(JSON.stringify(signedBlock));
        let blockTS = signedBlock.blockTS;

        // deep copy, initialized with number, hash and blockTS
        let block = JSON.parse(JSON.stringify(signedBlock));
        block.number = paraTool.dechexToInt(block.header.number);
        block.hash = blockHash;
        block.blockTS = blockTS;

        let blockNumber = block.number;
        let parentHash = block.header.parentHash;
	let chain = await this.getChain(chainID);

	if ( chain.features && chain.features.includes("evm") ) {
	    await this.getWeb3Api(chain);
	}

        let signedExtrinsicBlock = block
        signedExtrinsicBlock.extrinsics = signedBlock.extrinsics //add signed extrinsics
        // block object lacks "hash+blockTS" attribute, so we EXPLICITLY add them here
        var runtimeVersion = await api.rpc.state.getRuntimeVersion(blockHash)
        let specVersion = runtimeVersion.toJSON().specVersion;
	if (this.metadata[specVersion] == undefined) {
            await this.getSpecVersionMetadata(chain, specVersion, blockHash, blockNumber);
        }

	// augment traces with "pk" (parse of k as StorageKey) + "pv" (parse of v)
        let autoTraces = await this.processTraceAsAuto(blockTS, blockNumber, blockHash, this.chainID, trace, "subscribeStorage", this.api);
	if ( autoTraces ) trace = autoTraces;
	// extrace evm block, receipts from traces
	let evmBlock = this.fetch_trace(autoTraces, "Ethereum", "CurrentBlock");
	let evmReceipts = this.fetch_trace(autoTraces, "Ethereum", "CurrentReceipts");
	if ( evmBlock ) evmBlock = JSON.parse(evmBlock);
	if ( evmReceipts ) evmReceipts = JSON.parse(evmReceipts);
	let evmBlockhash = this.fetch_trace(autoTraces, "Ethereum", "BlockHash");
	let evmTrace = null;

        let blockStats = await this.processBlockEvents(chainID, signedExtrinsicBlock, events, evmBlock, evmReceipts, evmTrace, autoTraces);
        //let r = await this.index_chain_block_row(b, false, false, false, true); // signedBlock is false, write_bq_log = false, isTip = TRUE

        let numExtrinsics = blockStats && blockStats.numExtrinsics ? blockStats.numExtrinsics : 0
        let numSignedExtrinsics = blockStats && blockStats.numSignedExtrinsics ? blockStats.numSignedExtrinsics : 0
        let numTransfers = blockStats && blockStats.numTransfers ? blockStats.numTransfers : 0
        let numEvents = blockStats && blockStats.numEvents ? blockStats.numEvents : 0
        let fees = blockStats && blockStats.fees ? blockStats.fees : 0

	// store unfinalized block data in a single "blockunfinalized" table shared across chains, and finalized block data in dedicated "block${chainID}" table
	let tbl = finalized ? `block${chainID}` : "blockunfinalized";
	let out = [];
	let keys = [];
	let vals = [];
	if ( finalized ) {
	    // blockNumber is key, but blockHash is value
	    keys.push("blockNumber");
	    vals.push("blockHash");
	    out.push(`'${blockNumber}'`, `'${blockHash}'`)
	} else {
	    // chainID/blockNumber/blockHash is key
	    keys.push("chainID", "blockNumber", "blockHash");
	    out.push(`'${chainID}'`, `'${blockNumber}'`, `'${blockHash}'`)
	}
	vals.push("parentHash", "blockDT", "numExtrinsics", "numSignedExtrinsics", "numTransfers", "numEvents", "fees", "lastTraceDT");
	out.push(`'${parentHash}'`, `FROM_UNIXTIME(${blockTS})`, `'${numExtrinsics}'`, `'${numSignedExtrinsics}'`, `'${numTransfers}'`, `'${numEvents}'`, `'${fees}'`, `FROM_UNIXTIME('${blockTS}')`);

	vals.push("blockraw", "feed", "events", "trace");
	out.push(`${mysql.escape(JSON.stringify(blockraw))}`, `${mysql.escape(JSON.stringify(block))}`, `${mysql.escape(JSON.stringify(events))}`, `${mysql.escape(JSON.stringify(trace))}`);

	// evm block processing
	if ( evmBlock ) {
	    let h = evmBlock.header;
            let numTransactionsEVM = blockStats.numTransactionsEVM ? blockStats.numTransactionsEVM : 0;
            let numTransactionsInternalEVM = blockStats.numTransactionsInternalEVM ? blockStats.numTransactionsInternalEVM : 0;
            let numReceiptsEVM = blockStats.numReceiptsEVM ? blockStats.numReceiptsEVM : 0;
            let parentHashEVM = evmBlock.header.parentHash;
            let gasUsed = parseInt(evmBlock.header.gasUsed, 10); // TODO: treat little endian
            let gasLimit = parseInt(evmBlock.header.gasLimit, 10);// TODO: treat little endian

	    vals.push("evmBlock", "evmReceipts");
	    out.push(`${mysql.escape(JSON.stringify(evmBlock))}`, `${mysql.escape(JSON.stringify(evmReceipts))}`);

            vals.push("blockHashEVM", "parentHashEVM", "numTransactionsEVM", "numTransactionsInternalEVM", "numReceiptsEVM", "gasUsed", "gasLimit");
            out.push(`'${evmBlockhash}'`, `'${parentHashEVM}'`, `'${numTransactionsEVM}'`, `'${numTransactionsInternalEVM}'`, `'${numReceiptsEVM}'`, `'${gasUsed}'`, `'${gasLimit}'`);
	    console.log("write", chainID, blockNumber, evmBlockhash, parentHashEVM);
	}

        await this.upsertSQL({
	    "table": tbl,
	    "keys": keys,
	    "vals": vals,
	    "data": ["(" + out.join(",") + ")"],
	    "replace": vals
        });

	//await this.flush(blockTS, blockNumber, false, isTip); //ts, bn, isFullPeriod, isTip
	if ( finalized ) {
            var sql = `update chain set blocksFinalized = '${blockNumber}', lastFinalizedDT =  Now() where chainID = '${chainID}' and blocksFinalized < ${blockNumber}`
            this.batchedSQL.push(sql);
	    let sql4 = `delete from blockunfinalized where chainID = '${chainID}' and blockNumber < '${blockNumber}'`
            this.batchedSQL.push(sql4);
	} else {

	    if (blockNumber > this.blocksCovered) {  // only update blocksCovered in the DB if its HIGHER than what we have seen before
		var sql = `update chain set blocksCovered = '${blockNumber}', lastCrawlDT = Now() where chainID = '${chainID}' and blocksCovered < ${blockNumber}`
		this.batchedSQL.push(sql);
		this.blocksCovered = blockNumber;
		await this.update_batchedSQL();
	    }
	}
    }

    async crawlBlocks(chainID) {
        let chain = await this.setupChainAndAPI(chainID);
	this.apiAt = this.api;
        await this.setup_chainParser(chain, paraTool.debugNoLog, true);
        const unsubscribeFinalizedHeads = await this.api.rpc.chain.subscribeFinalizedHeads(async (header) => {
            let bn = parseInt(header.number.toString(), 10);
            let finalizedHash = header.hash.toString();
            //let parentHash = header.parentHash.toString();
	    await this.crawlBlock(this.api, chainID, finalizedHash, true);

        });

        let unsubscribeRuntimeVersion = await this.api.rpc.state.subscribeRuntimeVersion(async (results) => {
            var runtimeVersion = await this.api.rpc.state.getRuntimeVersion()
            let specVersion = runtimeVersion.toJSON().specVersion;
            // this will refresh the metadata and get new storage keys for the most recent spec
            await this.getSpecVersionMetadata(chain, specVersion, false, 0);
        });

        // subscribeStorage returns changes from ALL blockHashes, including the ones that do not get finalized
        let unsubscribeStorage = null
        try {
            unsubscribeStorage = await this.api.rpc.state.subscribeStorage(async (results) => {
                try {
                    let blockHash = results.block.toHex();
                    await this.crawlBlock(this.api, chainID, blockHash, false);
		} catch (e) {
		    console.log(e);
		}
	    });
        } catch (errus) {
            console.log(errus);
            unsubscribeStorage = false
        }

        return [unsubscribeFinalizedHeads, unsubscribeStorage, unsubscribeRuntimeVersion];
    }

}
