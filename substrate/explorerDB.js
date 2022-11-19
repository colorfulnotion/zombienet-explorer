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

const ini = require('node-ini');

const stream = require("stream");
const util = require("util");
const paraTool = require("./paraTool.js");
const mysql = require("mysql2");
const bunyan = require('bunyan');
const fs = require('fs');
const os = require("os");

// Imports the Google Cloud client library for Bunyan
const {
    LoggingBunyan
} = require('@google-cloud/logging-bunyan');

module.exports = class PolkaholicDB {
    finished = util.promisify(stream.finished);
    exitOnDisconnect = false;
    // general purpose sql batches
    // Creates a Bunyan Cloud Logging client
    logger = false;
    hostname = false;
    batchedSQL = [];
    initChainInfos = false;
    commitHash = 'NA';
    specVersions = {};
    chainInfos = {};
    chainNames = {};
    paraIDs = [];
    paras = {};
    pool = false;

    numIndexingErrors = 0;
    reloadChainInfo = false; // if set to true after system properties brings in a new asset, we get one chance to do so.
    lastBatchTS = 0;
    connection = false;


    btEVMTx = "hashes";
    btHashes = "hashes";
    btAddressExtrinsic = "addressextrinsic";
    btAccountRealtime = "accountrealtime";
    
    POLKAHOLIC_EMAIL_USER = "info@polkaholic.io";
    POLKAHOLIC_EMAIL_PASSWORD = "";

    get_btTableRealtime() {
	return this.btAccountRealtime;
    }

    constructor(serviceName = "polkaholic") {

        // Creates a Bunyan Cloud Logging client
        const loggingBunyan = new LoggingBunyan();
        this.logger = bunyan.createLogger({
            // The JSON payload of the log as it appears in Cloud Logging
            // will contain "name": "my-service"
            name: serviceName,
            streams: [
                // Log to the console at 'debug' and above
                {
                    stream: process.stdout,
                    level: 'debug'
                },
                // And log to Cloud Logging, logging at 'info' and above
                loggingBunyan.stream('debug'),
            ],
        });

        this.hostname = os.hostname();
        this.commitHash = paraTool.commitHash()
        this.version = `1.0.0` // we will update this manually
        this.indexerInfo = `${this.version}-${this.commitHash.slice(0,7)}`
        console.log(`****  Initiating Polkaholic ${this.indexerInfo} ****`)

        let dbconfig = {
            host: "127.0.0.1",
	    port: 9093,
            user: "root",
            password: "zombienet",
            database: "zombienet",
            //charset: 'default-character-set'
        };
        this.pool = mysql.createPool(dbconfig);
        // Ping WRITABLE database to check for common exception errors.
        this.pool.getConnection((err, connection) => {
            if (err) {
                if (err.code === 'PROTOCOL_CONNECTION_LOST') {
                    console.error('Database connection was closed.')
                }
                if (err.code === 'ER_CON_COUNT_ERROR') {
                    console.error('Database has too many connections.')
                }
                if (err.code === 'ECONNREFUSED') {
                    console.error('Database connection was refused.')
                }
            }
	    
            if (connection) {
                this.connection = connection;
                connection.release()
            }
            return
        })
        // Promisify for Node.js async/await.
        this.pool.query = util.promisify(this.pool.query).bind(this.pool)
        this.pool.end = util.promisify(this.pool.end).bind(this.pool)
        this.poolREADONLY = this.pool;
	
        const tableAddressExtrinsic = "addressextrinsic";
        const tableAccountRealtime = "accountrealtime";
        const tableAccountHistory = "accounthistory";
        const tableEVMTx = "evmtx";
        const tableHashes = "hashes";
        const tableAddress = "address";
        const tableAPIKeys = "apikeys";

    }

    getBQTable(tbl) {
        return "";
    }

    async release(msDelay = 1000) {
        await this.pool.end();
        if (this.connection) {
            await this.connection.destroy();
            this.connection = false;
        }
        await this.sleep(msDelay);
    }

    cacheInit() {
        this.memcached = null;
    }

    async cacheWrite(key, val) {
        if (!this.memcached) this.cacheInit();
        await this.memcached.set(key, val);
    }

    async cacheRead(key) {
        if (!this.memcached) this.cacheInit();
        return this.memcached.get(key)
    }

    async sleep(ms) {
        return new Promise((resolve) => {
            setTimeout(resolve, ms);
        });
    }

    async getBlockRangebyTS(chainID, startTS, endTS) {
        let sql = `select UNIX_TIMESTAMP(min(blockDT)) startTS, UNIX_TIMESTAMP(max(blockDT)) endTS, min(blockNumber) startBN, max(blockNumber) endBN from block${chainID} where blockDT > from_unixtime(${startTS}) and blockDT < from_unixtime(${endTS});`
        var res = await this.poolREADONLY.query(sql);
        if (res.length > 0) {
            let r = res[0]
            r.rangeLen = 1 + r.endBN - r.startBN
            r.chainID = chainID
            return r
        } else {
            return false
        }
    }

    async getKnownParachains() {
        let knownParaChainsMap = {}
        var knownParaChains = await this.poolREADONLY.query(`select chainID, id, chainName, relayChain, paraID from chain`);
        if (knownParaChains.length > 0) {
            for (const kp of knownParaChains) {
                let fullParaID = `${kp.relayChain}-${kp.paraID}`
                knownParaChainsMap[fullParaID] = kp
            }
        }
        return knownParaChainsMap
    }

    async getChainLiquidityPair(chainID) {
        var sql = `select asset, chainID from asset where chainID = ${chainID} and assetType = 'LiquidityPair'`
        var assets = await this.poolREADONLY.query(sql);
        return assets
    }

    getSpecVersionForBlockNumber(chainID, blockNumber) {
        if (!this.specVersions) return (0);
        if (!this.specVersions[chainID.toString()]) return (0);
        let sv = this.specVersions[chainID.toString()];
        for (let i = sv.length - 1; i >= 0; i--) {
            if (blockNumber >= sv[i].blockNumber) {
                return (sv[i].specVersion);
            }
        }
        return (0);
    }

    getChainDecimal(chainID) {
        if (chainID == undefined || chainID === null || chainID === false) {
            console.log("FAILED getChainDecimal", chainID);
            return false;
        }

        chainID = chainID.toString()
        if (this.chainInfos[chainID] != undefined) {
            return this.chainInfos[chainID].decimal
        } else {
            console.log("getChainDecimal FATAL ERROR: must call init", chainID)
        }
    }

    getChainSymbol(chainID) {
        if (typeof chainID !== "string") chainID = chainID.toString()
        if (chainID == undefined || chainID === null || chainID === false) {
            console.log("FAILED getChainSymbol", chainID);
            return false;
        }

        if (this.chainInfos[chainID] != undefined) {
            return this.chainInfos[chainID].symbol
        } else {
            console.log("getChainSymbol FATAL ERROR: must call init", chainID)
        }
    }

    getChainAsset(chainID) {
        chainID = chainID.toString()
        let assetChain = null
        if (this.chainInfos[chainID] != undefined && this.chainInfos[chainID].symbol != undefined) {
            let asset = JSON.stringify({
                "Token": this.chainInfos[chainID].symbol
            })
            assetChain = paraTool.makeAssetChain(asset, chainID);
            if (this.assetInfo[assetChain] != undefined) {
                return (asset);
            }
        }
        console.log(`[${chainID}] getChainAsset FATAL ERROR: must call init for ${assetChain}`, this.chainInfos[chainID])
        return null
    }

    getChainName(chainID) {
        chainID = chainID.toString()
        if (this.chainInfos[chainID] != undefined) {
            return this.chainInfos[chainID].name
        } else {
            console.log("getChainName FATAL ERROR: must call init", chainID)
            let relay = paraTool.getRelayChainByChainID(chainID)
            let paraID = paraTool.getParaIDfromChainID(chainID)
            let name = `${relay}[paraID:${paraID}]`
            return name
        }
    }

    getChainEVMStatus(chainID) {
        chainID = chainID.toString()
        if (this.chainInfos[chainID] != undefined) {
            return this.chainInfos[chainID].isEVM
        } else {
            console.log("getChainEVMStatus FATAL ERROR: must call init", chainID)
        }
    }

    getChainFullInfo(chainID) {
        chainID = chainID.toString()
        let chainInfo = this.chainInfos[chainID]
        if (chainInfo != undefined) {
            let r = {
                chainID: paraTool.dechexToInt(chainID),
                chainName: chainInfo.name,
                asset: chainInfo.asset,
                symbol: chainInfo.symbol,
                ss58Format: chainInfo.ss58Format,
                evmChainID: chainInfo.evmChainID,
                decimals: chainInfo.decimal,
                priceUSD: chainInfo.priceUSD,
                priceUSDPercentChange: paraTool.round(chainInfo.priceUSDPercentChange, 2),
                relayChain: chainInfo.relayChain,
            }
            //console.log("getChainFullInfo", chainInfo, r)
            return r
        } else {
            return {
                chainID: paraTool.dechexToInt(chainID),
                chainName: `chain${chainID}`,
                symbol: "NA",
                decimals: 12,
                priceUSD: 0,
                priceUSDPercentChange: 0,
                relayChain: "NA",
            }
        }
    }

    getRelayChainID(chainID) {
        if (this.chainInfos[chainID] == undefined) {
            console.log("1: could not determine relaychainID", chainID);
            return (false);
        }
        let relayChain = this.chainInfos[chainID].relayChain;
        if (relayChain == "kusama") return (paraTool.chainIDKusama);
        if (relayChain == "polkadot") return (paraTool.chainIDPolkadot);
        console.log("2: could not determine relaychainID", chainID);
        return (false);
    }

    async getParas() {
        let paras = await this.poolREADONLY.query(`select id, chainID, chainName, relayChain, paraID, concat(relayChain,'-',paraID) as fullparaID, symbol from chain order by relayChain desc, chainID;`);
        return (paras);
    }

    getParaInfo(paraID, sourceChainID) {
        sourceChainID = parseInt(sourceChainID, 10)
        let relayChainType = sourceChainID == paraTool.chainIDPolkadot ? "Polkadot" : "Kusama"
        let relayChainSymbol = sourceChainID == paraTool.chainIDPolkadot ? "DOT" : "KSM"
        let fullParaID = sourceChainID == paraTool.chainIDPolkadot ? `polkadot-${paraID}` : `kusama-${paraID}`

        let paraInfo = this.paras[fullParaID]
        if (paraInfo != undefined) {
            return {
                paraId: parseInt(paraID, 10),
                name: (paraInfo.chainName != undefined) ? paraInfo.chainName : paraInfo.id,
                relayChain: relayChainType,
                relayChainSymbol: relayChainSymbol
            }
        } else {
            return {
                paraId: parseInt(paraID, 10),
                name: null,
                relayChain: relayChainType,
                relayChainSymbol: relayChainSymbol
            }
        }
    }

    getNameByChainID(chainID) {
        if (this.chainInfos[chainID] != undefined) {
            // [chainID, id]
            let cID = parseInt(chainID, 10)
            return [cID, this.chainInfos[chainID].id]
        }
        return [false, false]
    }

    getIDByChainID(chainID) {
        if (this.chainInfos[chainID] != undefined) {
            // [chainID, id]
            let cID = parseInt(chainID, 10)
            return this.chainInfos[chainID].id
        }
        return false
    }

    getChainIDByName(id) {
        if (this.chainNames[id] != undefined) {
            // [chainID, id]
            return [this.chainNames[id].chainID, id]
        }
        return [false, false]
    }

    getTableChain(chainID) {
	return "chain" + chainID;
    }

    currentTS() {
        return Math.floor(new Date().getTime() / 1000);
    }

    async numConnections() {
        var sql = 'SELECT COUNT(*) nconn FROM information_schema.PROCESSLIST';
        var q = await this.pool.query(sql);
        if (q.length > 0) {
            let numConn = q[0].nconn;
            if (numConn > 1000) console.log("WARNING: numConnections: ", numConn, "SIZE", this.batchedSQL.length);
            if (numConn > 3000) {
                console.log("TERMINATING Too many connections", numConn);
                process.exit(1);
            }
            return (numConn);
        }
    }

    async update_batchedSQL(sqlMax = 1.50) {
        if (this.batchedSQL.length == 0) return;
        var currentTS = this.currentTS();

        this.lastBatchTS = currentTS;
        let retrySQL = [];
        for (var i = 0; i < this.batchedSQL.length; i++) {
            let sql = this.batchedSQL[i];
            try {
                let sqlStartTS = new Date().getTime();
                await this.pool.query(sql);
                let sqlTS = (new Date().getTime() - sqlStartTS) / 1000;
                if (sqlTS > sqlMax) {
                    this.logger.info({
                        "op": "SLOWSQL",
                        "sql": (sql.length > 4096) ? sql.substring(0, 4096) : sql,
                        "len": sql.length,
                        "sqlTS": sqlTS
                    });
                }
            } catch (err) {
                if (err.toString().includes("Deadlock found")) {
                    retrySQL.push(sql);
                } else {
                    this.logger.error({
                        "op": "update_batchedSQL",
                        "sql": (sql.length > 4096) ? sql.substring(0, 4096) : sql,
                        "len": sql.length,
                        "try": 1,
                        err
                    });
                    this.numIndexingErrors++;
                    let tsm = new Date().getTime();
                    let fn = "/var/log/update_batchedSQL/" + tsm + "-" + i + ".sql";
                    await fs.writeFileSync(fn, sql);
                }
            }
        }
        this.batchedSQL = [];
        if (retrySQL.length > 0) {
            for (var i = 0; i < retrySQL.length; i++) {
                let sql = retrySQL[i];
                try {
                    await this.pool.query(sql);
                } catch (err) {
                    if (err.toString().includes("Deadlock found")) {
                        this.batchedSQL.push(sql);
                    } else {
                        this.logger.error({
                            "op": "update_batchedSQL RETRY",
                            "sql": (sql.length > 4096) ? sql.substring(0, 4096) : sql,
                            "len": sql.length,
                            "try": 2,
                            err
                        });
                        this.numIndexingErrors++;
                        let tsm = new Date().getTime()
                        let fn = "/var/log/update_batchedSQL/" + tsm + "-" + i + ".sql";
                        await fs.writeFileSync(fn, sql);
                    }
                }
            }
        }
    }


    async upsertSQL(flds, debug = false, sqlMax = 1.50) {
        let tbl = flds.table;
        let keys = flds.keys;
        let vals = flds.vals;
        let data = flds.data;

        if (tbl == undefined || typeof tbl !== "string") return (false);
        if (keys == undefined || !Array.isArray(keys)) return (false);
        if (vals == undefined || !Array.isArray(vals)) return (false);
        if (data == undefined || !Array.isArray(data)) return (false);
        if (data.length == 0) return (false);

        let out = [];
        if (flds.replace !== undefined) {
            let farr = flds.replace;
            for (let i = 0; i < farr.length; i++) {
                let f = farr[i];
                out.push(`${f}=VALUES(${f})`);
            }
        }
        if (flds.replaceIfNull !== undefined) {
            let farr = flds.replaceIfNull;
            for (let i = 0; i < farr.length; i++) {
                let f = farr[i];
                out.push(`${f}=IF(${f} is null, VALUES(${f}), ${f})`);
            }
        }
        if (flds.lastUpdateBN !== undefined) {
            let farr = flds.lastUpdateBN;
            for (let i = 0; i < farr.length; i++) {
                let f = farr[i];
                out.push(`${f}=IF( lastUpdateBN <= values(lastUpdateBN), VALUES(${f}), ${f})`)
            }
        }
        let keysvals = keys.concat(vals);
        let fldstr = keysvals.join(",")
        let sql = `insert into ${tbl} (${fldstr}) VALUES ` + data.join(",");
        if (out.length > 0) {
            sql = sql + " on duplicate key update " + out.join(",")
        }
        this.batchedSQL.push(sql);
        if (debug) {
            console.log(sql);
        }
        await this.update_batchedSQL(sqlMax);
    }

    async getChains(crawling = 1, orderBy = "valueTransfersUSD7d DESC") {
        let chains = await this.poolREADONLY.query(`select id, ss58Format as prefix, chain.chainID, chain.chainName, blocksCovered, blocksFinalized, chain.symbol, lastCrawlDT, lastFinalizedDT, unix_timestamp(lastCrawlDT) as lastCrawlTS,
unix_timestamp(lastFinalizedDT) as lastFinalizedTS,  iconUrl, numExtrinsics, numSignedExtrinsics, numTransfers, numEvents, numTransactionsEVM, numAccountsActive, chain.relayChain, totalIssuance, lastUpdateChainAssetsTS,
features, isEVM, chain.asset, WSEndpoint, WSEndpoint2, WSEndpoint3, active, crawlingStatus, githubURL, substrateURL, parachainsURL, dappURL, xcmasset.priceUSD, xcmasset.priceUSDPercentChange, 0 as numHolders
from chain left join xcmasset on chain.symbol = xcmasset.symbol and chain.relayChain = xcmasset.relayChain order by ${orderBy}`);
        return (chains);
    }


    async getChain(chainID, withSpecVersions = false) {
        var chains = await this.poolREADONLY.query(`select id, ss58Format as prefix, chainID, chainName, WSEndpoint, WSEndpointSelfHosted, WSEndpoint2, WSEndpoint3, WSBackfill, RPCBackfill, evmChainID, evmRPC, evmRPCInternal, blocksCovered, blocksFinalized, isEVM, backfillLookback, lastUpdateChainAssetsTS, features, numHolders, asset, relayChain, lastUpdateStorageKeysTS, crawlingStatus,
numExtrinsics,
numSignedExtrinsics,
numTransfers,
numEvents,
numTransactionsEVM,
numReceiptsEVM,
floor(gasUsed / (numEVMBlocks+1)) as gasUsed,
floor(gasLimit / (numEVMBlocks+1)) as gasLimit,
numXCMTransferIncoming, 
numXCMTransferOutgoing 

from chain where chainID = '${chainID}' limit 1`);
        if (chains.length == 0) return (false);
        let chain = chains[0];

        if (withSpecVersions) {
            let specVersions = await this.poolREADONLY.query(`select specVersion, blockNumber, blockHash from specVersions where chainID = '${chainID}' and blockNumber > 0 order by specVersion`);
            chain.specVersions = specVersions;
        }
        // because some chains don't have subscribeStorage support (and subscribeStorage updates blocksCovered...)
        if (chain.blocksCovered == null || chain.blocksCovered < chain.blocksFinalized) {
            chain.blocksCovered = chain.blocksFinalized
        }
        if (chainID == paraTool.chainIDPolkadot || chainID == paraTool.chainIDKusama) {
            let paraIDs = await this.poolREADONLY.query(`select paraID from chainparachain where chainID = '${chainID}'`);
            for (let i = 0; i < paraIDs.length; i++) {
                let paraID = paraIDs[i].paraID;
                this.paraIDs.push(paraID);

            }
        }
        return chain;
    }

    async getWeb3Api(chain) {
        if (this.web3Api) return (this.web3Api);
        const Web3 = require('web3')
	var web3Api = new Web3(chain.evmRPC);
        console.log(`web3Api ${chain.evmRPC}`)
        return web3Api
    }

    async getTestParseTraces(testGroup = 1) {
        let tests = await this.poolREADONLY.query(`select * from testParseTraces where testGroup = '${testGroup}' order by chainID`);
        return (tests);
    }

    async getContractABI() {
        let contractabis = await this.poolREADONLY.query(`select signatureID, signature, abi, abiType, topicLength from contractabi`);
        let abis = {}
        for (const abi of contractabis) {
            let signatureID = abi.signatureID
            let abiType = abi.abiType
            let topicLen = abi.topicLength
            let fingerprintID = (abiType == 'event') ? `${signatureID}-${topicLen}` : signatureID
            let jsonABI = JSON.parse(abi.abi.toString('utf8'))
            let r = {
                signatureID: signatureID,
                signature: abi.signature.toString('utf8'),
                abi: jsonABI,
                abiType: abiType,
                topicLength: topicLen
            }
            if (abis[fingerprintID] == undefined) {
                abis[fingerprintID] = r
            } else {
                // console.log(`fingerprint collision detected ${fingerprintID}`)
            }
        }
        return (abis);
    }

    async setupAPI(chain, backfill = false) {
        if (backfill) {
            chain.WSEndpoint = chain.WSBackfill
            console.log("API using backfill endpoint", chain.WSEndpoint);
        }
        if (!this.api) {
            this.api = await this.get_api(chain);
        }
        if (!this.web3Api) {
            this.web3Api = await this.getWeb3Api(chain, backfill);
            if (this.web3Api) {
                this.contractABIs = await this.getContractABI();
            }
        }
        this.chainID = chain.chainID;
        this.chainName = chain.chainName;
    }

    async get_api(chain, useWSBackfill = false) {
        const chainID = chain.chainID;
        const {
            ApiPromise,
            WsProvider
        } = require("@polkadot/api");
        const {
            Metadata,
            TypeRegistry,
            StorageKey,
            decorateStorage
        } = require('@polkadot/types');
	let endpoint = chain.WSEndpoint;
        const provider = new WsProvider(endpoint);
        provider.on('disconnected', () => {
            console.log('CHAIN API DISCONNECTED', chain.chainID);
            if (this.exitOnDisconnect) process.exit(1);
        });
        provider.on('connected', () => console.log('chain API connected', chain.chainID));
        provider.on('error', (error) => console.log('chain API error', chain.chainID));

        var api = false;
/*
        // https://polkadot.js.org/docs/api/start/types.extend/
        // https://github.com/polkadot-js/apps/tree/master/packages/apps-config
        if (chainID == paraTool.chainIDSubsocial) {
            const typesDef = require("@subsocial/types");
            api = await ApiPromise.create({
                provider: provider,
                types: typesDef.typesBundle.spec.subsocial.types
            });
        } else if (chainID == paraTool.chainIDSora) {
            const typesDef = require("@sora-substrate/type-definitions");
            api = await ApiPromise.create({
                provider: provider,
                types: typesDef.types
            });
        } else if (chainID == paraTool.chainIDZeitgeist) {
            const typesDef = require("@zeitgeistpm/type-defs");
            api = await ApiPromise.create({
                provider: provider,
                types: typesDef.index.types,
                rpc: typesDef.index.rpc
            });
        } else if (chainID == paraTool.chainIDCrustShadow) {
            const typesDef = require("@crustio/type-definitions");
            api = await ApiPromise.create({
                provider: provider,
                typesBundle: typesDef.typesBundleForPolkadot,
                rpc: typesDef.typesBundleForPolkadot.spec.crust.rpc
            });
        } else if (chainID == paraTool.chainIDDarwiniaCrab) {
            const typesDef = require("@darwinia/types");
            api = await ApiPromise.create({
                provider: provider,
                types: typesDef
            });
        } else if (chainID == paraTool.chainIDPhala) {
            const typesDef = require("@phala/typedefs");
            api = await ApiPromise.create({
                provider: provider,
                types: typesDef.typesChain.Khala
            });
        } else if (chainID == paraTool.chainIDLaminar) {
            const typesDef = require("@laminar/type-definitions");
            api = await ApiPromise.create({
                provider: provider,
                types: typesDef.index.types,
                rpc: typesDef.index.rpc
            });
        } else if (chainID == paraTool.chainIDPontem) {
            const typesDef = require("pontem-types-bundle");
            api = await ApiPromise.create({
                provider: provider,
                types: typesDef.pontemDefinitions.types,
                rpc: typesDef.pontemDefinitions.rpc
            });
        } else if (chainID == paraTool.chainIDUnique && false) {
            // https://github.com/UniqueNetwork/unique-types-js/tree/fe923e4112ec03f8c8c680cc043da69ef33efa27
            const typesDef = require("@unique-nft/unique-mainnet-types"); // problematic dependency
            api = await ApiPromise.create({
                provider: provider,
                types: typesDef
            });
        } else if (chainID == paraTool.chainIDKintsugi) {
            const typesDef = require("@interlay/interbtc-types");
            api = await ApiPromise.create({
                provider: provider,
                types: typesDef.default.types,
                rpc: typesDef.default.rpc
            });
            console.log(`You are connected to KINTSUGI chain ${chainID} endpoint=${endpoint} with types + rpc`);
        } else if (chainID == paraTool.chainIDKilt) {
            const typesDef = require("@kiltprotocol/type-definitions");
            api = await ApiPromise.create({
                provider: provider,
                types: typesDef.typeBundleForPolkadot.types
            });
            console.log(`You are connected to KILT chain ${chainID} endpoint=${endpoint} with types but not rpc`);
        } else if (false && (chainID == paraTool.chainIDAstar || chainID == paraTool.chainIDShiden || chainID == paraTool.chainIDShibuya)) {
            const options = require("@astar-network/astar-api");
            api = await ApiPromise.create(options({
                provider
            }));
            console.log(`You are connected to ASTAR/SHIDEN chain ${chainID} endpoint=${endpoint} with options`);
        } else if (chainID == paraTool.chainIDMoonbeam) {
            const typesBundlePre900 = require("moonbeam-types-bundle");
            api = await ApiPromise.create({
                provider: provider,
                typesBundle: typesBundlePre900.typesBundlePre900,
                rpc: typesBundlePre900.typesBundlePre900.spec.moonbeam.rpc
            });
            console.log(`You are connected to MOONBEAM chain ${chainID} endpoint=${endpoint} with types + rpc`);
        } else if (chainID == paraTool.chainIDMoonriver) {
            const typesBundlePre900 = require("moonbeam-types-bundle");
            api = await ApiPromise.create({
                provider: provider,
                typesBundle: typesBundlePre900.typesBundlePre900,
                rpc: typesBundlePre900.typesBundlePre900.spec.moonriver.rpc
            });
            console.log(`You are connected to MOONRIVER chain ${chainID} endpoint=${endpoint} with types + rpc`);
        } else if (chainID == paraTool.chainIDMoonbaseAlpha || chainID == paraTool.chainIDMoonbaseBeta) {
            const typesBundlePre900 = require("moonbeam-types-bundle");
            api = await ApiPromise.create({
                provider: provider,
                typesBundle: typesBundlePre900.typesBundlePre900,
                rpc: typesBundlePre900.typesBundlePre900.spec.moonbase.rpc
            });
            console.log(`You are connected to MoonBase chain ${chainID} endpoint=${endpoint} with types + rpc`);
        } else if (chainID == paraTool.chainIDBifrostKSM || chainID == paraTool.chainIDBifrostDOT) {
            const typeDefs = require("@bifrost-finance/type-definitions");
            api = await ApiPromise.create({
                provider: provider,
                typesBundle: typeDefs.typesBundleForPolkadot,
                rpc: typeDefs.typesBundleForPolkadot.spec.bifrost.rpc
            });
            console.log(`You are connected to BIFROST chain ${chainID} endpoint=${endpoint} with types + rpc`);
        } else if ((chainID == paraTool.chainIDParallel) || (chainID == paraTool.chainIDHeiko)) {
            const typeDefs = require("@parallel-finance/type-definitions");
            api = await ApiPromise.create({
                provider: provider,
                typesBundle: typeDefs.typesBundleForPolkadot,
                rpc: typeDefs.typesBundleForPolkadot.spec.parallel.rpc
            });
            console.log(`You are connected to PARALLEL chain ${chainID} endpoint=${endpoint} with types + rpc`);
        } else if (chain.chainID == paraTool.chainIDAcala) {
            const typeDefs = require("@acala-network/type-definitions");
            api = await ApiPromise.create({
                provider: provider,
                typesBundle: typeDefs.typesBundleForPolkadot,
                rpc: typeDefs.typesBundleForPolkadot.spec.acala.rpc,
                signedExtensions: typeDefs.signedExtensions
            });
            console.log(`You are connected to ACALA chain ${chainID} endpoint=${endpoint} with types + rpc + signedExt`);
        } else if (chain.chainID == paraTool.chainIDKarura) {
            const typeDefs = require("@acala-network/type-definitions");
            api = await ApiPromise.create({
                provider: provider,
                typesBundle: typeDefs.typesBundleForPolkadot,
                rpc: typeDefs.typesBundleForPolkadot.spec.karura.rpc,
                signedExtensions: typeDefs.signedExtensions
            });
            console.log(`You are connected to KARURA chain ${chainID} endpoint=${endpoint} with types + rpc + signedExt`);
        } else {
 }
*/
        api = await ApiPromise.create({
                provider: provider
            });
            console.log(`You are connected to chain ${chainID} endpoint=${endpoint}`);
       

        api.on('disconnected', () => {
            console.log('CHAIN API DISCONNECTED', chain.chainID);
            if (this.exitOnDisconnect) process.exit(1);
        });
        api.on('connected', () => console.log('chain API connected', chain.chainID));
        api.on('error', (error) => console.log('chain API error', chain.chainID, error));
        return api;
    }

    async fetch_block(chainID, blockNumber, blockHash = false) {
	try {
            const tableChain = this.getTableChain(chainID);
	    let w = blockHash ? ` and blockHash = '${blockHash}' ` : "";
	    let sql = `select unix_timestamp(blockDT) as blockTS, convert(blockraw using utf8) as blockraw, convert(feed using utf8) as feed, convert(trace using utf8) as trace, convert(evmBlock using utf8) as evmBlock, convert(evmReceipts using utf8) as evmReceipts, convert(events using utf8) as events, numXCMTransfersIn, numXCMMessagesIn, numXCMTransfersOut, numXCMMessagesOut, blockHashEVM, parentHashEVM, numTransactionsEVM, numTransactionsInternalEVM, numReceiptsEVM, gasUsed, gasLimit from block${chainID} where blockNumber = ${blockNumber}`
	    let blocks = await this.poolREADONLY.query(sql)
	    if ( blocks.length == 1 ) {
		let b = blocks[0];
		b.blockraw = JSON.parse(b.blockraw);
		b.block = JSON.parse(b.feed);
		b.trace = JSON.parse(b.trace);
		b.events = JSON.parse(b.events);
		b.evmBlock = JSON.parse(b.evmBlock);
		b.evmReceipts = JSON.parse(b.evmReceipts);
		b.block.finalized = true;
		return b;
	    }
	    let sql2 = `select unix_timestamp(blockDT) as blockTS, convert(blockraw using utf8) as blockraw, convert(feed using utf8) as feed, convert(trace using utf8) as trace, evmBlock, evmReceipts, convert(events using utf8) as events, numXCMTransfersIn, numXCMMessagesIn, numXCMTransfersOut, numXCMMessagesOut, blockHashEVM, parentHashEVM, numTransactionsEVM, numTransactionsInternalEVM, numReceiptsEVM, gasUsed, gasLimit from blockunfinalized where chainID = ${chainID} and blockNumber = ${blockNumber} ${w}`
	    let blocks2 = await this.poolREADONLY.query(sql2)

	    if ( blocks2.length > 0 ) {
		// we return the first unfinalized record if blockHash not specified
		let b = blocks2[0];
		let row = {
		    blockTS: b.blockTS,
		    blockraw: b.blockraw ? JSON.parse(b.blockraw) : null,
		    block: b.feed ? JSON.parse(b.feed) : null,
		    trace: b.trace ? JSON.parse(b.trace) : null,
		    events: b.events ? JSON.parse(b.events) : null,
		    evmBlock: JSON.parse(b.evmBlock),
		    evmReceipts: JSON.parse(b.evmReceipts),
		    numXCMTransfersIn: 0,
		    numXCMMessagesIn: 0,
		    numXCMTransfersOut: 0,
		    numXCMMessagesOut: 0,
		    blockHashEVM: b.blockHashEVM,
		    parentHashEVM: b.parentHashEVM,
		    numTransactionsEVM: b.numTransactionsEVM,
		    numTransactionsInternalEVM: b.numTransactionsInternalEVM,
		    numReceiptsEVM: b.numReceiptsEVM,
		    gasUsed: b.gasUsed, 
		    gasLimit: b.gasLimit,
		}
		row.block.finalized = false;
		console.log("fetch_block SUCC");
		return row;
	    } else {
		console.log("fetch_block FAIL");
	    }
	} catch (err) {
	    console.log(err);
	}
	// if not found, return null
	return null;
    }

    getCurrentTS() {
        return Math.round(new Date().getTime() / 1000);
    }

    capitalizeFirstLetter(string) {
        return string.charAt(0).toUpperCase() + string.slice(1);
    }
}
