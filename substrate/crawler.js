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

// Indexes Substrate Chains with WSS and JSON RPC using
//  BigTable chain${chainID}
//   row.id is the HEX of the blockNumber
//   columns: (all cells with timestamp of the block)
//      blockraw:raw/blockHash -- block object holding extrinsics + events
//      trace:raw/blockHash -- array of k/v, deduped
//      finalized:blockHash
//  Mysql    block${chainID})
//      blockNumber (primary key)
//      lastTraceDT -- updated on storage
//      blockDT   -- updated on finalized head
//      blockHash -- updated on finalized head
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const ethTool = require("./ethTool");

const fs = require('fs');
const {
    bnToHex,
    hexToBn,
    hexToU8a,
    isHex,
    stringToU8a,
    u8aToHex,
    hexToString
} = require("@polkadot/util");
const {
    xxhashAsHex,
    blake2AsHex,
    blake2AsU8a
} = require('@polkadot/util-crypto');
const {
    XXHash32,
    XXHash64,
    XXHash3,
    XXHash128
} = require('xxhash-addon');
const {
    Keyring,
    decodeAddress,
    encodeAddress
} = require("@polkadot/keyring");
const {
    StorageKey
} = require('@polkadot/types');


const mysql = require("mysql2");
const Indexer = require("./indexer");
const paraTool = require("./paraTool");

const maxTraceAttempts = 10;
const minCrawlTracesToActivateRPCBackfill = 1;

module.exports = class Crawler extends Indexer {
    latestBlockNumber = 0;
    finalizedHashes = {};
    lastmarkedTS = 0;
    lastmarkedlogDT = '2019-01-01';
    coveredtx = {};

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


    async crawlEvmTrace(chain, blockNumber, timeoutMS = 20000) {
        if (!chain.RPCBackfill) {
            return (false);
        }
        if (chain.RPCBackfill.length == 0) {
            return (false);
        }
        let hexBlocknumber = paraTool.blockNumberToHex(blockNumber);
        let cmd = `curl ${chain.evmRPCInternal}  -X POST -H "Content-Type: application/json" --data '{"method":"debug_traceBlockByNumber","params":["${hexBlocknumber}", {"tracer": "callTracer"}],"id":1,"jsonrpc":"2.0"}'`
        try {
            const {
                stdout,
                stderr
            } = await exec(cmd, {
                maxBuffer: 1024 * 64000
            });
            let traceData = JSON.parse(stdout);
            if (traceData.result) {
                console.log(blockNumber, traceData.result.length, cmd);
                return (traceData.result);
            }
            //console.log(cmd);
            return (null);
        } catch (error) {
            this.logger.warn({
                "op": "crawlEvmTrace",
                "cmd": cmd,
                "err": error
            })
            console.log(error);
        }
        return false;
    }


    // save_block_trace stores block+events+trace, and is called
    //  (a) called by crawlBackfill/crawl_block (finalized = true)
    //  (b) subscribeStorage for CANDIDATE blocks (finalized = false)
    // it is NOT called by subscribeFinalizedHeads
    async save_block_trace(chainID, block, blockHash, events, trace, finalized = false, traceType = false, evmBlock = false, evmReceipts = false) {
        let blockTS = block.blockTS;
        let bn = parseInt(block.header.number, 10);
        let parentHash = block.header.parentHash;
        if (bn == 0) {
            blockTS = 0
        }
        // block object lacks "hash+blockTS" attribute, so we EXPLICITLY add them here
        block = JSON.parse(JSON.stringify(block));
        block.number = bn; // decoration
        block.blockTS = blockTS; // decoration
	let evmBlockHash = ""
        block.hash = blockHash; // decoration
        // flush out the mysql
	let out = [`('${chainID}', '${bn}', '${blockHash}', FROM_UNIXTIME(${blockTS}), Now(), ${mysql.escape(JSON.stringify(block))}, ${mysql.escape(JSON.stringify(events))}, ${mysql.escape(JSON.stringify(trace))}, ${mysql.escape(evmBlockHash)}, ${mysql.escape(JSON.stringify(evmBlock))}, ${mysql.escape(JSON.stringify(evmReceipts))})`]
	let vals = ["blockDT", "lastTraceDT", "feed", "events", "trace", "evmBlockHash", "evmBlock", "evmReceipts"];
        await this.upsertSQL({
            "table": "blockunfinalized",
            "keys": ["chainID", "blockNumber", "blockHash"],
            "vals": vals,
            "data": out,
            "replace": vals
        });

        try {
            const tableChain = this.getTableChain(chainID);
            var sql = false;
            let eflds = "";
            let evals = "";
            let eupds = "";
            if (evmReceipts) {
                let numReceiptsEVM = ethTool.computeNumEvmlogs(evmReceipts);
                eflds = ", numReceiptsEVM";
                evals = `, '${numReceiptsEVM}'`;
                eupds = ", numReceiptsEVM = values(numReceiptsEVM)";
            } else if (evmBlock) {
                eflds = ", blockHashEVM, parentHashEVM, numTransactionsEVM, numTransactionsInternalEVM, gasUsed, gasLimit";
                evals = `, '${evmBlock.hash}', '${evmBlock.parentHash}', '${evmBlock.transactions.length}', '${evmBlock.transactionsInternal.length}', '${evmBlock.gasUsed}', '${evmBlock.gasLimit}'`;
                eupds = ", blockHashEVM = values(blockHashEVM), parentHashEVM = values(parentHashEVM), numTransactionsEVM = values(numTransactionsEVM), numTransactionsInternalEVM = values(numTransactionsInternalEVM), gasUsed = values(gasUsed), gasLimit = values(gasLimit)";
            }
            if (trace && finalized) {
                sql = `insert into block${chainID} (blockNumber, blockHash, parentHash, blockDT, crawlBlock, crawlTrace, lastTraceDT ${eflds} ) values (${bn}, '${blockHash}', '${parentHash}', FROM_UNIXTIME(${blockTS}), 0, 0, Now()  ${evals} ) on duplicate key update lastTraceDT = values(lastTraceDT), blockHash = values(blockHash), parentHash = values(parentHash), crawlBlock = values(crawlBlock), crawlTrace = values(crawlTrace), blockDT = values(blockDT) ${eupds} ;`;
            } else if (trace) {
                sql = `insert into block${chainID} (blockNumber, lastTraceDT) values (${bn}, Now()) on duplicate key update lastTraceDT = values(lastTraceDT)`
            } else if (finalized) {
                //check here
                sql = `insert into block${chainID} (blockNumber, blockHash, parentHash, crawlBlock, blockDT ${eflds} ) values (${bn}, '${blockHash}', '${parentHash}', 0, FROM_UNIXTIME(${blockTS})  ${evals} ) on duplicate key update blockHash = values(blockHash), parentHash = values(parentHash), crawlBlock = values(crawlBlock), blockDT = values(blockDT) ${eupds};`;
            }
            if (sql) {
                this.batchedSQL.push(sql);
                await this.update_batchedSQL();
            }
            return (true);
        } catch (err) {
            this.logger.warn({
                "op": "save_block_trace",
                chainID,
                bn,
                err
            })
            return (false);
        }
    }

    async save_evm_block(chainID, bn, blockhash, evmBlock = false, evmReceipts = false, evmTrace = false) {
        //todo: store evmBlock
        let cres = {
            key: paraTool.blockNumberToHex(bn),
            data: {}
        };
        let save = false;
        if (evmBlock) {
            try {
            let evmBlockTS = evmBlock.timestamp;
            let evmBlockhash = evmBlock.blockhash;
            save = true;
	    // TODO
	    /*
              value: JSON.stringify(evmBlock),
              value: JSON.stringify(evmReceipts),
              value: JSON.stringify(evmTrace),
	    */
                const tableChain = this.getTableChain(chainID);
            } catch (err) {
                this.logger.warn({
                    "op": "save_evm_block",
                    chainID,
                    bn,
                    err
                })
                return (false);
            }
        }
    }

    async save_trace_evm(chainID, t, trace, traceEVMType = "debug_traceBlockByHash") {
        if (!trace) return (false);
        let bn = parseInt(t.blockNumber, 10);
        let blockTS = parseInt(t.blockTS, 10);
        let blockHash = t.blockHash;
        let cres = {
            key: paraTool.blockNumberToHex(bn),
            data: {
                traceevm: {},
                n: {}
            }
        };

        // flush out the mysql + BT updates
        try {
            const tableChain = this.getTableChain(chainID);
	    /*
            value: JSON.stringify(trace),
            value: traceEVMType,
*/
            return (true);
        } catch (err) {
            this.logger.warn({
                "op": "save_trace_evm",
                chainID,
                bn,
                err
            })
            console.log(err);
            return (false);
        }
    }


    
    async dump_update_block(chain, auditRows) {
        let chainID = chain.chainID;
        if (auditRows.length == 0) return;

        let eflds = (chain.isEVM > 0) ? ", crawlBlockEVM, crawlReceiptsEVM, crawlTraceEVM" : "";
        let efldsu = (chain.isEVM > 0) ? ", crawlBlockEVM = values(crawlBlockEVM), crawlReceiptsEVM = values(crawlReceiptsEVM), crawlTraceEVM = values(crawlTraceEVM)" : "";

        let i = 0;
        for (i = 0; i < auditRows.length; i += 10000) {
            let j = i + 10000;
            if (j > auditRows.length) j = auditRows.length;
            let sql = `insert into block${chainID} (blockNumber, blockHash, parentHash, blockDT, crawlBlock, crawlTrace ${eflds}) values ` + auditRows.slice(i, j).join(",") + ` on duplicate key update crawlBlock = values(crawlBlock), crawlTrace = values(crawlTrace), blockHash = values(blockHash), parentHash = values(parentHash), blockDT = values(blockDT) ${efldsu}`;
            this.batchedSQL.push(sql)
        }
        auditRows = [];
        await this.update_batchedSQL()
    }


    async dedupChanges(changes) {
        let dedupEvents = {};
        for (const r of changes) {
            let k = r[0].toHex();
            let v = r[1].toHex();
            if (v.length == 2) {
                v = null;
            }
            dedupEvents[k] = {
                k,
                v
            };
        }

        let trace = [];
        for (const k of Object.keys(dedupEvents)) {
            trace.push(dedupEvents[k]);
        }
        return (trace);
    }

    markFinalizedReadyForIndexing(chainID, blockTS) {
        let indexTS = (Math.floor(blockTS / 3600)) * 3600;
        let prevTS = (Math.floor(blockTS / 3600) - 1) * 3600;
        if (!this.readyForIndexing[prevTS]) {
            this.readyForIndexing[prevTS] = 1;
            let [logDT, hr] = paraTool.ts_to_logDT_hr(prevTS);
            var sql = `insert into indexlog (chainID, indexTS, logDT, hr, readyForIndexing) values ('${chainID}', '${prevTS}', '${logDT}', '${hr}', 1) on duplicate key update readyForIndexing = values(readyForIndexing);`;
            this.batchedSQL.push(sql);
            return (true);
        }
        return (false);
    }

    async crawlBlock(api, blockHash) {
        const signedBlock = await api.rpc.chain.getBlock(blockHash);
        let eventsRaw = await api.query.system.events.at(blockHash);
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
        // NOTE: does not have block.{number, hash} set
        return [block, events];
    }

    async crawlPendingExtrinsics(chain, crawler) {
        if (crawler.latestBlockNumber > 0) {
            let pendingTXs = await crawler.api.rpc.author.pendingExtrinsics()
            await crawler.processPendingTransactions(pendingTXs, crawler.latestBlockNumber)
        }
    }

    async crawlTxpoolContent(chain, crawler) {
        if (crawler.latestBlockNumber > 0) {
            let cmd = `curl ${chain.RPCBackfill}  -X POST -H "Content-Type: application/json" --data '{"method":"txpool_content","params":[],"id":1,"jsonrpc":"2.0"}'`
            const {
                stdout,
                stderr
            } = await exec(cmd, {
                maxBuffer: 1024 * 64000
            });
            let txs = [];
            let content = JSON.parse(stdout);
            if (content && content.result && content.result.pending) {
                let pending = content.result.pending;
                let ts = crawler.getCurrentTS();
                for (const addr of Object.keys(pending)) {
                    for (const nonce of Object.keys(pending[addr])) {
                        let tx = pending[addr][nonce];
                        // make sure we don't repeat this
                        let transactionHash = tx.hash
                        if (transactionHash && (crawler.coveredtx[transactionHash] == undefined)) {
                            txs.push(tx);
                            crawler.coveredtx[tx.hash] = ts;
                        }
                    }
                }
                if (txs.length) {
                    txs = await ethTool.processTranssctions(txs, crawler.contractABIs, crawler.contractABISignatures);
                    for (let i = 0; i < txs.length; i++) {
                        let tx = txs[i];
                        tx.blockHash = ""; // if ( tx.blockHash != undefined) delete tx.blockHash;
                        tx.blockNumber = 0; // if ( tx.blockNumber != undefined ) delete tx.blockNumber;
                        tx.transactionIndex = -1; // if ( tx.transactionIndex != undefined) delete tx.transactionIndex;
                        tx.chainID = chain.chainID;
                        tx.timestamp = ts;
                    }
                    await crawler.processPendingEVMTransactions(txs);
                } else if (ts % 60 == 0) {

                    for (const txhash of Object.keys(crawler.coveredtx)) {
                        if (crawler.coveredtx[txhash] < ts - 60) {
                            delete crawler.coveredtx[txhash];
                        }
                    }
                }
            }
        }
    }

    async crawl_parachains(chainID = 2) {
        let allEndPoints = Endpoints.getAllEndpoints();
        console.log(`allEndPoints len=${Object.keys(allEndPoints).length}`, allEndPoints)

        let knownParachains = await this.getKnownParachains()
        console.log(`knownParachains len=${Object.keys(knownParachains).length}`, knownParachains)

        let chain = await this.setupChainAndAPI(chainID);
        let relaychain = (chainID == paraTool.chainIDPolkadot) ? 'polkadot' : 'kusama'
        var allParaIds = (await this.api.query.paras.paraLifecycles.entries()).map(([key, _]) => key.args[0].toJSON());
        var allParaTypes = (await this.api.query.paras.paraLifecycles.entries()).map(([_, v]) => v.toString()); //Parathread/Parachain

        let newParas = []
        let paraIDs = [];
        this.paraIDs = [];

        for (let x = 0; x < allParaIds.length; x++) {
            let paraID = allParaIds[x]
            let paraType = allParaTypes[x]
            let fullparaID = `${relaychain}-${paraID}`
            let targetEndpoint = allEndPoints[fullparaID]
            let para_name = `${relaychain}-${paraType.toLowerCase()}-${paraID}`

            // update chainparachain table
            paraIDs.push(`('${chainID}', '${paraID}', Now(), Now(), '${relaychain}', '${paraType}') `)
            this.paraIDs.push(paraID);

            if (targetEndpoint == undefined) {
                console.log(`*** ${fullparaID} NOT FOUND!!!`)
            } else {
                para_name = targetEndpoint.id
                //console.log(`${fullparaID} [${para_name}] found`)
            }
            if (knownParachains[fullparaID] == undefined) {
                console.log(`** NEW para ${fullparaID} [${para_name}]`)
                // insert unknown para into chain table
                // convention: for polkadot parachain: use 4-digits paraID as chainID. for kusama parachain: add 20000 to the paraID. such that paraID is 5-degits number like 2xxxx
                // we will tentatively fill id using endpoint's ID. If it's not available, fill it with "relaychain-paraType-paraID". (we will use talisman convention to update the id in future)
                //"vals": ["id", "relaychain", "paraID", "website",  "WSEndpoint", "WSEndpoint2", "WSEndpoint3"]
                if (targetEndpoint == undefined) {
                    // targetEndpoint not found in endpoints.js. example: kusama-2021
                    let parachainID = (relaychain == 'polkadot') ? paraID : 20000 + paraID
                    newParas.push(`('${parachainID}', '${para_name}', '${relaychain}', '${paraID}', Null, Null, Null, Null) `)
                } else {
                    let parachainID = (relaychain == 'polkadot') ? paraID : 20000 + paraID
                    let website = (targetEndpoint.website != undefined) ? `'${targetEndpoint.website}'` : 'Null'
                    //console.log(`${fullparaID} len=${targetEndpoint.WSEndpoints.length}`, targetEndpoint.WSEndpoints)
                    let WSEndpoint = (targetEndpoint.WSEndpoints.length >= 1) ? `'${targetEndpoint.WSEndpoints[0]}'` : 'Null'
                    let WSEndpoint2 = (targetEndpoint.WSEndpoints.length >= 2) ? `'${targetEndpoint.WSEndpoints[1]}'` : 'Null'
                    let WSEndpoint3 = (targetEndpoint.WSEndpoints.length >= 3) ? `'${targetEndpoint.WSEndpoints[2]}'` : 'Null'
                    newParas.push(`('${parachainID}', '${para_name}', '${relaychain}', '${paraID}', ${website}, ${WSEndpoint}, ${WSEndpoint2}, ${WSEndpoint3}) `)
                }
            } else {
                //console.log(`** KNOWN para ${fullparaID} ${para_name} -- skip`)
            }
        }
        await this.upsertSQL({
            "table": "chainparachain",
            "keys": ["chainID", "paraID"],
            "vals": ["firstSeenDT", "lastUpdateDT", "relaychain", "paratype"],
            "data": paraIDs,
            "replace": ["relaychain", "paratype"],
            "replaceIfNull": ["lastUpdateDT"],
        });
        this.logger.info({
            "op": "crawl_parachains",
            "chainID": chainID
        });
        console.log(`crawl_parachains relayChain=${relaychain} len=${paraIDs.length}`)

        //console.log(`newParas`, newParas)
        await this.upsertSQL({
            "table": "chain",
            "keys": ["chainID"],
            "vals": ["id", "relaychain", "paraID", "website", "WSEndpoint", "WSEndpoint2", "WSEndpoint3"],
            "data": newParas,
            "replace": ["id", "relaychain", "paraID", "website"],
            "replaceIfNull": ["WSEndpoint", "WSEndpoint2", "WSEndpoint3"],
        }, true);
        this.logger.info({
            "op": "crawl_parachains_chainUpdate",
            "chainID": chainID
        });
        console.log(`new paraUpdates relayChain=${relaychain} len=${newParas.length}`)
        this.readyToCrawlParachains = false;
    }

    async processFinalizedHead(chain, chainID, bn, finalizedHash, parentHash, isTip = false) {

        const tableChain = this.getTableChain(chainID);
        await this.initApiAtStorageKeys(chain, finalizedHash, bn);

        let blockStats = false;
        let blockTS = 0;
        if (bn > this.latestBlockNumber) this.latestBlockNumber = bn;
        try {
            // read the row and DELETE all the blockraw:XXX and trace:XXX rows that do NOT match the finalized hash
	    let rawblock = await this.fetch_block(chainID, bn, [], false, finalizedHash);
	    if ( rawblock ) {
		let { feed, events, evmBlock, evmReceipts, blockTS } = rawblock
		if (feed && events) {
		    //console.log("FINALIZED with data", chainID, bn, rawblock.blockTS);
                    /*if (this.web3Api) {
                      let evmBlock = await ethTool.crawlEvmBlock(this.web3Api, bn)
                      let evmReceipts = await ethTool.crawlEvmReceipts(this.web3Api, evmBlock) // this is using the result from previous call
                      let evmTrace = (chainID == paraTool.chainIDMoonbeam || chainID == paraTool.chainIDMoonriver) ? await this.crawlEvmTrace(chain, bn) : false;
                      await this.save_evm_block(chainID, bn, finalizedHash, evmBlock, evmReceipts, evmTrace)
                      } */
                    let r = await this.index_chain_block_row(rawblock, false, false, false, true); // signedBlock is false, write_bq_log = false, isTip = TRUE
		    //blockStats = r.blockStats;
                    // IMMEDIATELY flush all address feed + hashes (txs + blockhashes)
                    await this.flush(rawblock.blockTS, bn, false, isTip); //ts, bn, isFullPeriod, isTip
		    blockTS = rawblock.blockTS
		} else {
		    console.log("FINALIZED but no data", chainID, bn, rawblock.blockTS);
		}
	    }
        } catch (err) {
            console.log(`err`, err)
            this.logger.error({
                "op": "subscribeFinalizedHeads",
                chainID,
                bn,
                err
            })
        }
        try {
            // write to MySQL
	    if ( blockTS > 0 ) {
                let numExtrinsics = blockStats && blockStats.numExtrinsics ? blockStats.numExtrinsics : 0
                let numSignedExtrinsics = blockStats && blockStats.numSignedExtrinsics ? blockStats.numSignedExtrinsics : 0
                let numTransfers = blockStats && blockStats.numTransfers ? blockStats.numTransfers : 0
                let numEvents = blockStats && blockStats.numEvents ? blockStats.numEvents : 0
                let valueTransfersUSD = blockStats && blockStats.valueTransfersUSD ? blockStats.valueTransfersUSD : 0
                let fees = blockStats && blockStats.fees ? blockStats.fees : 0;
                let eflds = "";
                let evals = "";
                let eupds = "";
                if (chain.isEVM) {
                    let blockHashEVM = blockStats.blockHashEVM ? blockStats.blockHashEVM : "";
                    let parentHashEVM = blockStats.parentHashEVM ? blockStats.parentHashEVM : "";
                    let numTransactionsEVM = blockStats.numTransactionsEVM ? blockStats.numTransactionsEVM : 0;
                    let numTransactionsInternalEVM = blockStats.numTransactionsInternalEVM ? blockStats.numTransactionsInternalEVM : 0;
                    let numReceiptsEVM = blockStats.numReceiptsEVM ? blockStats.numReceiptsEVM : 0;
                    let gasUsed = blockStats.gasUsed ? blockStats.gasUsed : 0;
                    let gasLimit = blockStats.gasLimit ? blockStats.gasLimit : 0;
                    eflds = ", blockHashEVM, parentHashEVM, numTransactionsEVM, numTransactionsInternalEVM, numReceiptsEVM, gasUsed, gasLimit, crawlBlockEVM, crawlReceiptsEVM, crawlTraceEVM";
                    evals = `, '${blockHashEVM}', '${parentHashEVM}', '${numTransactionsEVM}', '${numTransactionsInternalEVM}', '${numReceiptsEVM}', '${gasUsed}', '${gasLimit}', ${crawlBlockEVM}, ${crawlReceiptsEVM}, ${crawlTraceEVM}`;
                    eupds = ", blockHashEVM = values(blockHashEVM), parentHashEVM = values(parentHashEVM), numTransactionsEVM = values(numTransactionsEVM), numTransactionsInternalEVM = values(numTransactionsInternalEVM), numReceiptsEVM = values(numReceiptsEVM), gasUsed = values(gasUsed), gasLimit = values(gasLimit), crawlBlockEVM = values(crawlBlockEVM), crawlReceiptsEVM = values(crawlReceiptsEVM), crawlTraceEVM = values(crawlTraceEVM)";
                }
            let [crawlBlock, crawlTrace] = [0, 0];
	    let sql = `insert into block${chainID} (blockNumber, blockDT, blockHash, parentHash, numExtrinsics, numSignedExtrinsics, numTransfers, numEvents, valueTransfersUSD, fees, blockDT, crawlBlock, crawlTrace ${eflds}) values ('${bn}', from_unixtime('${blockTS}'), '${finalizedHash}', '${parentHash}', '${numExtrinsics}', '${numSignedExtrinsics}', '${numTransfers}', '${numEvents}', '${valueTransfersUSD}', '${fees}', FROM_UNIXTIME('${blockTS}'), '${crawlBlock}', '${crawlTrace}' ${evals}) on duplicate key update blockHash=values(blockHash), parentHash = values(parentHash), blockDT=values(blockDT), numExtrinsics = values(numExtrinsics), numSignedExtrinsics = values(numSignedExtrinsics), numTransfers = values(numTransfers), numEvents = values(numEvents), valueTransfersUSD = values(valueTransfersUSD), fees = values(fees), crawlBlock = values(crawlBlock), crawlTrace = values(crawlTrace) ${eupds}`;
                this.batchedSQL.push(sql);
                // mark that the PREVIOUS hour is ready for indexing, since this block is FINALIZED, so that continuously running "indexChain" job can index the newly finalized hour
                this.markFinalizedReadyForIndexing(chainID, blockTS);
                let sql2 = `insert into chain ( chainID, blocksCovered, blocksFinalized, lastFinalizedDT ) values ( '${chainID}', '${bn}', '${bn}', Now() ) on duplicate key update blocksFinalized = values(blocksFinalized), lastFinalizedDT = values(lastFinalizedDT), blocksCovered = IF( blocksCovered < values(blocksFinalized), values(blocksFinalized), blocksCovered )`
                this.batchedSQL.push(sql2);
                let sql4 = `delete from blockunfinalized where chainID = '${chainID}' and blockNumber < '${bn}'`
                this.batchedSQL.push(sql4);

                var runtimeVersion = await this.api.rpc.state.getRuntimeVersion(finalizedHash)
                let specVersion = runtimeVersion.toJSON().specVersion;
                if (this.metadata[specVersion] == undefined) {
                    await this.getSpecVersionMetadata(chain, specVersion, finalizedHash, bn);
                }

                //console.log("subscribeFinalizedHeads", chain.chainName, bn, `CHECK: cbt read chain${chainID} prefix=` + paraTool.blockNumberToHex(bn), "|  ", sql2);
                await this.update_batchedSQL();
                if (this.readyToCrawlParachains && (chainID == 0) ) {
                    await this.crawl_parachains(chainID);
                }
                if (bn % 7200 == 0) { 
                    await this.crawlParachains();
                    try {
                        await this.setup_chainParser(chain, paraTool.debugNoLog, true);
                    } catch (e1) {}

                }
	    }
        } catch (err) {
            if (err.toString().includes("disconnected")) {
                console.log(err);
            } else {
		console.log(err);
            }
        }
    }

    async crawlBlocks(chainID) {
        let chain = await this.setupChainAndAPI(chainID);
        await this.setup_chainParser(chain, paraTool.debugNoLog, true);
        if (chain.blocksFinalized) this.finalizedHashes[chain.blocksFinalized] = "known";
        const unsubscribeFinalizedHeads = await this.api.rpc.chain.subscribeFinalizedHeads(async (header) => {
            this.lastEventReceivedTS = this.getCurrentTS(); // if no event received in 5mins, restart
            let bn = parseInt(header.number.toString(), 10);
            let finalizedHash = header.hash.toString();
            let parentHash = header.parentHash.toString();
	    
            await this.processFinalizedHead(chain, chainID, bn, finalizedHash, parentHash, true);
            this.finalizedHashes[bn] = finalizedHash;
            // because we do not always get the finalized hash signal, we brute force use the parentHash => grandparentHash => greatgrandparentHash => greatgreatgrandparentHash  (3 up)
            let b = bn - 1;
            let bHash = parentHash;
            let bMin = (bn > 10) ? bn - 10 : 1;

            let queue = [];
            while (this.finalizedHashes[b] == undefined && (b > bMin)) {
                let bHeader = await this.api.rpc.chain.getHeader(bHash);
                let bparentHash = bHeader.parentHash.toString();
                this.finalizedHashes[b] = bHash;
                queue.push({
                    b,
                    bHash,
                    bparentHash
                });
                b--;
                bHash = bparentHash;
            }
            for (let i = 0; i < queue.length; i++) {
                let q = queue[i];
                await this.processFinalizedHead(chain, chainID, q.b, q.bHash, q.bparentHash, true); // it's safe to pass true here. lastCrawlBN will prevent update using older state
            }
            var sql = `update chain set blocksFinalized = '${bn}', lastFinalizedDT =  Now() where chainID = '${chainID}' and blocksFinalized < ${bn}`
	    this.batchedSQL.push(sql);
	    await this.update_batchedSQL();
            // clean up old entries to avoid memory explosion
            if (this.finalizedHashes[bn - 11] !== undefined) {
                delete this.finalizedHashes[bn - 11];
            }
        });

        let unsubscribeRuntimeVersion = await this.api.rpc.state.subscribeRuntimeVersion(async (results) => {
            var runtimeVersion = await this.api.rpc.state.getRuntimeVersion()
            let specVersion = runtimeVersion.toJSON().specVersion;
            // this will refresh the metadata and get new storage keys for the most recent spec
            await this.getSpecVersionMetadata(chain, specVersion, false, 0);
        });

        // subscribeStorage returns changes from ALL blockHashes, including the ones that eventually get dropped
        let unsubscribeStorage = null
        this.blocksCovered = chain.blocksCovered;
        try {
            unsubscribeStorage = await this.api.rpc.state.subscribeStorage(async (results) => {
                try {
                    this.lastEventReceivedTS = this.getCurrentTS(); // if not received in 5mins, reset
                    // build block similar to sidecar
                    let blockHash = results.block.toHex();
                    let [signedBlock, events] = await this.crawlBlock(this.api, results.block.toHex());

                    /* goal - limit unnecessary signedBlock call while making crawlBlocks - processBlockEvents work in the same way as index_block_period - processBlockEvents
                    signedBlock: result from crawlBlock - await api.rpc.chain.getBlock(blockHash), with blockTS added
                    block: result to pass into save_block_trace - extrinsics are in encoded hex format
                    signedExtrinsicBlock - result to pass into processBlockEvents, which should be the same format as result used by index_chain_block_row
                    */

                    let blockTS = signedBlock.blockTS;

                    // to avoid 'hash' error, we create the a new block copy without decoration and add hash in
                    let block = JSON.parse(JSON.stringify(signedBlock));
                    block.number = paraTool.dechexToInt(block.header.number);
                    block.hash = blockHash;
                    block.blockTS = blockTS;

                    let blockNumber = block.number;
                    // get trace from block
                    let trace = await this.dedupChanges(results.changes);
                    if (blockNumber > this.latestBlockNumber) this.latestBlockNumber = blockNumber;
                    let evmBlock = false
                    let evmReceipts = false
                    let evmTrace = false

                    // write { blockraw:blockHash => block, trace:blockHash => trace, events:blockHash => events } to bigtable
                    let success = await this.save_block_trace(chainID, block, blockHash, events, trace, false, "subscribeStorage")
                    if (success) {
                        // write to mysql
                        let blockTS = block.blockTS;
                        if (blockTS > 0) {
                            let signedExtrinsicBlock = block
                            signedExtrinsicBlock.extrinsics = signedBlock.extrinsics //add signed extrinsics

                            let autoTraces = await this.processTraceAsAuto(blockTS, blockNumber, blockHash, this.chainID, trace, "subscribeStorage", this.api);
                            let [blockStats, xcmMeta] = await this.processBlockEvents(chainID, signedExtrinsicBlock, events, evmBlock, evmReceipts, evmTrace, autoTraces); // autotrace, finalized, write_bq_log are all false
                            await this.immediateFlushBlockAndAddressExtrinsics(true) 
                            if (blockNumber > this.blocksCovered) {  // only update blocksCovered in the DB if its HIGHER than what we have seen before
                                var sql = `update chain set blocksCovered = '${blockNumber}', lastCrawlDT = Now() where chainID = '${chainID}' and blocksCovered < ${blockNumber}`
                                this.batchedSQL.push(sql);
                                this.blocksCovered = blockNumber;
                            }
                            let numExtrinsics = blockStats && blockStats.numExtrinsics ? blockStats.numExtrinsics : 0
                            let numSignedExtrinsics = blockStats && blockStats.numSignedExtrinsics ? blockStats.numSignedExtrinsics : 0
                            let numTransfers = blockStats && blockStats.numTransfers ? blockStats.numTransfers : 0
                            let numEvents = blockStats && blockStats.numEvents ? blockStats.numEvents : 0
                            let valueTransfersUSD = blockStats && blockStats.valueTransfersUSD ? blockStats.valueTransfersUSD : 0
                            let fees = blockStats && blockStats.fees ? blockStats.fees : 0
                            let vals = ["numExtrinsics", "numSignedExtrinsics", "numTransfers", "numEvents", "valueTransfersUSD", "fees", "lastTraceDT"]
                            let evals = "";
                            if (chain.isEVM) {
                                let blockHashEVM = blockStats.blockHashEVM ? blockStats.blockHashEVM : "";
                                let parentHashEVM = blockStats.parentHashEVM ? blockStats.parentHashEVM : "";
                                let numTransactionsEVM = blockStats.numTransactionsEVM ? blockStats.numTransactionsEVM : 0;
                                let numTransactionsInternalEVM = blockStats.numTransactionsInternalEVM ? blockStats.numTransactionsInternalEVM : 0;
                                let numReceiptsEVM = blockStats.numReceiptsEVM ? blockStats.numReceiptsEVM : 0;
                                let gasUsed = blockStats.gasUsed ? blockStats.gasUsed : 0;
                                let gasLimit = blockStats.gasLimit ? blockStats.gasLimit : 0;
                                vals.push("blockHashEVM", "parentHashEVM", "numTransactionsEVM", "numTransactionsInternalEVM", "numReceiptsEVM", "gasUsed", "gasLimit");
                                evals = `, '${blockHashEVM}', '${parentHashEVM}', '${numTransactionsEVM}', '${numTransactionsInternalEVM}', '${numReceiptsEVM}', '${gasUsed}', '${gasLimit}'`;
                            }

                            let out = `('${blockNumber}', '${numExtrinsics}', '${numSignedExtrinsics}', '${numTransfers}', '${numEvents}', '${valueTransfersUSD}', '${fees}', from_unixtime(${blockTS}) ${evals} )`;
                            await this.upsertSQL({
                                "table": `block${chainID}`,
                                "keys": ["blockNumber"],
                                "vals": vals,
                                "data": [out],
                                "replace": vals
                            });
                            //store unfinalized blockHashes in a single table shared across chains
                            let outunf = `('${chainID}', '${blockNumber}', '${blockHash}', '${numExtrinsics}', '${numSignedExtrinsics}', '${numTransfers}', '${numEvents}', '${valueTransfersUSD}', '${fees}', from_unixtime(${blockTS}) ${evals} )`;
                            let vals2 = [...vals]; // same as other insert, but with
                            vals2.unshift("blockHash");
                            await this.upsertSQL({
                                "table": "blockunfinalized",
                                "keys": ["chainID", "blockNumber"],
                                "vals": vals2,
                                "data": [outunf],
                                "replace": vals
                            })

                            //console.log(`****** subscribeStorage ${chain.chainName} bn=${blockNumber} ${blockHash}: cbt read chain${chainID} prefix=` + paraTool.blockNumberToHex(parseInt(blockNumber, 10)));
                            await this.update_batchedSQL();
                        }
                    } else {
                        this.logger.warn({
                            "op": "subscribeStorage",
                            chainID,
                            blockNumber
                        })
                    }
                } catch (err) {
                    if (err.toString().includes("disconnected")) {
                        console.log(err);
                    } else {
                        console.log(err);
                        this.logger.error({
                            "op": "subscribeStorage",
                            chainID,
                            err
                        })
                    }
                }
            });
        } catch (errus) {
            console.log(errus);
            unsubscribeStorage = false
        }

        return [unsubscribeFinalizedHeads, unsubscribeStorage, unsubscribeRuntimeVersion];
    }

}
