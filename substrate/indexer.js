const util = require('util');
const exec = util.promisify(require('child_process').exec);
const path = require("path");
const AssetManager = require("./assetManager");
const ethTool = require("./ethTool");
const paraTool = require("./paraTool");

const mysql = require("mysql2");
const {
    WebSocket
} = require('ws');
const {
    hexToU8a,
    compactStripLength,
    hexToBn
} = require("@polkadot/util");
const {
    StorageKey
} = require('@polkadot/types');
const fs = require('fs');

module.exports = class Indexer extends AssetManager {
    debugLevel = paraTool.debugNoLog;
    writeData = true; // true = production level write, false = debug SKIPs

    readyForIndexing = {};
    readyToCrawlParachains = false;

    hashesRowsToInsert = [];

    blockRowsToInsert = [];
    addressStorage = {};
    historyMap = {};
    addressExtrinsicMap = {};


    nonCompliantLP = {};
    unhandledTraceMap = {};

    relatedMap = {};
    extrinsicEvmMap = {};

    currentPeriodKey = false;

    initTS = false;
    crawlTS = false;

    numUpdated = 0
    tallyAsset = {};
    xcmtransfer = {};
    xcmtransferdestcandidate = {};
    xcmViolation = {};
    incomingXcmState = {}

    currentSessionValidators = [];
    currentSessionIndex = -1;

    trailingBlockHashs = {};
    multisigMap = {};
    proxyMap = {};
    crowdloan = {};
    assetholder = {};
    api = false;
    web3Api = false;
    contractABIs = false;
    contractABISignatures = {};
    chainID = false;
    chainName = false;
    relayChain = "";
    metadata = {};
    authorErrorSpecVersion = 0; //query.session.currentIndex is not available for certain v. cache the errorV and do not ask author until specV changed again
    specVersion = -1;
    xcmeventsMap = {};
    xcmmsgMap = {};
    xcmmsgSentAtUnknownMap = {};
    xcmTrailingKeyMap = {}; //keep the firstSeen BN. TODO: remove
    evmcontractMap = {};

    recentXcmMsgs = []; //will flush from here.
    numXCMMessagesIn = {};
    numXCMMessagesOut = {};

    recentExtrinsics = [];
    recentTransfers = [];

    isRelayChain = false;

    wasmContractMap = {};

    addressBalanceRequest = {}

    context = {};
    stat = {
        hashesRows: {
            substrateBlk: 0,
            evmBlk: 0,
            substrateTx: 0,
            evmTx: 0,
            evmTxPerBlk: [],
            substrateTxPerBlk: [],
        },
        addressRows: {
            uniqueAddr: 0,
            uniqueEVMAddr: 0,
            uniqueSubstrateAddr: 0,
            realtime: 0,
            history: 0,
            feed: 0,
            feedunfinalized: 0,
            feedtransfer: 0,
            feedreward: 0,
            feedcrowdloan: 0,
            xcmsend: 0,
            xcmreceive: 0
        },
        addressStorage: {
            uniqueAddr: 0
        },
        assetholder: {
            unique: 0,
            read: 0,
            write: 0,
            update: 0,
        }
    }


    assetStat = {}
    assetChainMap = {}

    debugParseTraces = {}
    failedParseTraces = []

    /* DebugLevel
    debugNoLog: 0,
    debugErrorOnly: 1,
    debugInfo: 2,
    debugVerbose: 3,
    debugTracing: 4,
    */

    parentRelayCrawler = false;
    parentManager = false;

    setDebugLevel(debugLevel = paraTool.debugNoLog) {
        this.debugLevel = debugLevel
    }

    constructor(serviceName = "indexer") {
        super(serviceName)
    }

    setLoggingContext(ctx) {
        this.context = ctx;
    }

    log_indexing_error(err, op, obj = {}, showOnConsole = true) {
        this.numIndexingErrors++;
        if (showOnConsole) {
            console.log("ERROR", "op", op, obj, this.context, err);
        }
        obj.chainID = this.chainID;
        obj.context = this.context;
        obj.op = op;
        obj.err = err;
        this.logger.error(obj);
    }

    log_indexing_warn(err, op, obj = {}, showOnConsole = true) {
        this.numIndexingWarns++;
        if (showOnConsole) {
            console.log("WARNING", "op", op, obj, this.context, err);
        }
        obj.chainID = this.chainID;
        obj.context = this.context;
        obj.op = op;
        obj.err = err;
        this.logger.warn(obj);
    }

    setParentRelayAndManager(relayCrawler, manager) {
        if (this.debugLevel >= paraTool.debugTracing) console.log(`[${this.chainID}:${this.chainName}] setParentRelayAndManager`)
        this.parentRelayCrawler = relayCrawler
        this.parentManager = manager
    }

    validAddress(addr) {
        if (!addr) return (false);
        if (!((addr.length == 66) || (addr.length == 42))) return (false);
        if (addr.substr(0, 2) != "0x") return (false);
        if (addr == "0x0000000000000000000000000000000000000000000000000000000000000000") return (false);
        if (addr == "0x0000000000000000000000000000000000000000") return (false);
        return (true);
    }

    updateAssetLoanDebitExchangeRate(asset, debitExchangeRate) {
        if (this.init_asset(asset, paraTool.assetTypeLoan, paraTool.assetSourceOnChain, "updateAssetLoanDebitExchangeRate")) {
            this.tallyAsset[asset].debitExchangeRate = debitExchangeRate;
        }
    }

    updateAssetLoanExchangeRate(asset, exchangeRate, rateType = 'supply') {
        if (rateType == 'borrow') {
            if (this.init_asset(asset, paraTool.assetTypeCDP, paraTool.assetSourceOnChain, "updateAssetLoanExchangeRate")) {
                this.tallyAsset[asset].borrowExchangeRate = exchangeRate;
            }
        } else if (rateType == 'supply') {
            if (this.init_asset(asset, paraTool.assetTypeCDP, paraTool.assetSourceOnChain, "updateAssetLoanExchangeRate")) {
                this.tallyAsset[asset].supplyExchangeRate = exchangeRate;
            }
        }
    }

    updateAssetPrice(asset, price, assetType = paraTool.assetTypeToken, assetSource = paraTool.assetSourceOracle) {
        if (this.debugLevel >= paraTool.debugVerbose) console.log(`[${this.chainParser.parserBlockNumber}] updateAssetPrice asset=${asset}, assetType=${assetType}, source=${assetSource}`)
        if (this.init_asset(asset, assetType, assetSource, "updateAssetPrice")) {
            //console.log(`updateAssetPrice`, asset, assetType, issuance)
            this.tallyAsset[asset].price = price;
            this.tallyAsset[asset].assetSourceMap[assetSource] = 1 // mark as used
            if (assetType == paraTool.assetTypeLiquidityPair) {
                this.tallyAsset[asset].isDualAssetTypeToken = 1
            }
        }
    }

    getAssetSyntheticRate(asset, assetType = paraTool.assetTypeToken, assetSource = paraTool.assetSourceOracle) {
        if (this.init_asset(asset, assetType, assetSource, "assetSyntheticRate")) {
            //console.log(`getAssetSyntheticRate`, asset, assetType, issuance)
            return this.tallyAsset[asset].syntheticRate
        }
    }

    // update liquidStaking exhcange between dot / sDOT
    updateAssetSyntheticRate(asset, price, rate, assetType = paraTool.assetTypeToken, assetSource = paraTool.assetSourceOracle) {
        if (this.init_asset(asset, assetType, assetSource, "assetSyntheticRate")) {
            this.tallyAsset[asset].price = price;
            this.tallyAsset[asset].syntheticRate = rate;
            this.tallyAsset[asset].assetSourceMap[assetSource] = 1 // mark as used
        }
    }

    isValidLiquidityPair(asset) {
        // return if acala LP is found `[{"Token":"KAR"},{"Token":"KSM"}]#8`
        if (this.assetInfo[asset] != undefined) {
            return true
        }
        return false
    }

    isCachedNonCompliantLP(tokenAddr) {
        let addr = tokenAddr.toLowerCase()
        if (this.nonCompliantLP[addr] != undefined) {
            return true
        }
        return false
    }

    cacheNonCompliantLP(tokenAddr) {
        let addr = tokenAddr.toLowerCase()
        console.log(`cached NonCompliantLP ${addr}`)
        this.nonCompliantLP[addr] = true
    }


    updateAssetLiquidityPairPool(asset, lp0, lp1, rat) {
        if (this.init_asset(asset, paraTool.assetTypeLiquidityPair, paraTool.assetSourceOnChain, "updateAssetLiquidityPairPool")) {
            //console.log(`*** updateAssetLiquidityPairPool`, asset, lp0, lp1)
            this.tallyAsset[asset].lp0.push(lp0)
            this.tallyAsset[asset].lp1.push(lp1)
            this.tallyAsset[asset].rat.push(rat)
        }
    }

    updateAssetLiquidityPairTradingVolume(asset, token0In, token1In, token0Out, token1Out) {
        if (this.init_asset(asset, paraTool.assetTypeLiquidityPair, paraTool.assetSourceOnChain, "updateAssetLiquidityPairTradingVolume")) {
            //console.log(`updateAssetLiquidityPairTradingVolume`, asset)
            this.tallyAsset[asset].token0In += !isNaN(token0In) ? token0In : 0
            this.tallyAsset[asset].token1In += !isNaN(token1In) ? token1In : 0
            this.tallyAsset[asset].token0Out += !isNaN(token0Out) ? token0Out : 0
            this.tallyAsset[asset].token1Out += !isNaN(token1Out) ? token1Out : 0
            //this.tallyAsset[asset].assetSourceMap[assetSource] = 1
        }
    }

    getAssetIssuance(asset, assetType = paraTool.assetTypeLiquidityPair, assetSource = paraTool.assetSourceOnChain) {
        if (this.init_asset(asset, assetType, assetSource, "assetIssuance")) {
            //console.log(`getAssetIssuance`, asset, assetType)
            return this.tallyAsset[asset].issuance
        }
    }

    updateAssetIssuance(asset, issuance, assetType = paraTool.assetTypeLiquidityPair, assetSource = paraTool.assetSourceOnChain) {
        if (this.debugLevel >= paraTool.debugVerbose) console.log(`[${this.chainParser.parserBlockNumber}] updateAssetIssuance asset=${asset}, assetType=${assetType}, source=${assetSource}`)
        if (this.init_asset(asset, assetType, assetSource, "updateAssetIssuance")) {
            //console.log(`updateAssetIssuance`, asset, assetType, issuance)
            this.tallyAsset[asset].issuance = issuance;
            this.tallyAsset[asset].assetSourceMap[assetSource] = 1
        }
    }

    updateAssetERC20LiquidityPair(asset, lp0, lp1, rat, pair = false) {
        if (this.init_asset(asset, paraTool.assetTypeERC20LiquidityPair, paraTool.assetSourceOnChain, "updateAssetERC20LiquidityPair")) {
            this.tallyAsset[asset].lp0.push(lp0)
            this.tallyAsset[asset].lp1.push(lp1)
            this.tallyAsset[asset].rat.push(rat)
        }
    }

    updateAssetERC20SwapTradingVolume(asset, token0In, token1In, token0Out, token1Out, pair = false) {
        if (this.init_asset(asset, paraTool.assetTypeERC20LiquidityPair, paraTool.assetSourceOnChain, "updateAssetERC20SwapTradingVolume")) {
            this.tallyAsset[asset].token0In += !isNaN(token0In) ? token0In : 0
            this.tallyAsset[asset].token1In += !isNaN(token1In) ? token1In : 0
            this.tallyAsset[asset].token0Out += !isNaN(token0Out) ? token0Out : 0
            this.tallyAsset[asset].token1Out += !isNaN(token1Out) ? token1Out : 0
        }
    }

    updateAssetERC20LiquidityPairIssuance(asset, issuance) {
        if (this.init_asset(asset, paraTool.assetTypeERC20LiquidityPair, paraTool.assetSourceOnChain, "updateAssetERC20LiquidityPairIssuance")) {
            this.tallyAsset[asset].issuance = issuance;
        }
    }

    updateAssetMetadata(asset, metadata, assetType = paraTool.assetTypeToken, assetSource = paraTool.assetSourceOnChain) {
        if (this.debugLevel >= paraTool.debugVerbose) console.log(`[${this.chainParser.parserBlockNumber}] updateAssetMetadata asset=${asset}, assetType=${assetType}`)
        if (this.init_asset(asset, assetType, paraTool.assetSourceOnChain, "updateAssetMetadata")) { // add currencyID ? // not sure about the source type..
            this.tallyAsset[asset].metadata = metadata;
        }
    }

    updateAssetNFTTokenMetadata(asset, nftClass, tokenID, holder, free, metadata, tokenURI = "") {
        if (this.init_asset(asset, paraTool.assetTypeNFTToken, paraTool.assetSourceOnChain, "updateAssetNFTTokenMetadata")) {
            this.tallyAsset[asset].nftClass = nftClass;
            this.tallyAsset[asset].tokenID = tokenID;
            this.tallyAsset[asset].holder = holder;
            this.tallyAsset[asset].free = free;
            this.tallyAsset[asset].tokenURI = tokenURI;
            this.tallyAsset[asset].metadata = metadata;
        }
    }

    updateAssetNFTClassMetadata(asset, metadata, creator, deposit) {
        if (this.init_asset(asset, paraTool.assetTypeNFT, paraTool.assetSourceOnChain, "updateAssetNFTClassMetadata")) {
            this.tallyAsset[asset].metadata = metadata;
            this.tallyAsset[asset].creator = creator;
            this.tallyAsset[asset].deposit = deposit;
        }
    }

    updateAssetLiquidityPairIssuance(asset, issuance) {
        if (this.init_asset(asset, paraTool.assetTypeLiquidityPair, paraTool.assetSourceOnChain, "updateAssetLiquidityPairIssuance")) {
            this.tallyAsset[asset].issuance = issuance;
        }
    }

    async updateAddressExtrinsicStorage(address, extrinsicID, extrinsicHash, family, rec, ts, finalized) {
        if (address == undefined || typeof address != "string" || extrinsicID == undefined) {
            return;
        }
        let k = `${address}#${extrinsicHash}`;
        let x = JSON.stringify(rec);
        let eventID = (rec.eventID != undefined) ? rec.eventID : `${this.chainID}-${extrinsicID}`
        let columnfamily = family;
        switch (family) {
            case "feed": //feed:extrinsicHash#chainID-extrinsicID
            case "feedtransfer": //feedtransfer:extrinsicHash#eventID
                if (!finalized) {
                    columnfamily = family + "unfinalized";
                }
                break;
            case "feedxcm": //feedxcm:extrinsicHash#chainID-extrinsicID-transferIndex
                let transferIndex = (rec.transferIndex != undefined) ? rec.transferIndex : 0
                eventID = `${this.chainID}-${extrinsicID}-${transferIndex}` // to support multi-transfer case
                break;
            case "feedcrowdloan": //feedcrowdloan:extrinsicHash#eventID
            case "feedreward": //feedreward:extrinsicHash#eventID
                if (!finalized) {
                    return;
                }
                break;
        }

        console.log("updateAddressExtrinsicStorage", k, columnfamily);
	let vals = ["data", "ts"];
        await this.upsertSQL({
            "table": "addressextrinsic",
            "keys": ["address", "extrinsicID", "eventID", "family"],
            "vals": vals,
            "data": [`('${address}', '${extrinsicID}', '${eventID}', '${columnfamily}', '${ts}', ${mysql.escape(x)})`],
            "replace": vals
        });
    }

    validAssetState(s, max = 1000000000) {
        if (s == undefined) {
            return (false);
        }
        if (!s) {
            return (false);
        }
        if (s.free !== undefined && (s.free > max)) {
            return (false);
        }
        if (s.miscFrozen !== undefined && (s.miscFrozen > max)) {
            return (false);
        }
        if (s.frozen !== undefined && (s.frozen > max)) {
            return (false);
        }
        if (s.reserved !== undefined && (s.reserved > max)) {
            return (false);
        }
        return (true);
    }

    updateAddressStorage(account, assetChain, section, newState, ts = false, bn = false) {
        if (!ts) {
            console.log("WARNING: updateAddressStorage-MISSING TS", account, assetChain, section);
            return;
        }
        if (!typeof assetChain == 'string') {
            console.log("WARNING: updateAddressStorage-assetChain is not string", account, assetChain, section);
            return;
        }

        let [asset, chainID] = paraTool.parseAssetChain(assetChain);
        if (chainID == undefined) {
            console.log("WARNING: updateAddressStorage-MISSING chainID", account, assetChain, section);
            return;
        }
        if (!this.validAddress(account)) {
            if (this.debugLevel >= paraTool.debugErrorOnly) console.log("invalid acct!!!", asset, account, section, newState, `update=${this.numUpdated}`)
            return (false);
        }

        if (!this.validAssetState(newState)) {
            return (false);
        }
        // add blocktime (presumed correct) + bn for debugging (chainID is in assetChain)
        if (ts && newState.ts == undefined) {
            newState.ts = ts;
        }
        if (bn && newState.bn == undefined) {
            newState.bn = bn;
        }
        // add index source for debugging
        newState.source = this.hostname;
        newState.genTS = this.getCurrentTS();

        let accKey = account.toLowerCase();

        // record the assetholder
        this.updateAssetHolder(assetChain, accKey, bn, newState);

        // encodeAssetChain turns : into ~~
        let assetChainEncoded = paraTool.encodeAssetChain(assetChain)
        console.log("updateAddressStorage", accKey, assetChainEncoded, ts, rec, JSON.stringify(newState))

        // ex: {"Token":"KSM"}#2#0x000b3563
        let historyKey = paraTool.make_addressHistory_rowKey(accKey, ts)
        // The above enables access to an account history for all assets like this:
        // 1. For all assetChains, get "realtime" columns -- each column will have the LATEST state of the account's holding of assetChain, eg {"Token":"KSM"}#2
        // 2. For each assetChain, HISTORICAL info can be obtained with a prefix read  ${address}#{"Token":"KSM"}#2#0x12344321 ...
        //  where each cell will be specific time and it is in reverse chronilogical order
        return (true);
    }

    // getSpecVersionMetadata returns a cached metadata object OR fetches from SQL table OR does a RPC call and updates this.storageKeys using the "pallets"
    async getSpecVersionMetadata(chain, specVersion, blockHash = false, bn = 0) {
        let chainID = chain.chainID;
        let updateChainPalletStorage = (this.getCurrentTS() - chain.lastUpdateStorageKeysTS > 86400 * 3);
        if (this.metadata[specVersion]) return (this.metadata[specVersion]);
        let sql = `select metadata, specVersion from specVersions where chainID = '${chainID}' and specVersion = ${specVersion} limit 1`;
        var metadataRecs = await this.poolREADONLY.query(sql)
        let metadata = false;
        if (metadataRecs.length == 0 || !(metadataRecs[0].metadata.length > 0)) {
            let chainID = chain.chainID;
            let metadataRaw = blockHash ? await this.api.rpc.state.getMetadata(blockHash) : await this.api.rpc.state.getMetadata();
            metadata = metadataRaw.asV14.toJSON();
            let metadataString = JSON.stringify(metadata);
            console.log("getSpecVersionMetadata: fetch metadata from rpc", "chainID", chainID, "specVersion", specVersion, "len(metadataString)", metadataString.length);
            if (await this.update_spec_version(chainID, specVersion)) {}
            await this.upsertSQL({
                "table": "specVersions",
                "keys": ["chainID", "specVersion"],
                "vals": ["metadata"],
                "data": [`('${chainID}', '${specVersion}', ${mysql.escape(metadataString)} )`],
                "replace": ["metadata"]
            });
            this.metadata[specVersion] = metadata;
        } else {
            console.log("getSpecVersionMetadata: fetch metadata from db", sql);
            metadata = JSON.parse(metadataRecs[0].metadata);
            this.metadata[specVersion] = metadata;
        }

        var pallets = metadata.pallets;
        /*  Example: {
          name: 'Balances',
          storage: { prefix: 'Balances', items: [Array] },
          calls: { type: '210' },
          events: { type: '41' },
          constants: [ [Object], [Object], [Object] ],
          errors: { type: '343' },
          index: '10'
        }, */
        this.storageKeys = {};
        let sks = [];
        for (const pallet of pallets) {
            var palletName = pallet.name; // Tokens
            var calls = pallet.calls;
            var events = pallet.events;
            var constants = pallet.constants;
            var errors = pallet.errors;
            var storage = pallet.storage;
            var prefix = pallet.prefix;
            if (storage && storage.items) {
                for (const item of storage.items) {
                    let type0 = JSON.stringify(item.type);
                    let modifier = item.modifier;
                    let fallback = item.fallback;
                    let storageName = item.name;
                    let docs = item.docs.join(" ").trim();
                    let storageKey = paraTool.twox_128(palletName) + paraTool.twox_128(storageName);
                    this.storageKeys[storageKey] = {
                        palletName,
                        storageName
                    };
                    if (updateChainPalletStorage) {
                        sks.push(`('${palletName}', '${storageName}', '${chainID}', '${storageKey}', ${mysql.escape(modifier)}, ${mysql.escape(type0)}, ${mysql.escape(fallback)}, ${mysql.escape(docs)}, Now())`)
                    }
                }
            }
        }
        if (sks.length > 0) {
            // add potentially new chainPalletStorage records and record that we have done so
            await this.upsertSQL({
                "table": `chainPalletStorage`,
                "keys": ["palletName", "storageName"],
                "vals": ["chainID", "storageKey", "modifier", "type", "fallback", "docs", "lastUpdateDT"],
                "data": sks,
                "replace": ["chainID", "storageKey", "modifier", "type", "fallback", "docs", "lastUpdateDT"]
            });
            let sql = `update chain set lastUpdateStorageKeysTS = UNIX_TIMESTAMP(Now()) where chainID = '${chainID}'`
            this.batchedSQL.push(sql);
            await this.update_batchedSQL()
        }
        return (this.metadata[specVersion]);
    }

    async flush(ts = false, lastBlockNumber = 1, isFullPeriod = false, isTip = false) {
        await this.flushProxy()
        await this.flushWasmContracts()
        await this.flush_evmcontractMap()
        await this.flushXCM(isTip);
        await this.flushCrowdloans()
        //await this.flush_assets(ts, lastBlockNumber, isFullPeriod, isTip);
       await this.flushMultisig();
        await this.flushAssetHolder();
        await this.update_batchedSQL()
        await this.dump_xcm_messages()
        await this.dump_recent_activity()
        await this.dump_addressBalanceRequest();
    }

    async flushMultisig() {
        let multisigAccounts = []
        for (const k of Object.keys(this.multisigMap)) {
            let m = this.multisigMap[k]
            let r = `('${m.multisigAddress}','${m.threshold}', '${m.signatories.join('|')}', '${m.signatorycnt}')`
            multisigAccounts.push(r)
        }
        if (this.debugLevel >= paraTool.debugInfo) console.log(`flushMultisig recs`, multisigAccounts)
        this.multisigMap = {};
        // --- multiaccount no update
        await this.upsertSQL({
            "table": `multisigaccount`,
            "keys": ["address"],
            "vals": ["threshold", "signatories", "signatorycnt"],
            "data": multisigAccounts,
            "replace": ["threshold", "signatories", "signatorycnt"],
        });
    }

    async flushWasmContracts() {
        let wasmCodes = []
        let wasmContracts = []
        let btHashes_rows = [];
        let btRealtime_rows = [];
        for (const k of Object.keys(this.wasmContractMap)) {
            let w = this.wasmContractMap[k]
            if (w.withCode) {
                //["codeHash", "chainID"] + ["extrinsicHash", "extrinsicID", "wasm", "codeStoredBN", "codeStoredTS", "storer"]
                let c = `('${w.codeHash}', '${w.chainID}', '${w.extrinsicHash}', '${w.extrinsicID}', '${w.code}', '${w.blockNumber}', '${w.blockTS}', '${w.deployer}')`
                wasmCodes.push(c)
                let d = {
                    codeHash: w.codeHash,
                    // contractType: "TODO",
                    chainID: w.chainID,
                    extrinsicHash: w.extrinsicHash,
                    extrinsicID: w.extrinsicID,
                    codeStoredBN: w.blockNumber,
                    codeStoredTS: w.blockTS,
                    deployer: w.deployer,
                }
                this.add_index_metadata(d);
                this.push_rows_related_keys("wasmcode", w.chainID.toString(), btHashes_rows, w.codeHash, d)
            }
            //["address", "chainID"] + ["extrinsicHash", "extrinsicID", "instantiateBN", "codeHash", "constructor", "salt", "blockTS", "deployer"]
            let t = `('${w.contractAddress}', '${w.chainID}', '${w.extrinsicHash}', '${w.extrinsicID}', '${w.blockNumber}', '${w.codeHash}', '${w.constructor}', '${w.salt}', '${w.blockTS}', '${w.deployer}')`
            wasmContracts.push(t)

            // write u = { address, chainID, codeHash, blockTS, deployer, ... }  to btRealtime wasmcontract:${chainID}
            let u = {
                address: w.contractAddress,
                chainID: w.chainID,
                extrinsicHash: w.extrinsicHash,
                extrinsicID: w.extrinsicID,
                instantiateBN: w.blockNumber,
                codeHash: w.codeHash,
                constructor: w.constructor,
                salt: w.salt,
                blockTS: w.blockTS,
                deployer: w.deployer,
            }
            this.add_index_metadata(u);
            this.push_rows_related_keys("wasmcontract", w.chainID.toString(), btRealtime_rows, w.contractAddress, u)
        }
        if (this.debugLevel >= paraTool.debugInfo) console.log(`flushWasmContracts wasmCodes`, wasmCodes)
        if (this.debugLevel >= paraTool.debugInfo) console.log(`flushWasmContracts wasmContracts`, wasmContracts)
        this.wasmContractMap = {};

        // --- multiaccount no update
        let sqlDebug = true
        let wasmCodeVal = ["extrinsicHash", "extrinsicID", "wasm", "codeStoredBN", "codeStoredTS", "storer"]
        await this.upsertSQL({
            "table": `wasmCode`,
            "keys": ["codeHash", "chainID"],
            "vals": wasmCodeVal,
            "data": wasmCodes,
            "replace": wasmCodeVal,
        }, sqlDebug);

        let wasmContractVal = ["extrinsicHash", "extrinsicID", "instantiateBN", "codeHash", "constructor", "salt", "blockTS", "deployer"]
        await this.upsertSQL({
            "table": `contract`,
            "keys": ["address", "chainID"],
            "vals": wasmContractVal,
            "data": wasmContracts,
            "replace": wasmContractVal,
        }, sqlDebug);

    }

    async flushProxy() {
        let proxyAccounts = []
        for (const k of Object.keys(this.proxyMap)) {
            let p = this.proxyMap[k]
            let isRemoved = (p.status == 'removed') ? 1 : 0
            let r = `('${p.chainID}', '${p.address}', '${p.delegate}', '${p.proxyType}', '${p.delay}', '${isRemoved}', '${p.blockNumber}', '${p.blockNumber}')`
            proxyAccounts.push(r)
        }
        if (this.debugLevel >= paraTool.debugInfo) console.log(`flushProxy recs`, proxyAccounts)
        this.proxyMap = {};
        // --- multiaccount no update
        await this.upsertSQL({
            "table": `proxyaccount`,
            "keys": ["chainID", "address", "delegate"],
            "vals": ["proxyType", "delay", "removed", "lastUpdateBN", "lastCrawlBN"],
            "data": proxyAccounts,
            "lastUpdateBN": ["proxyType", "delay", "removed", "lastUpdateBN", "lastCrawlBN"]
        }, true);
    }

    async flushAssetHolder() {
        // flush assetholders
        let assetholderKeys = Object.keys(this.assetholder)
        let assetholders = [];
        let assetholderscrawl = [];
        for (let i = 0; i < assetholderKeys.length; i++) {
            let assetChainHolder = assetholderKeys[i];
            let [blockNumber, lastState] = this.assetholder[assetChainHolder];
            let [asset, chainID, holder] = this.parseAssetChainHolder(assetChainHolder);
            let accKey = holder.toLowerCase();
            if (this.validAssetState(lastState)) {
                let free = lastState.free ? lastState.free : 0;
                let reserved = lastState.reserved ? lastState.reserved : 0;
                let miscFrozen = lastState.miscFrozen ? lastState.miscFrozen : 0;
                let frozen = lastState.frozen ? lastState.frozen : 0;
                if (free < 10 ** 32) {
                    let t = "(" + [`'${asset}'`, `'${this.chainID}'`, `'${accKey}'`, `'${blockNumber}'`, `'${blockNumber}'`, mysql.escape(JSON.stringify(lastState)), `'${free}'`, `'${reserved}'`, `'${miscFrozen}'`, `'${frozen}'`].join(",") + ")";
                    if (this.validAsset(asset, this.chainID, "assetholder", t)) {
                        assetholders.push(t);
                    }
                }
            } else {
                // if lastState == false that means we are (a) in a EVM chain  (b) with isTip = false  (c) with an ERC20 asset and (d) we know it should be updated, but we are not going to get the state.
                // However, we would like to record in assetholder${chainID} that this asset-holder combination SHOULD be covered
                let t = "(" + [`'${asset}'`, `'${this.chainID}'`, `'${accKey}'`, `'${blockNumber}'`].join(",") + ")";
                assetholderscrawl.push(t);
            }
        }
        this.assetholder = {};
        // --- assetholder
        await this.upsertSQL({
            "table": `assetholder${this.chainID}`,
            "keys": ["asset", "chainID"],
            "vals": ["holder", "lastUpdateBN", "lastCrawlBN", "lastState", "free", "reserved", "miscFrozen", "frozen"],
            "data": assetholders,
            "lastUpdateBN": ["free", "reserved", "miscFrozen", "frozen", "lastUpdateBN", "lastCrawlBN", "lastState"]
        });

        // --- assetholder
        if (assetholderscrawl.length > 0) {
            await this.upsertSQL({
                "table": `assetholder${this.chainID}`,
                "keys": ["asset", "chainID"],
                "vals": ["holder", "lastUpdateBN"],
                "data": assetholderscrawl,
                "lastUpdateBN": ["lastUpdateBN"]
            });
        }

    }

    async insertAccountRealtime(address, assetChain, ts, data) {
        console.log("insertAccountRealtime", address, assetChain, ts, data);
        // TODO
    }
    /* 
create table hashes (
hash varchar(67),
finalized tinyint default 0, 
ts int default 0,
data mediumblob default null,
primary key (hash)
);
*/
    async insertHash(hash, data, ts, finalized) {
        //console.log("insertHash", hash, ts, data);
	let f = finalized ? 1 : 0
	let out = `('${hash}', '${ts}', ${mysql.escape(data)}, '${f}')`
	await this.upsertSQL({
            "table": "hashes",
            "keys": ["hash"], 
            "vals": ["ts", "data", "finalized"],
            "data": [out],
            "replace": ["data", "finalized"]
        });
    }


    // write historyMap to tblHistory
    async flush_historyMap() {
        let batchSize = 512;
        try {
            let [tblName, tblHistory] = this.get_btTableHistory()
            let rows = [];
            for (const historyKey of Object.keys(this.historyMap)) {
                let r = {
                    key: historyKey,
                    data: {
                        history: this.historyMap[historyKey] // already in string form
                    }
                }
                rows.push(r);
                if (rows.length > batchSize) {
                    await this.insertHistory(rows);
                    rows = [];
                }
            }
            if (rows.length > 0) {
                await this.insertHistory(rows);
            }
            this.historyMap = {}
        } catch (err) {
            this.log_indexing_error(err, "flush_historyMap");
        }
    }

    clip_string(inp, maxLen = 64) {
        if (inp == undefined) {
            return "";
        }
        if (inp.length < maxLen) {
            return (inp);
        }
        return (inp.substring(0, maxLen));
    }

    validXcmSymbol(xcmSymbol, chainID, ctx, o) {
        if (xcmSymbol == false || (typeof xcmSymbol == "string" && xcmSymbol.includes("0x") && (chainID == paraTool.chainIDKarura || chainID == paraTool.chainIDAcala))) {
            let err = `InvalidAsset ${assetKey}`
            this.log_indexing_error(err, "validXCMSymbol", {
                "ctx": ctx,
                "o": o
            })
            return (false);
        } else {
            return true
        }
    }

    validAsset(assetKey, chainID, ctx, o) {
        if (typeof assetKey == "string" && assetKey.includes("0x") && (chainID == paraTool.chainIDKarura || chainID == paraTool.chainIDAcala)) {
            let err = `InvalidAsset ${assetKey}`
            this.log_indexing_error(err, "validAsset", {
                "ctx": ctx,
                "o": o
            })
            return (false);
        } else {
            return true
        }
    }

    validDouble(obj, ctx, o, flds = ['low', 'high', 'open', 'close', 'lp0', 'lp1']) {
        for (const fld of flds) {
            let val = obj[fld]
            if (val != undefined && val >= 1e+308) {
                let err = `InvalidDouble ${fld}=${val}`
                this.log_indexing_warn(err, "InvalidDouble", {
                    "ctx": ctx,
                    "o": o
                })
                if (this.debugLevel >= paraTool.debugNoLog) console.log(`InvalidDecimal ${fld} ${val}`, o)
                return (false);
            }
        }
        return true
    }

    validDecimal(obj, ctx, o, flds = ['total_volumes', 'token0Volume', 'token1Volume', 'debitExchangeRate', 'supplyExchangeRate', 'borrowExchangeRate']) {
        for (const fld of flds) {
            let val = obj[fld]
            if (val != undefined && val >= 1e+18) {
                let err = `InvalidDecimal ${fld}=${val}`
                this.log_indexing_warn(err, "validDecimal", {
                    "ctx": ctx,
                    "o": o
                })
                if (this.debugLevel >= paraTool.debugNoLog) console.log(`InvalidDecimal ${fld} ${val}`, o)
                return (false);
            }
        }
        return true
    }

    updateMultisigMap(m, caller = false) {
        let multisigAddr = m.multisigAddress
        if (multisigAddr != undefined) {
            this.multisigMap[multisigAddr] = m
        }
        if (caller) {
            console.log(`${caller} add multisig`, this.multisigMap[multisigAddr]);
        }
    }

    updateProxyMap(p, caller = false) {
        let pKey = `${p.chainID}_${p.address}_${p.delegate}`
        if (p.address != undefined && p.delegate != undefined) {
            this.proxyMap[pKey] = p
        }
        if (caller) {
            console.log(`${caller} update proxyRec`, this.proxyMap[pKey]);
        }
    }

    async flushXCM(isTip = false) {
        // flush xcmtransfer
        let xcmtransferKeys = Object.keys(this.xcmtransfer)
        if (xcmtransferKeys.length > 0) {
            let xcmtransfers = [];
            let numXCMTransfersOut = {}
            for (let i = 0; i < xcmtransferKeys.length; i++) {
                let r = this.xcmtransfer[xcmtransferKeys[i]];
                if (r.innerCall == undefined && (r.xcmSymbol && !this.validXcmSymbol(r.xcmSymbol, r.chainID, "xcmtransfer", r))) {
                    console.log(`invalid asset`, r.xcmSymbol, r.chainID, "xcmtransfer", r)
                } else {
                    let innerCall = (r.innerCall) ? `'${r.innerCall}'` : `NULL`
                    let xcmInteriorKey = (r.xcmInteriorKey != undefined) ? `${mysql.escape(r.xcmInteriorKey)}` : `NULL`
                    let xcmSymbol = (r.xcmSymbol) ? `${mysql.escape(r.xcmSymbol)}` : `NULL`
                    let xcmType = (r.xcmType != undefined) ? `'${r.xcmType}'` : 'xcmtransfer'
                    let pendingXcmInfoStr = (r.xcmInfo != undefined) ? JSON.stringify(r.xcmInfo) : false
                    let pendingXcmInfoBlob = (pendingXcmInfoStr != false) ? mysql.escape(pendingXcmInfoStr) : 'NULL'

                    //["extrinsicHash", "extrinsicID", "transferIndex", "xcmIndex"]
                    //["chainID", "chainIDDest", "blockNumber", "fromAddress", "symbol", "sourceTS", "amountSent", "relayChain", "paraID", "paraIDDest", "destAddress", "sectionMethod", "incomplete", "isFeeItem", "msgHash", "sentAt", "xcmInteriorKey"]
                    let t = "(" + [`'${r.extrinsicHash}'`, `'${r.extrinsicID}'`, `'${r.transferIndex}'`, `'${r.xcmIndex}'`,
                        `'${r.chainID}'`, `'${r.chainIDDest}'`, `'${r.blockNumber}'`, `'${r.fromAddress}'`, xcmSymbol, `'${r.sourceTS}'`, `'${r.amountSent}', '${r.relayChain}', '${r.paraID}', '${r.paraIDDest}', '${r.destAddress}', '${r.sectionMethod}', '${r.incomplete}', '${r.isFeeItem}', '${r.msgHash}', '${r.sentAt}'`, xcmInteriorKey, innerCall, xcmType, pendingXcmInfoBlob
                    ].join(",") + ")";
                    xcmtransfers.push(t);
                    if (numXCMTransfersOut[r.blockNumber] == undefined) {
                        numXCMTransfersOut[r.blockNumber] = 1;
                    } else {
                        numXCMTransfersOut[r.blockNumber]++;
                    }
                }
            }
            let sqlDebug = false
            this.xcmtransfer = {};
            await this.upsertSQL({
                "table": "xcmtransfer",
                "keys": ["extrinsicHash", "extrinsicID", "transferIndex", "xcmIndex"],
                "vals": ["chainID", "chainIDDest", "blockNumber", "fromAddress", "symbol", "sourceTS", "amountSent", "relayChain", "paraID", "paraIDDest", "destAddress", "sectionMethod", "incomplete", "isFeeItem", "msgHash", "sentAt", "xcmInteriorKey", "innerCall", "xcmType", "pendingXcmInfo"],
                "data": xcmtransfers,
                "replace": ["chainID", "chainIDDest", "blockNumber", "fromAddress", "symbol", "sourceTS", "amountSent", "relayChain", "paraID", "paraIDDest", "destAddress", "sectionMethod", "incomplete", "isFeeItem", "msgHash", "sentAt", "xcmInteriorKey", "innerCall", "xcmType", "pendingXcmInfo"]
            }, sqlDebug);

            let out = [];
            for (const blockNumber of Object.keys(numXCMTransfersOut)) {
                out.push(`('${blockNumber}', '${numXCMTransfersOut[blockNumber]}')`);
            }
            if (out.length > 0) {
                let vals = ["numXCMTransfersOut"];
                await this.upsertSQL({
                    "table": `block${this.chainID}`,
                    "keys": ["blockNumber"],
                    "vals": vals,
                    "data": out,
                    "replace": vals
                });
            }
        }

        let xcmtransferdestcandidateKeys = Object.keys(this.xcmtransferdestcandidate)
        //console.log(`xcmtransferdestcandidateKeys`, xcmtransferdestcandidateKeys)
        if (xcmtransferdestcandidateKeys.length > 0) {
            let xcmtransferdestcandidates = [];
            for (let i = 0; i < xcmtransferdestcandidateKeys.length; i++) {
                let r = this.xcmtransferdestcandidate[xcmtransferdestcandidateKeys[i]];
                // ["chainIDDest", "eventID"] + ["fromAddress", "extrinsicID", "blockNumberDest", "asset", "destTS", "amountReceived", "rawAsset", "sentAt", "msgHash", "addDT", "nativeAssetChain", "xcmInteriorKey"
                //let nativeAssetChain = (r.nativeAssetChain != undefined) ? `'${r.nativeAssetChain}'` : `NULL`
                let xcmInteriorKey = (r.xcmInteriorKey != undefined) ? `'${r.xcmInteriorKey}'` : `NULL`
                //["chainIDDest", "eventID"]
                //["fromAddress", "extrinsicID", "blockNumberDest", "symbol", "destTS", "amountReceived", "relayChain", "sentAt", "msgHash", "addDT", "xcmInteriorKey"]
                let t = "(" + [`'${r.chainIDDest}'`, `'${r.eventID}'`, `'${r.fromAddress}'`, `'${r.extrinsicID}'`, `'${r.blockNumberDest}'`, `'${r.xcmSymbol}'`, `'${r.destTS}'`, `'${r.amountReceived}'`, `'${r.relayChain}'`, `'${r.sentAt}'`, `'${r.msgHash}'`, `Now()`, xcmInteriorKey].join(",") + ")";
                if ((r.xcmSymbol) && this.validXCMSymbol(r.xcmSymbol, r.chainIDDest, "xcmtransfer", r)) {
                    xcmtransferdestcandidates.push(t);
                } else {
                    console.log("--INVALID dest candidate", r);
                }
            }
            this.xcmtransferdestcandidate = {};
            try {
                // these events we can't say for sure without matching to recent sends
                if (xcmtransferdestcandidates.length > 0) {
                    await this.upsertSQL({
                        "table": "xcmtransferdestcandidate",
                        "keys": ["chainIDDest", "eventID"],
                        "vals": ["fromAddress", "extrinsicID", "blockNumberDest", "symbol", "destTS", "amountReceived", "relayChain", "sentAt", "msgHash", "addDT", "xcmInteriorKey"],
                        "data": xcmtransferdestcandidates,
                        "replace": ["fromAddress", "extrinsicID", "blockNumberDest", "symbol", "destTS", "amountReceived", "relayChain", "sentAt", "msgHash", "addDT", "xcmInteriorKey"]
                    });
                }
            } catch (err0) {
                console.log(err0);
            }
        }

    }

    fixOutgoingUnknownSentAt(sentAt) {
        let xcmKeys = Object.keys(this.xcmmsgSentAtUnknownMap)
        for (const xcmKey of xcmKeys) {
            let xcmMsg = this.xcmmsgSentAtUnknownMap[xcmKey]
            xcmMsg.sentAt = sentAt
            //if (this.debugLevel >= paraTool.debugInfo) console.log(`Adding sentAt ${sentAt} [${xcmKey}]`)
            this.updateXCMMsg(xcmMsg, true)
        }
        this.xcmmsgSentAtUnknownMap = {}
    }


    //this is the xcmmessages table
    updateXCMMsg(xcmMsg, overwrite = false) {
        //for out going msg wait till we have all available info

        let direction = (xcmMsg.isIncoming) ? 'i' : 'o'
        if (direction == 'o' && xcmMsg.msgType != 'dmp' && !overwrite) {
            //sentAt is theoretically unknown for ump/hrmp..
            let xcmKey = `${xcmMsg.msgHash}-${xcmMsg.msgType}-${direction}`
            if (this.debugLevel >= paraTool.debugVerbose) console.log(`xcmmsg SentAt Unknown [${xcmKey}]`)
            this.xcmmsgSentAtUnknownMap[xcmKey] = xcmMsg
        } else {
            let xcmKey = `${xcmMsg.msgHash}-${xcmMsg.msgType}-${xcmMsg.sentAt}-${direction}`
            if (this.xcmTrailingKeyMap[xcmKey] == undefined) {
                this.xcmTrailingKeyMap[xcmKey] = {
                    chainID: xcmMsg.chainID,
                    chainIDDest: xcmMsg.chainIDDest,
                    blockNumber: xcmMsg.blockNumber,
                    msgHex: xcmMsg.msgHex,
                    msgHash: xcmMsg.msgHash,
                    msgStr: xcmMsg.msgStr,
                    isFresh: true,
                    isPreemptive: true,
                    matchable: true,
                }
                //console.log(`updateXCMMsg ${Object.keys(this.xcmTrailingKeyMap)}`)
                this.xcmmsgMap[xcmKey] = xcmMsg //TODO: MK review

                //if (this.debugLevel >= paraTool.debugInfo) console.log(`updateXCMMsg adding ${xcmKey}`)
                //if (this.debugLevel >= paraTool.debugTracing) console.log(`updateXCMMsg new xcmKey ${xcmKey}`, xcmMsg)
            } else {
                /*
                let trailingXcm = this.xcmTrailingKeyMap[xcmKey]
                if (trailingXcm.canUpdate === true){
                    trailingXcm.blockNumber = xcmMsg.blockNumber, //we observe the same "msgHash" at new blockNum
                    trailingXcm.canUpdate = false
                     this.xcmTrailingKeyMap[xcmKey] = trailingXcm
                     if (this.debugLevel >= paraTool.debugInfo) console.log(`updateXCMMsg valid duplicates! ${xcmKey}`, trailingXcm)
                }
                */
                //if (this.debugLevel >= paraTool.debugInfo) console.log(`updateXCMMsg duplicates! ${xcmKey}`)
            }
        }
    }

    addWasmContract(wasmContract, withCode = false) {
        //if (this.debugLevel >= paraTool.debugInfo) console.log(`addWasmContract withCode=${withCode}`)
        this.wasmContractMap[wasmContract.extrinsicHash] = wasmContract
    }

    updateXCMChannelMsg(xcmChannelMsg, blockNumber, blockTS) {
        let xcmID = xcmChannelMsg.msgIndex
        if (this.xcmeventsMap[xcmID] == undefined) {
            xcmChannelMsg.blockNumber = blockNumber
            xcmChannelMsg.blockTS = blockTS
            this.xcmeventsMap[xcmID] = xcmChannelMsg
            if (this.debugLevel >= paraTool.debugInfo) console.log(`updateXCMChannelMsg add ${xcmID}`, xcmChannelMsg)
        } else {
            if (this.debugLevel >= paraTool.debugTracing) console.log(`updateXCMChannelMsg skip ${xcmID}`, xcmChannelMsg)
        }
    }

    check_refintegrity_xcm_signal(symbol, parser = "NA", ctx = "", obj = null) {
        if (!symbol) return (null)
        let errorcase = []
        let errorMsg = []
        let chainIDDest = this.chainID //because we are looking from receiver's perspective
        let relayChain = this.relayChain
        let sourceBlocknumber = this.chainParser.parserBlockNumber
        let sourceTS = this.chainParser.parserTS
        let symbolRelayChain = paraTool.makeAssetChain(symbol, relayChain);
        let xcmAssetInfo = this.getXcmAssetInfoBySymbolKey(symbolRelayChain)
        let targetedXcmInteriorKey = (xcmAssetInfo == false || xcmAssetInfo == undefined || xcmAssetInfo.xcmInteriorKey == undefined) ? false : xcmAssetInfo.xcmInteriorKey
        if (this.debugLevel >= paraTool.debugInfo) console.log(`*** check_refintegrity_xcm_signal symbol=${symbol}, relayChain=${relayChain}, chainIDDest=${chainIDDest}, symbolRelayChain=${symbolRelayChain}, targetedXcmInteriorKey=${targetedXcmInteriorKey}, obj=${JSON.stringify(obj)}`)
        if (targetedXcmInteriorKey == false) {
            errorcase.push('xcmkey')
            errorMsg.push(`xcmkey ERR ${targetedXcmInteriorKey} not found(symbolRelayChain=${symbolRelayChain})`)
        }
        let destinationAsset = this.getChainXCMAssetBySymbol(symbol, relayChain, chainIDDest)
        if (destinationAsset == undefined) {
            errorcase.push('dest')
            errorMsg.push(`destination ERR symbol=${symbol}, relayChain=${relayChain}, chainIDDest=${chainIDDest})`)
        }
        let errorDetected = (errorcase.length > 0) ? true : false
        if (errorDetected) {
            try {
                let objStr = JSON.stringify(obj)
                let violation = {
                    violationType: 'signal',
                    chainID: chainIDDest,
                    chainIDDest: null,
                    parser: parser,
                    caller: ctx,
                    errorcase: errorcase.join('|'),
                    instruction: objStr,
                    instructionHash: paraTool.Blake256FromStr(objStr),
                    sourceBlocknumber: sourceBlocknumber,
                    sourceTS: sourceTS,
                }
                if (errorDetected > 0) {
                    this.logger.error({
                        "op": "check_refintegrity_xcm_signal ERR",
                        "bn": sourceBlocknumber,
                        "ts": sourceTS,
                        "chainID": chainIDDest,
                        symbolRelayChain,
                        parser,
                        ctx,
                        "msg": errorMsg,
                        obj: JSON.stringify(obj),
                        violation: JSON.stringify(violation)
                    })
                }
                if (this.debugLevel >= paraTool.debugErrorOnly) console.log(`check_refintegrity_xcm_signal violation`, violation)
                this.updateXCMViolation(violation, ctx)
            } catch (e) {
                if (this.debugLevel >= paraTool.debugErrorOnly) console.log(`check_refintegrity_xcm_signal error=${e.toString()}`)
            }
        }
        return (targetedXcmInteriorKey);
    }

    check_refintegrity_xcm_symbol(symbol, relayChain, chainID, chainIDDest, parser = "NA", ctx = "", obj = null) {
        if (!symbol) return;
        let errorcase = []
        let errorMsg = []
        let sourceBlocknumber = this.chainParser.parserBlockNumber
        let sourceTS = this.chainParser.parserTS
        let symbolRelayChain = paraTool.makeAssetChain(symbol, relayChain);
        let xcmAssetInfo = this.getXcmAssetInfoBySymbolKey(symbolRelayChain)
        let targetedXcmInteriorKey = (xcmAssetInfo == false || xcmAssetInfo == undefined || xcmAssetInfo.xcmInteriorKey == undefined) ? false : xcmAssetInfo.xcmInteriorKey
        if (this.debugLevel >= paraTool.debugInfo) console.log(`**check_refintegrity_xcm_symbol symbol=${symbol}, relayChain=${relayChain}, chainID=${chainID}, chainIDDest=${chainIDDest}, symbolRelayChain=${symbolRelayChain}, targetedXcmInteriorKey=${targetedXcmInteriorKey}, obj=${JSON.stringify(obj)}`)
        if (targetedXcmInteriorKey == false) {
            errorcase.push('xcmkey')
            errorMsg.push(`xcmkey ERR ${targetedXcmInteriorKey} not found(symbolRelayChain=${symbolRelayChain})`)
        }
        let originationAsset = this.getChainXCMAssetBySymbol(symbol, relayChain, chainID)
        let destinationAsset = this.getChainXCMAssetBySymbol(symbol, relayChain, chainIDDest)
        if (originationAsset == undefined) {
            errorcase.push('source')
            errorMsg.push(`source ERR symbol=${symbol}, relayChain=${relayChain}, chainID=${chainID}`)
        }
        if (destinationAsset == undefined) {
            errorcase.push('dest')
            errorMsg.push(`destination ERR symbol=${symbol}, relayChain=${relayChain}, chainIDDest=${chainIDDest}`)
        }
        let errorDetected = (errorcase.length > 0) ? true : false
        if (errorDetected) {
            try {
                let objStr = JSON.stringify(obj)
                let violation = {
                    violationType: 'symbol',
                    chainID: chainID,
                    chainIDDest: chainIDDest,
                    parser: parser,
                    caller: ctx,
                    errorcase: errorcase.join('|'),
                    instruction: objStr,
                    instructionHash: paraTool.Blake256FromStr(objStr),
                    sourceBlocknumber: sourceBlocknumber,
                    sourceTS: sourceTS,
                }
                if (errorDetected) {
                    this.logger.error({
                        "op": "check_refintegrity_xcm_symbol ERR",
                        "bn": sourceBlocknumber,
                        "ts": sourceTS,
                        "chainID": chainID,
                        "chainIDDest": chainIDDest,
                        symbolRelayChain,
                        parser,
                        ctx,
                        "msg": errorMsg,
                        obj: JSON.stringify(obj),
                        violation: JSON.stringify(violation)
                    })
                }
                if (this.debugLevel >= paraTool.debugErrorOnly) console.log(`check_refintegrity_xcm_symbol violation`, violation)
                this.updateXCMViolation(violation, ctx)
            } catch (e) {
                if (this.debugLevel >= paraTool.debugErrorOnly) console.log(`check_refintegrity_xcm_symbol error=${e.toString()}`)
            }
        }
        return (targetedXcmInteriorKey);
    }

    check_refintegrity_asset(asset, ctx = "", obj = null) {
        let assetChain = paraTool.makeAssetChain(asset, this.chainID);
        if (this.assetInfo[assetChain] == undefined) {
            let parsedAsset = JSON.parse(asset);
            if (parsedAsset.Token) {
                let symbol = parsedAsset.Token;
                let relayChain = paraTool.getRelayChainByChainID(this.chainID);
                let symbolRelayChain = paraTool.makeAssetChain(symbol, relayChain);
                let chain_assetInfo_symbol = this.getChainXCMAssetBySymbol(symbol, relayChain, this.chainID);
                if (chain_assetInfo_symbol && chain_assetInfo_symbol.asset) {
                    this.logger.warn({
                        "op": "check_refintegrity_asset CORRECTED",
                        "chainID": this.chainID,
                        asset,
                        corrected: chain_assetInfo_symbol.asset,
                        ctx,
                        obj: JSON.stringify(obj)
                    })
                    return (chain_assetInfo_symbol.asset);
                }
            }
            this.logger.error({
                "op": "check_refintegrity_asset",
                "chainID": this.chainID,
                asset,
                ctx,
                obj: JSON.stringify(obj)
            })
        }
        return (asset);
    }

    updateXCMTransferStorage(xcmtransfer, isTip, finalized) {
        //console.log(`adding xcmtransfer`, xcmtransfer)
        //!only isXcmTipSafe can get here
        try {
            let errs = []
            if (xcmtransfer.xcmInteriorKey) {
                // check that xcmInteriorKey exists and matches
                let xcmInteriorKey = xcmtransfer.xcmInteriorKey;
                if (this.xcmAssetInfo[xcmInteriorKey] == undefined) {
                    errs.push(`Invalid xcmInteriorKey (${xcmInteriorKey})`);
                } else {
                    let xcmsymbol = this.xcmAssetInfo[xcmInteriorKey].symbol;
                    if (xcmtransfer.xcmSymbol == undefined && xcmsymbol !== undefined) {
                        // NOTE: we are filling in the blanks using xcmInteriorKey here
                        xcmtransfer.xcmSymbol = xcmsymbol
                    }
                    if (xcmsymbol != xcmtransfer.xcmSymbol) {
                        errs.push(`Invalid xcmSymbol (${xcmtransfer.xcmSymbol}, Expected: ${xcmsymbol} from ${xcmInteriorKey}) not found in assetManager.xcmAssetInfo [${Object.keys(this.xcmAssetInfo.length)}]`);
                    }
                }
            }

            if (xcmtransfer.xcmSymbol) {
                // check that symbol~relayChain exists
                let symbolRelayChain = paraTool.makeAssetChain(xcmtransfer.xcmSymbol, xcmtransfer.relayChain);
                let xcmAssetInfo = this.getXcmAssetInfoBySymbolKey(symbolRelayChain)
                if (xcmAssetInfo == undefined) {
                    errs.push(`Invalid symbol relaychain (${symbolRelayChain}) not found in assetManager.xcmSymbolInfo`);
                } else {}
            }

            if (errs.length > 0) {
                console.log(errs);
                this.logger.error({
                    "op": "updateXCMTransferStorage referential integrity checkviolation",
                    "chainID": this.chainID,
                    "errs": errs,
                    "xcmtransfer": xcmtransfer

                })
            }
        } catch (err) {
            console.log(err);
            this.logger.error({
                "op": "updateXCMTransferStorage ERROR",
                "err": err
            })
        }
        this.xcmtransfer[`${xcmtransfer.extrinsicHash}-${xcmtransfer.transferIndex}-${xcmtransfer.xcmIndex}`] = xcmtransfer;
        this.sendManagerMessage(xcmtransfer, "xcmtransfer", finalized);
    }

    // sets up xcmtransferdestcandidate inserts, which are matched to those in xcmtransfer when we writeFeedXCMDest
    // this is send in real time (both unfinalized/finalized)
    updateXCMTransferDestCandidate(candidate, caller = false, isTip = false, finalized = false) {
        //potentially add sentAt here, but it's 2-4
        let eventID = candidate.eventID
        let k = `${candidate.msgHash}-${candidate.amountReceived}` // it's nearly impossible to have collision even dropping the asset
        if (this.xcmtransferdestcandidate[k] == undefined) {
            this.xcmtransferdestcandidate[k] = candidate
            if (caller) {
                if (this.debugLevel >= paraTool.debugInfo) console.log(`${caller} candidate`, this.xcmtransferdestcandidate[k]);
            }
        } else {
            if (this.debugLevel >= paraTool.debugInfo) console.log(`${caller} skip duplicate candidate ${eventID}`, );
        }
        //MK: send xcmtransfer here
        this.sendManagerMessage(candidate, "xcmtransferdestcandidate", finalized);
    }

    // update xcmViolation
    updateXCMViolation(v, caller = false) {
        //potentially add sentAt here, but it's 2-4
        let k = `${v.chainID}-${v.instructionHash}` // instructionHash is meaningless here other than preventing duplication
        if (this.xcmViolation[k] == undefined) {
            this.xcmViolation[k] = v
            if (this.debugLevel >= paraTool.debugInfo) console.log(`add ${caller} xcm violation`, this.xcmViolation[k]);
        }
    }

    // update mpState
    updateMPState(mpState) {
        //potentially add sentAt here, but it's 2-4
        let k = `${mpState.msgHash}-${mpState.bn}` // it's nearly impossible to have collision even dropping the asset
        let [xcmBN, chainID, chainIDDest] = this.getTrailingXcmInfo(mpState.msgHash, mpState.bn)
        mpState.xcmBN = xcmBN
        mpState.chainID = chainID
        mpState.chainIDDest = chainIDDest
        if (this.incomingXcmState[k] == undefined) {
            this.incomingXcmState[k] = mpState
            if (this.debugLevel >= paraTool.debugInfo) console.log(`mpState`, this.incomingXcmState[k]);
        } else {
            if (this.debugLevel >= paraTool.debugInfo) console.log(`skip duplicate ${mpState.eventID}`);
        }
    }

    knownParaID(paraID) {
        return this.paraIDs.includes(paraID);
    }

    async flushCrowdloans() {
        // flush this.crowdloan into "crowdloan"
        let crowdloanKeys = Object.keys(this.crowdloan)
        if (crowdloanKeys.length == 0) return;
        let crowdloans = [];

        for (let i = 0; i < crowdloanKeys.length; i++) {
            let r = this.crowdloan[crowdloanKeys[i]];
            let fromAddress = paraTool.getPubKey(r.account);
            let t = "(" + [`'${r.extrinsicHash}'`, `'${r.extrinsicID}'`, `'${r.chainID}'`,
                `'${r.blockNumber}'`, `'${r.ts}'`, `'${r.section}'`, `'${r.method}'`, `'${fromAddress}'`, `'${r.paraID}'`, `'${r.amount}'`, `${mysql.escape(r.memo)}`, `${mysql.escape(r.remark)}`
            ].join(",") + ")";
            if (!this.knownParaID(r.paraID)) {
                this.readyToCrawlParachains = true;
                console.log("UNKNOWN paraID", r.paraID, "this.paraIDs", this.paraIDs);
                this.logger.warn({
                    "op": "flushCrowdloans-unknown",
                    "newParaID": r.paraID,
                    "chainID": this.chainID
                })
            }
            crowdloans.push(t);
        }
        this.crowdloan = {};
        // --- crowdloan
        let vals = ["extrinsicID", "chainID", "blockNumber", "ts", "section", "method", "fromAddress", "paraID", "amount", "memo", "remark"];
        await this.upsertSQL({
            "table": "crowdloan",
            "keys": ["extrinsicHash"],
            "vals": vals,
            "data": crowdloans,
            "replace": vals
        });
    }

    updateCrowdloanStorage(crowdloan) {
        this.crowdloan[crowdloan.extrinsicHash] = crowdloan;
    }

    async processAssetTypeERC20LiquidityPair(web3Api, chainID, assetChain, ts = false, blockNumber = false, isFullPeriod = false) {
        let [asset, _] = paraTool.parseAssetChain(assetChain);
        let assetInfo = this.tallyAsset[assetChain];
        if (isFullPeriod) {
            let r = {
                low: 0,
                high: 0,
                open: 0,
                close: 0,
                lp0: 0,
                lp1: 0,
                token0In: 0,
                token1In: 0,
                token0Out: 0,
                token1Out: 0,
                token0Volume: 0,
                token1Volume: 0,
                token0Fee: 0,
                token1Fee: 0,
                issuance: 0
            };
            let upd = false;
            let isIncomplete = false;
            if (assetInfo.lpAddress) {
                r.lpAddress = assetInfo.lpAddress // shouldn't be missing here
            }
            let lpAddress = r.lpAddress

            if (assetInfo.issuance !== undefined) {
                r.issuance = assetInfo.issuance;
            }
            if (assetInfo.rat && assetInfo.rat.length > 0) {
                let low = Math.min(...assetInfo.rat);
                let high = Math.max(...assetInfo.rat);
                let open = assetInfo.rat[0];
                let close = assetInfo.rat[assetInfo.rat.length - 1];
                if (!isNaN(low) && !isNaN(high) && !isNaN(open) && !isNaN(close)) {
                    r.low = low
                    r.high = high
                    r.open = open
                    r.close = close
                } else {
                    isIncomplete = true
                    console.log(`${lpAddress} low/high/open/close NOT OK`)
                }
                upd = true;
            }
            if (assetInfo.lp0 && assetInfo.lp0.length > 0) {
                let lp0 = assetInfo.lp0[assetInfo.lp0.length - 1];
                let lp1 = assetInfo.lp1[assetInfo.lp1.length - 1];
                if (!isNaN(lp0) && !isNaN(lp1)) {
                    r.lp0 = lp0
                    r.lp1 = lp1
                } else {
                    isIncomplete = true
                    console.log(`${lpAddress} LP0/LP1 NOT OK`)
                }
                upd = true;
            }
            if (assetInfo.token0In > 0 || assetInfo.token1In > 0) {
                r.token0In = assetInfo.token0In
                r.token1In = assetInfo.token1In
                r.token0Out = assetInfo.token0Out
                r.token1Out = assetInfo.token1Out
                r.token0Volume = assetInfo.token0In
                r.token1Volume = assetInfo.token1In
                r.token0Fee = assetInfo.token0In - assetInfo.token0Out
                r.token1Fee = assetInfo.token1In - assetInfo.token1Out
                upd = true;
            }
            //do a lookup here to fetch total supply of lp issuance
            if (upd && !isIncomplete) {
                let queryBN = (blockNumber) ? blockNumber : 'latest'
                // ethTool rpccall (3)
                var [tokenTotalSupply, lastUpdateBN] = await ethTool.getTokenTotalSupply(web3Api, r.lpAddress, queryBN)
                if (tokenTotalSupply) {
                    r.issuance = tokenTotalSupply
                    r.lastUpdateBN = lastUpdateBN
                }
                this.tallyAsset[assetChain].lp0 = [];
                this.tallyAsset[assetChain].lp1 = [];
                this.tallyAsset[assetChain].rat = [];

                // clear volume tally
                this.tallyAsset[assetChain].token0In = 0;
                this.tallyAsset[assetChain].token1In = 0;
                this.tallyAsset[assetChain].token0Out = 0;
                this.tallyAsset[assetChain].token1Out = 0;
                let state = JSON.stringify(r)
                //(asset, chainID, indexTS, source, open, close, low, high, lp0, lp1, issuance, token0Volume, token1Volume, state )
                let s = `('${r.lpAddress.toLowerCase()}', '${this.chainID}', '${ts}', '${paraTool.assetSourceOnChain}', '${r.open}', '${r.close}', '${r.low}', '${r.high}', '${r.lp0}', '${r.lp1}', '${r.issuance}', '${r.token0Volume}', '${r.token1Volume}', ` + mysql.escape(state) + `)`
                if (this.validAsset(r.lpAddress.toLowerCase(), this.chainID, assetInfo.assetType, s) && this.validDouble(r, assetInfo.assetType, s) && this.validDecimal(r, assetInfo.assetType, s)) {
                    //assetlogLiquidityPairs.push(s)
                    return s
                }
            }
        }
        return false
    }

    async fetchAssetHolderBalances(web3Api, chainID, tokenAddress, tokenDecimal, blockNumber, ts = false) {
        //tokenAddress is checkSumAddr
        let [isXcAsset, assetChain, rawAssetChain] = paraTool.getErcTokenAssetChain(tokenAddress, chainID) // REVIEW -- TODO: the result of this will NOT have 0xfffff... precompile because getErcTokenAssetChain maps from 0xffff.. to xcContractAddress
        let assetholderKeys = Object.keys(this.assetholder)
        let holders = []
        for (let i = 0; i < assetholderKeys.length; i++) {
            let assetChainHolder = assetholderKeys[i];
            let [asset, chainID, holder] = this.parseAssetChainHolder(assetChainHolder);
            if (tokenAddress.toLowerCase() == asset.toLowerCase()) {
                holders.push(holder)
            }
        }
        if (holders.length == 0) return;
        if (isXcAsset) console.log(`***fetchAssetHolderBalances ${tokenAddress} -> ${assetChain} (original:${rawAssetChain})`)
        //console.log(`fetchAssetHolderBalances [${tokenAddress}] [${blockNumber}] holders=${JSON.stringify(holders)}, isXcAsset=${isXcAsset}`)
        let i = 0;
        let n = 0
        let batchSize = 50; // safety check
        while (i < holders.length) {
            let currBatchHolders = holders.slice(i, i + batchSize);
            //console.log(`currBatchHolders#${n}`, currBatchHolders)
            if (currBatchHolders.length > 0) {
                let holderBalances = await ethTool.getTokenHoldersRawBalances(web3Api, tokenAddress, currBatchHolders, tokenDecimal, blockNumber)
                //console.log(`fetchAssetHolderBalances [${tokenAddress}] [${blockNumber}] holderBalances`, holderBalances)
                if (holderBalances && holderBalances.holders) {
                    for (const h of holderBalances.holders) {
                        let newState = {
                            free: h.balance
                        }
                        this.updateAddressStorage(h.holderAddress, assetChain, "fetchAssetHolderBalances", newState, ts, blockNumber)
                    }
                }
                i += batchSize;
                n++
            }
        }
    }

    async processAssetTypeERC20(web3Api, chainID, assetChain, ts = false, blockNumber = false, isFullPeriod = false, isTip = false) {
        // we will update total supply once per index_period
        if (!isTip) {
            return false; // hourly update by other process
        }
        //console.log(`processAssetTypeERC20 tip update [${blockNumber}], assetChain=${assetChain}`);
        let [asset, _] = paraTool.parseAssetChain(assetChain);
        let assetInfo = this.tallyAsset[assetChain];
        var totalSupplyUpdated = false

        if (blockNumber && assetInfo && assetInfo.blockNumber !== undefined && (assetInfo.blockNumber != blockNumber)) {
            // fetch tokensupply update
            // ethTool rpccall (1)
            let [currentTokenSupply, currBN] = await ethTool.getTokenTotalSupply(web3Api, assetInfo.tokenAddress, blockNumber)
            if (currentTokenSupply && blockNumber == currBN) {
                totalSupplyUpdated = true
                assetInfo.totalSupply = currentTokenSupply
                assetInfo.blockNumber = currBN
            }
        }

        let assetKey = assetInfo.tokenAddress.toLowerCase();
        let tokenAddress = assetInfo.tokenAddress
        // if isXcAsset = true, then assetChainStr = {"Token":[currencyID]}~chainID vs rawAssetChainStr 0xffff...~chainID (tokenAddress)
        let [isXcAsset, assetChainStr, rawAssetChainStr] = paraTool.getErcTokenAssetChain(tokenAddress, chainID)
        await this.fetchAssetHolderBalances(web3Api, chainID, tokenAddress, assetInfo.decimal, blockNumber, ts)

        let totalSupply = ethTool.validate_bigint(assetInfo.totalSupply);
        let creatorSql = (assetInfo.creator != undefined) ? `'${assetInfo.creator.toLowerCase()}'` : 'NULL';
        let createdAtTxSql = (assetInfo.createdAtTx != undefined) ? `'${assetInfo.createdAtTx}'` : 'NULL';
        let createDTSql = (assetInfo.createTS != undefined) ? `FROM_UNIXTIME('${assetInfo.createTS}')` : 'NULL'
        let creator = (assetInfo.creator != undefined) ? assetInfo.creator.toLowerCase() : null;
        let createdAtTx = (assetInfo.createdAtTx != undefined) ? assetInfo.createdAtTx : null;
        let lastState = JSON.stringify(assetInfo)
        let isLPToken = (assetInfo.lpInfo != undefined && assetInfo.lpInfo.tokenType == paraTool.assetTypeERC20LiquidityPair) ? true : false

        if (isLPToken) {
            // erc20lp token
            // we update total supply once per index_period
            let lp20TokenInfo = assetInfo.lpInfo
            if (totalSupplyUpdated) {
                let token0Decimals = lp20TokenInfo.token0Decimals
                let token1Decimals = lp20TokenInfo.token1Decimals
                // ethTool rpccall (2)
                var [reserve0, reserve1, blockTimestampLast] = await ethTool.getERC20LiquidityPairRawReserve(web3Api, assetInfo.tokenAddress, blockNumber)
                //update lp0, lp1 issuance once every block
                if (reserve0 && reserve1) {
                    lp20TokenInfo.token0Supply = reserve0 / 10 ** token0Decimals
                    lp20TokenInfo.token1Supply = reserve1 / 10 ** token1Decimals
                    lp20TokenInfo.blockNumber = blockNumber
                    assetInfo.lpInfo = lp20TokenInfo
                    lastState = JSON.stringify(assetInfo)
                }
            }
            let token0 = lp20TokenInfo.token0.toLowerCase();
            let token1 = lp20TokenInfo.token1.toLowerCase();
            var o = `('${assetKey}', '${chainID}', '${paraTool.assetTypeERC20LiquidityPair}', ` + mysql.escape(this.clip_string(assetInfo.name)) + `, ` + mysql.escape(this.clip_string(assetInfo.symbol, 32)) + `, ` + mysql.escape(lastState) + `, '${assetInfo.decimal}', '${totalSupply}', FROM_UNIXTIME('${ts}'), '${blockNumber}', ${createDTSql}, ${creatorSql}, ${createdAtTxSql}, '${token0}', '${token1}', ${lp20TokenInfo.token0Decimals}, ${lp20TokenInfo.token1Decimals}, ${lp20TokenInfo.token0Supply}, ${lp20TokenInfo.token1Supply}, '${lp20TokenInfo.token0Symbol}', '${lp20TokenInfo.token1Symbol}')`;
            if (this.validAsset(assetKey, chainID, assetInfo.assetType, o)) {
                //console.log(`erc20 LP`, o)
                // write { asset, assetType, chainID, token0, token0Symbol, token1, token1Symbol, symbol } to accountrealtime evmcontract:{chainID}
                let lp = {
                    asset: assetKey,
                    assetType: paraTool.assetTypeERC20LiquidityPair,
                    chainID: chainID,
                    assetName: this.clip_string(assetInfo.name),
                    symbol: assetInfo.symbol,
                    decimals: assetInfo.decimal,
                    creator: creator,
                    createdAtTx: createdAtTx,
                    // LP specific info
                    token0: token0,
                    token1: token1,
                    token0Decimals: lp20TokenInfo.token0Decimals,
                    token1Decimals: lp20TokenInfo.token1Decimals,
                }
                this.add_index_metadata(lp);
                this.evmcontractMap[assetKey] = lp;
                return o
                //erc20s.push(o);
            }
        } else {
            // normal erc20 (non-lp token)
            // we will update total supply once per index_period
            //(asset, chainID, assetType, assetName, symbol, lastState, decimals, totalSupply, lastUpdateDT, lastUpdateBN, createDT, creator, createdAtTx, token0, token1, token0Decimals, token1Decimals, token0Supply, token1Supply, token0Symbol, token1Symbol) [token0, token1, token0Decimals, token1Decimals, token0Supply, token1Supply, token0Symbol, token1Symbol] all NULL
            var o = `('${assetKey}', '${chainID}', '${paraTool.assetTypeERC20}', ` + mysql.escape(this.clip_string(assetInfo.name)) + `, ` + mysql.escape(this.clip_string(assetInfo.symbol, 32)) + `, ` + mysql.escape(lastState) + `, '${assetInfo.decimal}', '${totalSupply}', FROM_UNIXTIME('${ts}'), '${blockNumber}', ${createDTSql}, ${creatorSql}, ${createdAtTxSql}, Null, Null, Null, Null, Null, Null, Null, Null)`;
            if (isXcAsset) {
                let [assetK, _] = paraTool.parseAssetChain(assetChainStr)
                o = `('${assetK}', '${chainID}', '${paraTool.assetTypeToken}', ` + mysql.escape(this.clip_string(assetInfo.name)) + `, ` + mysql.escape(this.clip_string(assetInfo.symbol, 32)) + `, ` + mysql.escape(lastState) + `, '${assetInfo.decimal}', '${totalSupply}', FROM_UNIXTIME('${ts}'), '${blockNumber}', ${createDTSql}, ${creatorSql}, ${createdAtTxSql}, Null, Null, Null, Null, Null, Null, Null, Null)`;
            }
            //console.log(`erc20 nonLP, isXcAsset=${isXcAsset}`, o)
            if (this.validAsset(assetKey, chainID, assetInfo.assetType, o)) {
                // write { asset, assetType, chainID, token0, token0Symbol, token1, token1Symbol, symbol }
                let nlp = {
                    asset: assetKey,
                    chainID: chainID,
                    //assetType: (isXcAsset)? paraTool.assetTypeToken: paraTool.assetTypeERC20, check here
                    assetType: paraTool.assetTypeERC20,
                    assetName: this.clip_string(assetInfo.name),
                    symbol: assetInfo.symbol,
                    decimals: assetInfo.decimal,
                    creator: creator,
                    createdAtTx: createdAtTx,
                };
                this.add_index_metadata(nlp);
                this.evmcontractMap[assetKey] = nlp;
                if (!isXcAsset) {
                    return o
                } else {
                    return false
                    //return o
                }
            }
        }
        return false
    }

    resetTipAssetTally() {
        let newTallyAsset = {}
        for (const assetChain of Object.keys(this.tallyAsset)) {
            let assetInfoType = this.tallyAsset[assetChain].assetType;
            if (assetInfoType != 'ERC20') {
                newTallyAsset[assetChain] = this.tallyAsset[assetChain]
            }
        }
        this.tallyAsset = newTallyAsset
    }

    async flush_evmcontractMap() {
        let rows = [];
        for (const k of Object.keys(this.evmcontractMap)) {
            let c = this.evmcontractMap[k];
            // console.log(`!! flush_evmcontractMap ${k}`, c)
            this.add_index_metadata(c);
            this.push_rows_related_keys("evmcontract", c.chainID.toString(), rows, c.asset, c)
        }

        if (rows.length > 0) {
            let [tblName, tblRealtime] = this.get_btTableRealtime()
            try {
                await tblRealtime.insert(rows);
                //console.log("flush_evmcontractMap rows=", rows.length);
                return [];
            } catch (err) {
                console.log(err);
            }
        }
    }


    parseAssetChainHolder(assetChainHolder) {
        let words = assetChainHolder.split('-');
        let holder = words[0];
        let assetChain = words[1];
        let [asset, chainID] = paraTool.parseAssetChain(assetChain);
        return [asset, chainID, holder];
    }

    computeTargetBatchSize(batchSize, total) {
        if (total <= batchSize) return batchSize;
        let numBatches = (Math.ceil(total / batchSize));
        return Math.ceil(total / numBatches);
    }



    get_asset(asset) {
        let a = this.tallyAsset[asset];
        if (a) {
            return a;
        } else {
            return false
        }
    }

    async computeTraceType(chain, bn) {
        let trace = false;
        let chainID = chain.chainID;
        const filter = {
            filter: [{
                family: ["trace"],
                cellLimit: 100
            }]
        };

        const tableChain = this.getTableChain(chainID);
        const [row] = await tableChain.row(paraTool.blockNumberToHex(bn)).get(filter);
        try {
            let rowData = row.data;
            let traceData = rowData["trace"];
            if (traceData) {
                for (const hash of Object.keys(traceData)) {
                    let trace = JSON.parse(traceData[hash][0].value);
                    let traceType = this.compute_trace_type(trace);
                    return (traceType)
                }
            }
        } catch (e) {
            console.log(e)
        }
    }

    compute_trace_type(trace, defaultTraceType) {
        let pass = 0;
        let fail = 0;
        for (let i = 0; i < trace.length; i++) {
            let valRaw = trace[i].v;
            if (valRaw && valRaw.length > 10) {
                let val = valRaw.substr(2);
                let b0 = parseInt(val.substr(0, 2), 16);
                switch (b0 & 3) {
                    case 0: // single-byte mode: upper six bits are the LE encoding of the value
                        let el0 = (b0 >> 2) & 63;
                        if (el0 == (val.substr(2).length) / 2) {
                            pass++;
                        } else {
                            fail++;
                        }
                        break;
                    case 1: // two-byte mode: upper six bits and the following byte is the LE encoding of the value
                        var b1 = parseInt(val.substr(2, 2), 16);
                        var el1 = ((b0 >> 2) & 63) + (b1 << 6);
                        // console.log("twobyte", el1, "b1", b1,  "len", (val.substr(2).length-2)/2);
                        if (el1 == (val.substr(2).length - 2) / 2) {
                            pass++;
                        } else {
                            fail++;
                        }
                        break;
                }
            }
        }
        if (pass + fail < 3) return (defaultTraceType);
        if (pass / (pass + fail) > .9) {
            return "subscribeStorage"
        }
        return "state_traceBlock"
    }


    // parse trace without any handparse
    parse_trace_as_auto(e, traceType, traceIdx, bn, blockHash, api) {
        let o = {}
        //o.bn = bn;
        //o.blockHash = blockHash;
        //o.ts = e.ts; //not sure if we are still using this?
        o.traceID = `${bn}-${traceIdx}`

        let decodeFailed = false

        let key = e.k.slice()
        var query = api.query;

        if (key.substr(0, 2) == "0x") key = key.substr(2)
        let val = "0x"; // this is essential to cover "0" balance situations where e.v is null ... we cannot return otherwise we never zero out balances
        if (e.v) {
            val = e.v.slice()
            if (val.substr(0, 2) == "0x") val = val.substr(2)
        }
        let k = key.slice();
        if (k.length > 64) k = k.substr(0, 64);
        let sk = this.storageKeys[k];

        //if (!sk) decodeFailed = true;
        //if (!sk) return ([false, false]);
        if (!sk) {
            o.p = 'unknown'
            o.s = 'unknown'
            o.k = e.k
            o.v = e.v
            return [o, false]
        }

        // add the palletName + storageName to the object, if found
        o.p = sk.palletName;
        o.s = sk.storageName;
        if (!o.p || !o.s) {
            console.log(`k=${k} not found (${key},${val})`)
            decodeFailed = true
            o.p = 'unknown'
            o.s = 'unknown'
            o.k = e.k
            o.v = e.v
            return [o, false]
            //return ([false, false]);
        }


        let parsev = false;
        let p = paraTool.firstCharLowerCase(o.p);
        let s = paraTool.firstCharLowerCase(o.s);
        let kk = ''
        let vv = ''
        let pk = ''
        let pv = ''
        let debugCode = 0
        let palletSection = `${o.p}:${o.s}` //firstChar toUpperCase to match the testParseTraces tbl

        try {
            if (!query[p]) decodeFailed = true;
            if (!query[p][s]) decodeFailed = true;
            if (!query[p][s].meta) decodeFailed = true;
        } catch (e) {
            decodeFailed = true
        }

        if (decodeFailed) {
            o.p = p
            o.s = s
            o.k = e.k
            o.v = e.v
            return [o, false]
        }
        //if (!query[p]) return ([false, false]);
        //if (!query[p][s]) return ([false, false]);
        //if (!query[p][s].meta) return ([false, false]);
        let queryMeta = query[p][s].meta;
        let handParseKey = false;
        // parse key
        try {
            kk = key;

            var skey = new StorageKey(api.registry, '0x' + key); // ???
            skey.setMeta(api.query[p][s].meta); // ????
            var parsek = skey.toHuman();
            var decoratedKey = JSON.stringify(parsek)
            pk = decoratedKey
        } catch (err) {
            o.pk = "err";
            pk = "err"
            this.numIndexingErrors++;
        }

        // parse value
        try {
            let valueType = (queryMeta.type.isMap) ? queryMeta.type.asMap.value.toJSON() : queryMeta.type.asPlain.toJSON();
            let valueTypeDef = api.registry.metadata.lookup.getTypeDef(valueType).type;
            let v = (val.length >= 2) ? val.substr(2).slice() : "";
            if (valueTypeDef == "u128" || valueTypeDef == "u64" || valueTypeDef == "u32" || valueTypeDef == "u64" || valueTypeDef == "Balance") {
                parsev = hexToBn(v, {
                    isLe: true
                }).toString();
            } else {
                switch (traceType) {
                    case "state_traceBlock":
                        if (api.createType != undefined) {
                            parsev = api.createType(valueTypeDef, "0x" + val.substr(2)).toString(); // assume 01 "Some"/"None" is
                        } else if (api.registry != undefined && this.apiAt.registry.createType != undefined) {
                            parsev = api.registry.createType(valueTypeDef, "0x" + val.substr(2)).toString();
                        }
                        break;
                    case "subscribeStorage":
                    default: // skip over compact encoding bytes in Vec<u8>, see https://github.com/polkadot-js/api/issues/4445
                        let b0 = parseInt(val.substr(0, 2), 16);
                        switch (b0 & 3) {
                            case 0: // single-byte mode: upper six bits are the LE encoding of the value
                                let el0 = (b0 >> 2) & 63;
                                if (el0 == (val.substr(2).length) / 2) {
                                    if (api.createType != undefined) {
                                        parsev = api.createType(valueTypeDef, "0x" + val.substr(2)).toString(); // 1 byte
                                    } else if (api.registry != undefined && api.registry.createType != undefined) {
                                        parsev = api.registry.createType(valueTypeDef, "0x" + val.substr(2)).toString(); // 1 byte
                                    }
                                } else {
                                    // MYSTERY: why should this work?
                                    // console.log("0 BYTE FAIL - el0", el0, "!=", (val.substr(2).length) / 2);
                                    if (api.createType != undefined) {
                                        parsev = api.createType(valueTypeDef, "0x" + val.substr(2)).toString();
                                    } else if (api.registry != undefined && api.registry.createType != undefined) {
                                        parsev = api.registry.createType(valueTypeDef, "0x" + val.substr(2)).toString();
                                    }
                                }
                                break;
                            case 1: // two-byte mode: upper six bits and the following byte is the LE encoding of the value
                                var b1 = parseInt(val.substr(2, 2), 16);
                                var el1 = ((b0 >> 2) & 63) + (b1 << 6);
                                if (el1 == (val.substr(2).length - 2) / 2) {
                                    if (api.createType != undefined) {
                                        parsev = api.createType(valueTypeDef, "0x" + val.substr(4)).toString(); // 2 bytes
                                    } else if (api.registry != undefined && api.registry.createType != undefined) {
                                        parsev = api.registry.createType(valueTypeDef, "0x" + val.substr(4)).toString(); // 2 bytes
                                    }
                                } else {
                                    // MYSTERY: why should this work?
                                    // console.log("2 BYTE FAIL el1=", el1, "!=", (val.substr(2).length - 2) / 2, "b0", b0, "b1", b1, "len", (val.substr(2).length - 2) / 2, "val", val);
                                    if (this.apiAt.createType != undefined) {
                                        parsev = api.createType(valueTypeDef, "0x" + val.substr(2)).toString();
                                    } else if (api.registry != undefined && api.registry.createType != undefined) {
                                        parsev = api.registry.createType(valueTypeDef, "0x" + val.substr(2)).toString();
                                    }
                                }
                                break;
                            case 2: // four-byte mode: upper six bits and the following three bytes are the LE encoding of the value
                                /*var b1 = parseInt(val.substr(2, 2), 16);
                                    var b2 = parseInt(val.substr(4, 2), 16);
                                    var b3 = parseInt(val.substr(6, 2), 16);
                                    var el2 = (b0 >> 2) & 63 + (b1 << 6) + (b2 << 14) + (b3 << 22);
                                    if (el2 == (val.substr(2).length - 6) / 2) {
                                        parsev = api.createType(valueTypeDef, "0x" + val.substr(8)).toString(); // 4 bytes
                                    } else {
                                        parsev = api.createType(valueTypeDef, "0x" + val.substr(2)).toString(); // assume 01 "Some" is the first byte
                                    } */
                                break;
                            case 3: // Big-integer mode: The upper six bits are the number of bytes following, plus four.
                                //let numBytes = ( b0 >> 2 ) & 63 + 4;
                                //parsev = api.createType(valueTypeDef, "0x" + val.substr(2 + numBytes*2)).toString(); // check?
                                break;
                        }
                }
            }
            vv = val;
            if (parsev) {
                pv = parsev;
            }
        } catch (err) {
            //MK: temporary silent this. will revisit again
            if (this.debugLevel >= paraTool.debugVerbose) console.log(`[${o.traceID}] SOURCE: pv`, err);
            this.numIndexingWarns++;
        }
        let paddedK = (kk.substr(0, 2) == '0x') ? kk : '0x' + kk
        let paddedV = (vv.substr(0, 2) == '0x') ? vv : '0x' + vv
        if (JSON.stringify(paddedK) == pk) pk = ''
        if (kk != '') o.k = paddedK
        if (vv != '') o.v = paddedV
        if (pk != '') o.pkExtra = pk
        if (pv != '') o.pv = pv
        //o.pv = (pv == undefined)? pv: null
        //Need special treatments for `ParachainSystem:HrmpOutboundMessages, Dmp:DownwardMessageQueues, ParachainSystem:UpwardMessages`
        this.chainParser.decorateAutoTraceXCM(this, o)
        return [o, parsev];
    }

    parse_trace_from_auto(e, traceType, bn, blockHash, api) {
        //console.log(`e`, e)
        let o = {}
        o.bn = e.bn;
        o.blockHash = e.blockHash;
        // o.ts = e.ts; //not sure if we are still using this?

        let key = e.k.slice()
        var query = api.query;

        if (key.substr(0, 2) == "0x") key = key.substr(2)
        let val = "0x"; // this is essential to cover "0" balance situations where e.v is null ... we cannot return otherwise we never zero out balances
        if (e.v) {
            val = e.v.slice()
            if (val.substr(0, 2) == "0x") val = val.substr(2)
        }
        let k = key.slice();
        if (k.length > 64) k = k.substr(0, 64);
        let sk = this.storageKeys[k];

        if (!sk) return ([false, false]);
        if (this.skipStorageKeys[k]) {
            return ([false, false]);
        }
        // add the palletName + storageName to the object, if found
        o.p = sk.palletName;
        o.s = sk.storageName;
        if (!o.p || !o.s) {
            console.log(`k=${k} not found (${key},${val})`)
            return ([false, false]);
        }


        let parsev = false;
        let p = paraTool.firstCharLowerCase(o.p);
        let s = paraTool.firstCharLowerCase(o.s);
        let kk = ''
        let vv = ''
        let pk = ''
        let pv = ''
        let pv2 = ''
        let debugCode = 0
        let palletSection = `${o.p}:${o.s}` //firstChar toUpperCase to match the testParseTraces tbl

        if (!query[p]) return ([false, false]);
        if (!query[p][s]) return ([false, false]);
        if (!query[p][s].meta) return ([false, false]);
        let queryMeta = query[p][s].meta;
        let handParseKey = false;
        // parse key
        try {
            kk = key;

            let parsek = (e.pkExtra != undefined) ? e.pkExtra : JSON.stringify(e.k)
            var decoratedKey = parsek
            //console.log(`parseStorageKey  key=${key}, decoratedKey=${decoratedKey}`)
            if (handParseKey = this.chainParser.parseStorageKey(this, p, s, key, decoratedKey)) {
                if (handParseKey.mpType) {
                    //this is the dmp case
                    if (handParseKey.mpType == 'dmp' && handParseKey.paraIDDest != undefined && handParseKey.chainIDDest != undefined) {
                        o.paraIDDest = handParseKey.paraIDDest
                        o.chainIDDest = handParseKey.chainIDDest
                        o.mpType = handParseKey.mpType
                    }
                    if (handParseKey.mpType == 'ump') {
                        o.mpType = handParseKey.mpType
                        o.chainID = handParseKey.chainID
                        o.chainIDDest = handParseKey.chainIDDest
                    }
                    if (handParseKey.mpType == 'hrmp') {
                        o.mpType = handParseKey.mpType
                        o.chainID = handParseKey.chainID
                    }
                }

                if (handParseKey.lp0 != undefined && handParseKey.lp1 != undefined) {
                    o.lp0 = handParseKey.lp0
                    o.lp1 = handParseKey.lp1
                }
                if (handParseKey.decoratedAsset) {
                    o.decoratedAsset = handParseKey.decoratedAsset
                }
                if (handParseKey.decimals != undefined) {
                    o.decimals = handParseKey.decimals
                }
                if (handParseKey.asset && handParseKey.asset.DexShare) {
                    handParseKey.asset = handParseKey.asset.DexShare;
                }
                if (handParseKey.accountID != undefined && handParseKey.asset != undefined) {
                    // this is usually a key by acct, assetType
                    o.accountID = handParseKey.accountID
                    o.asset = JSON.stringify(handParseKey.asset)
                    //console.log("OK", o.accountID, o.asset);
                    //kk = ''
                } else if (handParseKey.accountID == undefined && handParseKey.asset != undefined) {
                    // this is usally a key by assetType
                    o.asset = JSON.stringify(handParseKey.asset)
                } else if (handParseKey.isEVM != undefined) {
                    if (handParseKey.blockNumber != undefined) {
                        o.blockNumber = handParseKey.blockNumber
                    }
                    o.isEVM = handParseKey.isEVM
                    // pk = handParseKey;
                } else {
                    // unknowny for now
                    pk = handParseKey;
                }
            } else {
                if (parsek) {
                    //kk = ''
                    pk = JSON.stringify(parsek);
                }
            }
        } catch (err) {
            console.log(`parse_trace_from_auto error [${decoratedKey}]`, err.toString())
            o.pk = "err";
            pk = "err"
            this.numIndexingErrors++;
        }

        // parse value
        try {
            vv = val;
            parsev = e.pv

            if (parsev) {
                if (parsev.substr(0, 2) == "0x") {
                    // can't do anything
                    pv = parsev;
                } else {
                    let handParseVal = false;
                    if (handParseVal = this.chainParser.parseStorageVal(this, p, s, val, parsev, o)) {
                        if (handParseVal.extra != undefined) {
                            //added any extra field here
                            for (let f in handParseVal.extra) {
                                o[f] = handParseVal.extra[f]
                            }
                        }
                        //use the remaining as pv
                        if (handParseVal.pv != "") pv = handParseVal.pv
                        if (handParseVal.pv2 != "") pv2 = handParseVal.pv2 // load raw xcm here
                    } else {
                        try {
                            //uncategorized type
                            let parsedStruct = JSON.parse(parsev)
                            pv = parsedStruct;
                            debugCode = 2
                        } catch {
                            console.log(p, s, parsev);
                        }
                    }
                }
            }
        } catch (err) {
            console.log("SOURCE: pv", err);
            this.numIndexingWarns++;
        }
        if (kk != '') o.k = kk
        if (vv != '') o.v = vv
        if (pk != '') o.pk = JSON.stringify(pk)
        if (pv != '') o.pv = JSON.stringify(pv)
        if (pv2 != '') o.pv2 = JSON.stringify(pv2)
        if (debugCode > 0) o.debug = debugCode

        return [o, parsev];
    }

    getBeneficiaryFromMsgHash(msgHash) {
        let xcmKeys = Object.keys(this.xcmmsgMap)
        for (const tk of xcmKeys) {
            let xcm = this.xcmmsgMap[tk]
            let cachedMsgHash = xcm.msgHash
            if (cachedMsgHash == msgHash && xcm.beneficiaries != undefined) {
                return xcm.beneficiaries.split('|')[0]
            }
        }
        return false
    }

    // find the msgHash given {BN, recipient} or {BN, innercall}
    getMsgHashCandidate(targetBN, matcher = false, extrinsicID = false, extrinsicHash = false, matcherType = 'address') {
        if (!matcher) {
            if (this.debugLevel >= paraTool.debugErrorOnly) console.log(`getMsgHashCandidate [${targetBN}], matcher MISSING`)
            return false
        }
        let rawMatcher = matcher.substr(2) // without the prefix 0x
        if (rawMatcher.length != 64 && rawMatcher.length != 40 && matcherType == 'address') {
            if (this.debugLevel >= paraTool.debugErrorOnly) console.log(`getMsgHashCandidate [${targetBN}, matcher=${matcher}] Invalid destAddress`)
            return false
        }
        let trailingKeys = Object.keys(this.xcmTrailingKeyMap)
        if (this.debugLevel >= paraTool.debugTracing) console.log(`getMsgHashCandidate [${targetBN}, matcher=${matcher}] trailingKeys`, trailingKeys)
        for (const tk of trailingKeys) {
            let trailingXcm = this.xcmTrailingKeyMap[tk]
            if (this.debugLevel >= paraTool.debugTracing) console.log(`getMsgHashCandidate [${targetBN}, matcher=${matcher}] trailingXcm`, trailingXcm)
            let firstSeenBN = trailingXcm.blockNumber
            let msgHex = trailingXcm.msgHex
            let msgHash = trailingXcm.msgHash
            if (firstSeenBN == targetBN && msgHex.includes(rawMatcher)) {
                //criteria: firstSeen at the block when xcmtransfer is found + recipient match
                //this should give 99% coverage? let's return on first hit for now
                if (this.debugLevel >= paraTool.debugInfo) console.log(`getMsgHashCandidate [${targetBN}, matcher=${matcher}] FOUND candidate=${msgHash}`)
                if (this.xcmmsgMap[tk] != undefined && extrinsicID && extrinsicHash) {
                    this.xcmmsgMap[tk].extrinsicID = extrinsicID
                    this.xcmmsgMap[tk].extrinsicHash = extrinsicHash
                }
                return msgHash
            }
        }
        if (this.debugLevel >= paraTool.debugInfo) console.log(`getMsgHashCandidate [${targetBN}, matcher=${matcher}, ${matcherType}] MISS`)
    }

    getEvmMsgHashCandidate(targetBN, matcher = false, matcherType = 'evm') {
        let evmTxHash = matcher.transactionHash
        if (evmTxHash == undefined) return
        let txInput = matcher.input.substr(2)
        let txTo = (matcher.to != undefined) ? matcher.to.toLowerCase().substr(2) : ''
        let txGasLimit = (matcher.gasLimit != undefined) ? paraTool.reverseEndian(paraTool.intToHex(matcher.gasLimit).substr(2)) : '' // little endian
        //let txValue = (matcher.value != undefined)? paraTool.reverseEndian(paraTool.intToHex(matcher.value).substr(2)) : ''                  // cant match on value because we already modified by decimals...
        let txCreates = (matcher.creates != undefined) ? matcher.creates.toLowerCase().substr(2) : ''
        if (!matcher) {
            if (this.debugLevel >= paraTool.debugErrorOnly) console.log(`getEvmMsgHashCandidate [${evmTxHash}][${targetBN}], matcher MISSING`)
            return false
        }
        let trailingKeys = Object.keys(this.xcmTrailingKeyMap)
        let outgoingTransactMsg = []
        if (this.debugLevel >= paraTool.debugTracing) console.log(`getEvmMsgHashCandidate [${evmTxHash}] [${targetBN}, matcher=[${txInput}, ${txTo}, ${txGasLimit}] trailingKeys`, trailingKeys)
        for (const tk of trailingKeys) {
            let trailingXcm = this.xcmTrailingKeyMap[tk]
            if (trailingXcm.chainID == this.chainID) {
                let msgHash = trailingXcm.msgHash
                let msgStr = trailingXcm.msgStr
                let r = paraTool.getXCMTransactList(msgHash, msgStr)
                if (r) {
                    outgoingTransactMsg.push(r)
                }
            }
        }

        for (const tk of trailingKeys) {
            let trailingXcm = this.xcmTrailingKeyMap[tk]
            //console.log(`getEvmMsgHashCandidate tk=${tk}`, trailingXcm)
            if (this.debugLevel >= paraTool.debugTracing) console.log(`getEvmMsgHashCandidate [${evmTxHash}] [${targetBN}, matcher=[${txInput}, ${txTo}, ${txGasLimit}] trailingXcm`, trailingXcm)
            let firstSeenBN = trailingXcm.blockNumber
            let msgHex = trailingXcm.msgHex
            let msgHash = trailingXcm.msgHash
            let msgStr = trailingXcm.msgStr
            let childMsgHash = false // this is the second leg, if available
            if (firstSeenBN == targetBN && msgHex.includes(txInput) && msgHex.includes(txTo) && msgHex.includes(txGasLimit)) {
                //criteria: firstSeen at the block when xcmtransfer is found + recipient match
                //this should give 99% coverage? let's return on first hit for now
                if (this.debugLevel >= paraTool.debugInfo) console.log(`getEvmMsgHashCandidate [${evmTxHash}] [${targetBN}, matcher=${txInput}, ${txTo}, ${txGasLimit}] FOUND candidate=${msgHash}`)
                if (this.xcmmsgMap[tk] != undefined) {
                    this.xcmmsgMap[tk].connectedTxHash = evmTxHash
                }
                for (const m of outgoingTransactMsg) {
                    for (const t of m.transactList) {
                        if (msgHex.includes(t)) {
                            childMsgHash = m.msgHash
                            break;
                        }
                    }
                }
                return [msgHash, childMsgHash]
            }
        }
        if (this.debugLevel >= paraTool.debugInfo) console.log(`getEvmMsgHashCandidate [${evmTxHash}] [${targetBN}, matcher=[${txInput}, ${txTo}, ${txGasLimit}], ${matcherType}] MISS`)
        return [false, false]
    }


    // clean traling xcm
    cleanTrailingXcmMap(blockNumber) {
        let trailingBlk = 10 // goal: keep xcmKey that's less than n block old so we don't write duplicate xcm from undispated queue
        let trailingBN = blockNumber - trailingBlk
        let updatedTrailingKeyMap = {}
        let trailingKeys = Object.keys(this.xcmTrailingKeyMap)
        for (const tk of trailingKeys) {
            let trailingXcm = this.xcmTrailingKeyMap[tk]
            let firstSeenBN = trailingXcm.blockNumber
            if (firstSeenBN >= trailingBN) {
                updatedTrailingKeyMap[tk] = this.xcmTrailingKeyMap[tk]
            }
        }
        this.xcmTrailingKeyMap = updatedTrailingKeyMap
    }

    // get traling bn
    // xcmKey was `${xcmMsg.msgHash}-${xcmMsg.msgType}-${xcmMsg.sentAt}-${direction}`
    getTrailingXcmInfo(msgHash, currBN) {
        let xcmBN = false
        let chainID = false
        let chainIDDest = false
        let trailingKeys = Object.keys(this.xcmTrailingKeyMap)
        //console.log(`msgHash=${msgHash},trailingKeys`, trailingKeys)
        for (const tk of trailingKeys) {
            if (tk.includes(msgHash)) {
                let trailingXcm = this.xcmTrailingKeyMap[tk]
                if (this.debugLevel >= paraTool.debugTracing) console.log(`msgHash=${msgHash} included`, tk, trailingXcm)
                let firstSeenBN = trailingXcm.blockNumber
                if (trailingXcm.matchable && currBN >= firstSeenBN) {
                    if (this.debugLevel >= paraTool.debugInfo) console.log(`msgHash=${msgHash} [received=${firstSeenBN}, executed=${currBN}]`)
                    xcmBN = firstSeenBN
                    chainID = trailingXcm.chainID
                    chainIDDest = trailingXcm.chainIDDest
                    this.xcmTrailingKeyMap[tk].matchable = false
                    return [xcmBN, chainID, chainIDDest]
                }
            }
        }
        return [xcmBN, chainID, chainIDDest]
    }

    // this is the xcmmessages table
    async dump_xcm_messages() {
        if (this.recentXcmMsgs.length > 0) {
            let rows = this.recentXcmMsgs
            if (this.debugLevel >= paraTool.debugTracing) console.log(`dump_xcm_messages rowsLen=${rows.length}`, rows)

            let vals = ["sentAt", "chainIDDest", "chainID", "msgType", "msgHex", "msgStr", "blockTS", "relayChain", "version", "path", "extrinsicID", "extrinsicHash", "indexDT", "beneficiaries", "connectedTxHash"];
            await this.upsertSQL({
                "table": "xcmmessages",
                "keys": ["msgHash", "blockNumber", "incoming"],
                "vals": vals,
                "data": rows,
                "replace": vals
            });
            this.recentXcmMsgs = []

            /*
            {
                sectionMethod: 'xcmpQueue(Fail)',
                eventID: '2000-1626946-1-8',
                sentAt: 11570241,
                bn: 1626946,
                msgHash: '0xd5416d6a4809dd80fc978845e5bbd8a1b64e10ddea383a158bf83195ea18aa8f',
                success: false,
                error: 'unroutable',
                description: null
            }
            */
            let incomingXcmStateKeys = Object.keys(this.incomingXcmState)
            if (incomingXcmStateKeys.length > 0) {
                let mpStates = [];
                for (let i = 0; i < incomingXcmStateKeys.length; i++) {
                    let r = this.incomingXcmState[incomingXcmStateKeys[i]];
                    if (r.xcmBN && r.chainID !== false && r.chainIDDest !== false) {
                        // ["msgHash", "blockNumber", "incoming"] + ["destStatus", "executedEventID", "errorDesc"]
                        let destStatus = (r.success === true) ? '1' : '0'
                        let errorDesc = (r.errorDesc != undefined) ? `'${r.errorDesc}'` : `NULL`
                        if (r.errorDesc != undefined && r.description != undefined) {
                            errorDesc = `'${r.errorDesc}:${r.description}'`
                        }
                        //let executedEventID = (r.eventID != undefined) ? `'${r.eventID}'` : `NULL`
                        let t = "(" + [`'${r.msgHash}'`, `'${r.xcmBN}'`, `'1'`, `'${r.chainID}'`, `'${r.chainIDDest}'`, `'${destStatus}'`, `'${r.eventID}'`, errorDesc].join(",") + ")";
                        //console.log(`mpStates`, t)
                        mpStates.push(t);
                    } else {
                        console.log(`[${r.msgHash}] xcmInfo missing! xcmBN=${r.xcmBN}, chainID=${r.chainID}, chainIDDest=${r.chainIDDest}`)
                    }
                }
                this.incomingXcmState = {};
                let sqlDebug = false
                try {
                    // these events we can't say for sure without matching to recent sends
                    if (mpStates.length > 0) {
                        let vals = ["chainID", "chainIDDest", "destStatus", "executedEventID", "errorDesc"];
                        await this.upsertSQL({
                            "table": "xcmmessages",
                            "keys": ["msgHash", "blockNumber", "incoming"],
                            "vals": vals,
                            "data": mpStates,
                            "replace": vals
                        }, sqlDebug);
                    }
                } catch (err0) {
                    console.log(err0);
                }
            }

            let out = [];
            for (const blockNumber of Object.keys(this.numXCMMessagesIn)) {
                out.push(`('${blockNumber}', '${this.numXCMMessagesIn[blockNumber]}')`);
            }
            if (out.length > 0) {
                let vals = ["numXCMMessagesIn"];
                await this.upsertSQL({
                    "table": `block${this.chainID}`,
                    "keys": ["blockNumber"],
                    "vals": vals,
                    "data": out,
                    "replace": vals
                });
                //console.log("numXCMMessagesOut", this.numXCMMessagesOut);
                this.numXCMMessagesIn = {};
            }

            out = [];
            for (const blockNumber of Object.keys(this.numXCMMessagesOut)) {
                out.push(`('${blockNumber}', '${this.numXCMMessagesOut[blockNumber]}')`);
            }
            if (out.length > 0) {
                vals = ["numXCMMessagesOut"];
                await this.upsertSQL({
                    "table": `block${this.chainID}`,
                    "keys": ["blockNumber"],
                    "vals": vals,
                    "data": out,
                    "replace": vals
                });
                //console.log("numXCMMessagesOut", this.numXCMMessagesOut);
                this.numXCMMessagesOut = {};
            }
        }
    }

    async dump_recent_activity() {
        if (this.recentExtrinsics.length > 0) {
            let rows = this.recentExtrinsics
            let i = 0;
            for (i = 0; i < rows.length; i += 10000) {
                let j = i + 10000;
                if (j > rows.length) j = rows.length;
                await this.upsertSQL({
                    "table": `extrinsicsrecent`,
                    "keys": ["extrinsicID", "chainID"],
                    "vals": ["logDT", "hr", "blockNumber", "extrinsicHash", "section", "method", "fromAddress", "ts", "result", "signed"],
                    "data": rows.slice(i, j),
                    "replace": ["logDT", "hr", "blockNumber", "extrinsicHash", "section", "method", "fromAddress", "ts", "result", "signed"]
                });
            }
            this.recentExtrinsics = []
        }

        if (this.recentTransfers.length > 0) {
            let rows = this.recentTransfers
            let i = 0;
            for (i = 0; i < rows.length; i += 10000) {
                let j = i + 10000;
                if (j > rows.length) j = rows.length;
                await this.upsertSQL({
                    "table": `transfersrecent`,
                    "keys": ["extrinsicID", "chainID"],
                    "vals": ["logDT", "hr", "blockNumber", "extrinsicHash", "section", "method", "fromAddress", "toAddress", "asset", "symbol", "amount", "priceUSD", "amountUSD", "ts", "rawAsset", "rawAmount", "decimals"],
                    "data": rows.slice(i, j),
                    "replace": ["logDT", "hr", "blockNumber", "extrinsicHash", "section", "method", "fromAddress", "toAddress", "asset", "symbol", "amount", "priceUSD", "amountUSD", "ts", "rawAsset", "rawAmount", "decimals"]
                });
            }
            this.recentTransfers = []
        }

    }


    parseEvent(evt, eventID, api = false) {
        if (!api) return (false);
        if (!api.events) return (false);
        var section = evt.method.pallet;
        var method = evt.method.method;
        if (!api.events[section]) return (false);

        var e = api.events[section][method];
        if (!e) return (false);
        var data = evt.data;
        var fields = e.meta.fields;

        var dType = [];
        let dEvent = {}
        dEvent.eventID = eventID
        dEvent.docs = e.meta.docs.toString()
        //dEvent.method = evt.method
        dEvent.section = section
        dEvent.method = method
        //dEvent.data = evt.data


        //store metaError while we decorate it
        /*
        [
            {
              "module": {
                  "index": 4,
                  "error": 1,
                  "msg": 'generate msg here'
                }
            },
            {
              "err": {
                "module": {
                  "index": 23,
                  "error": 0,
                  "msg": 'generate msg here'
                }
              }
            }
          ]
        */
        let dData = evt.data
        for (var i = 0; i < dData.length; i++) {
            let dData_i = dData[i]
            try {
                if (dData_i != undefined) {
                    if (dEvent.section == "system" && dEvent.method == "ExtrinsicFailed" && dData_i.module != undefined) {
                        dData_i.module.msg = this.getErrorDoc(dData_i.module, api)
                        dData[i] = dData_i
                    } else if (dData_i.err != undefined && dData_i.err.module != undefined) {
                        dData_i.err.module.msg = this.getErrorDoc(dData_i.err.module, api)
                        dData[i] = dData_i
                    }
                }
            } catch (e) {
                console.log(`parseEvent error`, e, `dData`, dData)
            }
        }
        dEvent.data = dData

        for (var i = 0; i < fields.length; i++) {
            var fld = fields[i]
            var valueType = fld.type.toJSON();
            var typeDef = api.registry.metadata.lookup.getTypeDef(valueType).type
            //var parsedEvent = this.api.createType(typeDef, data[i]);
            var name = fld.name.toString();
            var typeName = fld.typeName.toString();
            dType.push({
                typeDef: typeDef,
                name: name
            })
        }
        dEvent.dataType = dType
        return dEvent
    }

    decode_s_internal_raw(call_s, apiAt) {
        //fetch method, section when human is not set
        let callIndex = call_s.callIndex
        let [method, section] = this.getMethodSection(callIndex, apiAt)
        let f = {
            callIndex: callIndex,
            section: section,
            method: method,
            args: call_s.args
        }
        return f
    }

    getMethodSection(callIndex, apiAt) {
        try {
            var {
                method,
                section
            } = apiAt.registry.findMetaCall(paraTool.hexAsU8(callIndex))
            return [method, section]
        } catch (e) {
            console.log(`getMethodSection unable to decode ${callIndex}`, e)
        }
        return [null, null]
    }

    recursive_batch_all(call_s, apiAt, extrinsicHash, extrinsicID, lvl = '', remarks = {}, opaqueCalls = {}) {
        if (call_s && call_s.args.calls != undefined) {
            for (let i = 0; i < call_s.args.calls.length; i++) {
                let callIndex = call_s.args.calls[i].callIndex
                let [method, section] = this.getMethodSection(callIndex, apiAt)
                let ff = {
                    callIndex: callIndex,
                    section: section,
                    method: method,
                    args: call_s.args.calls[i].args
                }
                let pallet_method = `${ff.section}:${ff.method}`
                if (pallet_method == 'system:remarkWithEvent' || pallet_method == 'system:remark') {
                    if (ff.args.remark != undefined) {
                        remarks[ff.args.remark] = 1
                    }
                }
                let o = `call ${lvl}-${i}`
                // console.log(`\t${o} - ${pallet_method}`)
                if (ff.args.call != undefined) {
                    //recursively decode opaque call
                    let s = " ".repeat()
                    //console.log(`\t${" ".repeat(o.length+2)} - additional 'call' argument found`)
                    this.decode_opaque_call(ff, apiAt, extrinsicHash, extrinsicID, `${lvl}-${i}`, remarks, opaqueCalls)
                }
                this.recursive_batch_all(ff, apiAt, extrinsicHash, extrinsicID, `${lvl}-${i}`, remarks, opaqueCalls)
                call_s.args.calls[i] = ff
            }
            //console.log("recursive_batch_all done")
        } else {
            //sudo:sudoAs case
            if (call_s && call_s.args.call != undefined) {
                //console.log(`${extrinsicHash}`, 'call only', innerexs)
                this.decode_opaque_call(call_s, apiAt, extrinsicHash, extrinsicID, `${lvl}`, remarks, opaqueCalls)
            } else {
                //console.log("recursive_batch_all no more loop")
            }
        }
    }

    //this is right the level above args
    decode_opaque_call(f, apiAt, extrinsicHash, extrinsicID, lvl = '', remarks = {}, opaqueCalls = {}) {
        //console.log(`${extrinsicHash}`, 'decode_opaque_call', f)
        if (f.args.call != undefined) {
            let opaqueCall = f.args.call
            let extrinsicCall = false;
            let isHexEncoded = (typeof opaqueCall === 'object') ? false : true
            //console.log(`d opaqueCall(hexEncoded=${isHexEncoded})`, opaqueCall)
            if (isHexEncoded) {
                opaqueCalls[opaqueCall] = 1 // using opaqueCalls for fingerprint
                try {
                    // cater for an extrinsic input...
                    extrinsicCall = apiAt.registry.createType('Call', opaqueCall);
                    //console.log("d decoded opaqueCall", extrinsicCall.toString())

                    let innerexs = JSON.parse(extrinsicCall.toString());
                    let innerOutput = {}
                    try {
                        // only utility batch will have struct like this
                        if (innerexs && innerexs.args.calls != undefined) {
                            this.recursive_batch_all(innerexs, apiAt, extrinsicHash, extrinsicID, lvl, remarks, opaqueCalls)
                        }
                        if (innerexs && innerexs.args.call != undefined) {
                            //console.log(`${extrinsicHash}`, 'call only', innerexs)
                            this.decode_opaque_call(innerexs, apiAt, extrinsicHash, extrinsicID, `${lvl}`, remarks, opaqueCalls)
                        }
                        innerOutput = this.decode_s_internal_raw(innerexs, apiAt)
                        //console.log(`${extrinsicHash}`, 'innerexs', innerexs)
                        let innerOutputPV = `${innerOutput.section}:${innerOutput.method}`
                        //console.log(`${extrinsicHash}`, 'innerOutput', innerOutput)
                        if (innerOutputPV == 'system:remarkWithEvent' || innerOutputPV == 'system:remark') {
                            if (innerOutput.args.remark != undefined) {
                                remarks[innerOutput.args.remark] = 1
                            }
                        }
                    } catch (err1) {
                        console.log(`* [${extrinsicID}] ${extrinsicHash} try errored`, err1)
                    }

                    //console.log("innerexs", JSON.stringify(innerexs))

                    f.args.call = innerOutput //this line update the f
                    //console.log("innerOutput", JSON.stringify(innerOutput))

                } catch (e) {
                    console.log(`* [${extrinsicID}] ${extrinsicHash} try errored`, e, f)
                }
            } else {
                //This is the proxy:proxy case - where api has automatically decoded the "call"
                if (f.args.call.callIndex != undefined) {
                    let call_ss = f.args.call
                    let call_s = this.decode_s_internal_raw(call_ss, apiAt)
                    let call_sPV = `${call_s.section}:${call_s.method}`
                    //console.log(`call_sPV`, call_sPV)
                    if (call_sPV == 'system:remarkWithEvent' || call_sPV == 'system:remark') {
                        if (call_s.args.remark != undefined) {
                            remarks[call_s.args.remark] = 1
                        }
                    }
                    this.recursive_batch_all(call_s, apiAt, extrinsicHash, extrinsicID, lvl, remarks, opaqueCalls)
                    f.args.call = call_s
                }
                //console.log(`* [${extrinsicID}] ${extrinsicHash} already decoded opaqueCall`, extrinsicCall.toString())
            }
        }
    }

    decode_s_extrinsic(extrinsic, blockNumber, index = 'pending', apiAt) {
        let exos = JSON.parse(extrinsic.toString());

        let extrinsicHash = extrinsic.hash.toHex()
        let extrinsicID = (index == 'pending') ? `${extrinsicHash}-pending` : blockNumber + "-" + index
        let callIndex = exos.method.callIndex
        let [method, section] = this.getMethodSection(callIndex, apiAt)
        let remarks = {} // add all remarks here
        let opaqueCalls = {}
        let pv = `${section}:${method}`
        if (pv == 'system:remarkWithEvent' || pv == 'system:remark') {
            if (exos.method.args.remark != undefined) {
                remarks[exos.method.args.remark] = 1
            }
        }

        console.log(`[chain ${this.chainID} extrinsicID${extrinsicID}] ${extrinsicHash} | ${section}:${method}`)


        try {
            // this is picking up utility batch with "calls" array
            if (exos && exos.method.args.calls != undefined && Array.isArray(exos.method.args.calls)) {
                this.recursive_batch_all(exos.method, apiAt, extrinsicHash, extrinsicID, `0`, remarks, opaqueCalls)
                let exosArgsCall = exos.method.args.calls
                for (let i = 0; i < exosArgsCall.length; i++) {
                    let f = exosArgsCall[i]
                    exosArgsCall[i] = f
                }
                exos.method.args.calls = exosArgsCall
            }
        } catch (err1) {
            /// TODO: ....
            console.log(`[${extrinsicID}] ${extrinsicHash} error at err1`, err1)
        }

        if (exos.method.args.call != undefined) {
            this.decode_opaque_call(exos.method, apiAt, extrinsicHash, extrinsicID, `0`, remarks, opaqueCalls)
        }

        let sig = exos.signature
        let sigTest = extrinsic.signature.toString()
        if (sigTest == '0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000' || sigTest == '0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000') {
            sig.isSigned = false
        } else {
            sig.isSigned = true
        }

        let lifetime = {
            isImmortal: 0
        }
        if (sig.era != undefined) {
            // either mortal or immortal
            if (sig.era.immortalEra != undefined) {
                //usually unsined tx here
                lifetime.isImmortal = 1
            } else if (sig.era.mortalEra != undefined) {
                try {
                    var r = apiAt.registry.createType('MortalEra', paraTool.hexAsU8(sig.era.mortalEra))
                    let [birth, death] = paraTool.getLifetime(blockNumber, r)
                    lifetime.birth = birth
                    lifetime.death = death
                    sig.era = r.toHuman()
                } catch (e) {
                    console.log(`[${extrinsicID}] ${extrinsicHash} error computing lifetime + era`, e)
                }
            }
        }
        let remarkStrs = []
        for (const remark of Object.keys(remarks)) {
            remarkStrs.push(remark)
        }
        let encodedCalls = []
        for (const opaqueCall of Object.keys(opaqueCalls)) {
            encodedCalls.push(opaqueCall)
        }
        let out = {
            method: {
                //todo: figure out method section
                callIndex: callIndex,
                pallet: section,
                method: method,
            },
            args: exos.method.args,
            remarks: remarkStrs,
            encodedCalls: encodedCalls,
            signature: sig,
            lifetime: lifetime
        }
        return (out)
    }

    getErrorDoc(errModule, apiAt) {
        //console.log(`errModule`, errModule)
        let errModuleIdx = errModule.index
        let errModuleErrorEnum = errModule.error

        let errMsg = ''
        if (errModuleIdx == undefined || errModuleErrorEnum == undefined) {
            return `Failed (Generic)` //no further information available
        }
        let errModuleErrorEnum0 = errModule.error
        if (!paraTool.isInt(errModuleErrorEnum0)) {
            errModuleErrorEnum0 = hexToU8a(errModule.error)[0]
        }

        let indexLookup = new Uint8Array([errModuleIdx, errModuleErrorEnum0]);

        try {
            var decoded = apiAt.registry.findMetaError(indexLookup)
            //console.log(`decoded`, decoded)
            let errorID = `${errModule.index}-${errModule.error}`
            //console.log(`getErrorDoc`, errorID, errModule)
            errMsg = `Failed(${decoded.method}) ${decoded.docs.join('  ')}`
        } catch (e) {
            console.log(`findMetaError unable to decode`, errModuleIdx, errModuleErrorEnum, indexLookup)
            let errorID = `${errModule.index}-${errModule.errModuleErrorEnum0}`
            errMsg = `Failed(errorID:${errorID}) `
        }
        return errMsg
    }

    checkExtrinsicStatusAndFee(apiAt, extrinsic, extrinsicHash, extrinsicID, isSigned, signer = false) {
        let res = {
            fee: 0,
            success: 1,
            err: null,
            isEVM: false
        }
        let evmStatus = {
            from: null,
            to: null,
            transactionHash: null,
        }
        let withdrawFee = 0 // if set, transaction is paid in native currency
        let totalDepositFee = 0 // if set, should equal to withdrawTxFee, including the 20% deposit to treasury
        let depositFeeList = [];
        let treasuryFee = 0 // usaullly 20% of the withdrawTxFee
        let parsedEvents = extrinsic.events
        let errorSet = false
        let [exp, exm] = this.parseExtrinsicSectionMethod(extrinsic)
        let extrinsicSectionMethod = `${exp}:${exm}`
        //let isUnsignedHead = (extrinsicSectionMethod == 'parachainSystem:setValidationData' || extrinsicSectionMethod == 'paraInherent:enter' || extrinsicSectionMethod == 'timestamp:set')? true : false
        let isUnsignedHead = !isSigned
        for (const evt of parsedEvents) {
            let data = JSON.parse(JSON.stringify(evt.data))
            let dataType = evt.dataType
            let decodedData = evt.decodedData
            //let method = evt.method
            //let [pallet, method] = this.parseSectionMethod(evt)
            let pallet_method;
            if (evt.section != undefined && evt.method != undefined) {
                pallet_method = `${evt.section}:${evt.method}`
            }

            if (dataType != undefined && Array.isArray(dataType)) {
                if (pallet_method == 'tokens:Withdrawn') {
                    //this is normal case for txfees
                    if (data != undefined && Array.isArray(data) && (this.chainID == paraTool.chainIDKintsugi || this.chainID == paraTool.chainIDInterlay)) {
                        try {
                            //this assumes that transaction is paid by nativeAsset
                            let isNativeToken = true
                            let feeToken = data[0]
                            if (feeToken.token != undefined) {
                                if (feeToken.token != this.getNativeSymbol()) {
                                    isNativeToken = false
                                    console.log(`[${extrinsicID}] ${extrinsicHash} nonNative feeToken ${feeToken.token}`)
                                }
                            }
                            let withdrawTxFee = paraTool.dechexToInt(data[2])
                            if (!isUnsignedHead && signer == data[1] && isNativeToken) {
                                withdrawFee = withdrawTxFee
                                //console.log(`[${extrinsicID}] ${extrinsicHash} [${data[0]}] withdrawFee=${withdrawTxFee}`)
                                res.fee = withdrawFee
                            }
                        } catch (e) {
                            console.log('unable to compute Withdraw fees!!', data, e)
                        }
                    }
                }
                if (pallet_method == 'balances:Withdraw') {
                    //this is normal case for txfees
                    if (data != undefined && Array.isArray(data)) {
                        try {
                            let withdrawTxFee = paraTool.dechexToInt(data[1])
                            if (!isUnsignedHead && signer == data[0]) {
                                withdrawFee = withdrawTxFee
                                //console.log(`[${extrinsicID}] ${extrinsicHash} [${data[0]}] withdrawFee=${withdrawTxFee}`)
                                res.fee = withdrawFee
                            }
                        } catch (e) {
                            console.log('unable to compute Withdraw fees!!', data, e)
                        }
                    }
                }
                if (pallet_method == 'balances:Deposit') {
                    if (data != undefined && Array.isArray(data)) {
                        try {
                            let depositfee = paraTool.dechexToInt(data[1])
                            if (!isUnsignedHead) {
                                //console.log(`[${extrinsicID}] ${extrinsicHash} [${data[0]}] depositfee=${depositfee}`)
                                totalDepositFee += depositfee
                                depositFeeList.push(depositfee)
                            }
                        } catch (e) {
                            console.log('unable to compute Deposit fees!!', data, e)
                        }
                    }
                }
                if (pallet_method == 'treasury:Deposit') {
                    if (data != undefined && Array.isArray(data)) {
                        try {
                            let tFee = paraTool.dechexToInt(data[0])
                            //console.log(`[${extrinsicID}] ${extrinsicHash} tFee=${tFee}`)
                            treasuryFee += tFee
                        } catch (e) {
                            console.log('unable to compute treasury fees!!', data, e)
                        }
                    }
                }
                if (pallet_method == 'transactionPayment:TransactionFeePaid') {
                    if (data != undefined && Array.isArray(data) && data.length == 4) {
                        try {
                            let actualFee = paraTool.dechexToInt(data[1])
                            let actualTip = paraTool.dechexToInt(data[2])
                            let actualSurplus = paraTool.dechexToInt(data[3])
                            let fee = actualFee + actualSurplus - actualTip
                            //console.log(`[${extrinsicID}] ${extrinsicHash} [${data[0]}] actualFee=${actualFee}, actualTip=${actualTip}, actualSurplus=${actualSurplus}, fee=${fee}`)
                            res.fee = fee
                        } catch (e) {
                            console.log('unable to compute treasury fees!!', data, e)
                        }
                    }
                }
                if (pallet_method == 'ethereum:Executed') {
                    //from, to, txhash
                    // data[3] is enum: {succeed/error/revert/fatal}
                    /*
                    { "succeed": "Returned"}
                    { "revert": "Reverted"}
                    { "error": ???}
                    { "fatal": ???}
                    */
                    if (data != undefined && Array.isArray(data)) {
                        try {
                            evmStatus.from = data[0]
                            evmStatus.to = data[1]
                            evmStatus.transactionHash = data[2]
                            let executionEnum = Object.keys(data[3])[0]
                            if (executionEnum == 'succeed') {
                                res.success = 1
                                res.err = null
                            } else {
                                // error/revert/fatal
                                res.success = 0
                                res.err = `Failed(${paraTool.firstCharUpperCase(executionEnum)})`
                            }
                            res.isEVM = evmStatus
                        } catch (e) {
                            console.log('unable to extra ethereum:Executed info!!', data, e)
                        }
                    }
                }
                for (let i = 0; i < dataType.length; i++) {
                    let dataType_i = dataType[i]
                    let data_i = data[i]
                    //if (extrinsicHash == '0xd50a05196fcc5794b44b19502dcb4aaa573fea0a510120fb1966fdd5ad76f119') console.log('dataType_i', dataType_i, 'data_i', data_i)
                    if (dataType_i.typeDef != undefined && dataType_i.typeDef == 'Result<Null, SpRuntimeDispatchError>') {
                        // SpRuntimeDispatchError can potentially return "ok" - exclude this case
                        if (!Object.keys(data_i).includes('ok')) {
                            //error detected
                            res.success = 0
                            let dataErr = data_i.err
                            if (dataErr != undefined) {
                                //console.log('error detected 1!!', res)
                                if (dataErr.module != undefined) {
                                    //error module here
                                    res.err = this.getErrorDoc(dataErr.module, apiAt)
                                } else {
                                    res.err = `Failed(Generic) ${JSON.stringify(dataErr)}`
                                }
                            }
                        }
                    }
                    //need to handle evm error..
                    if (pallet_method == 'system:ExtrinsicFailed') {
                        if (data_i.module != undefined && !errorSet) {
                            errorSet = true
                            res.success = 0
                            res.err = this.getErrorDoc(data_i.module, apiAt)
                            //console.log('error detected 2!!', res)
                        } else if (!errorSet) {
                            res.success = 0
                            res.err = `Failed(Generic) ${JSON.stringify(data_i)}`
                        }
                    }
                }
            }
        }
        /*
        if (extrinsicSectionMethod == 'ethereum:transact'){
            let surplus = (depositFeeList.length > 0)? depositFeeList[0] : 0
            res.fee = withdrawFee - surplus
            //console.log(`[${extrinsicID}] ${extrinsicHash} EVM fee=${res.fee}, depositFeeList=${depositFeeList}`)
        }
        */
        if (isUnsignedHead) {
            res.fee = 0
            //res.fee = depositFeeList[depositFeeList.length - 1]
            //console.log(`[${extrinsicID}] ${extrinsicHash} potential XCM fee=${res.fee}, depositFeeList=${depositFeeList}`)
        }
        if (withdrawFee == 0 && !isUnsignedHead) {
            // unusual extrinsic - (1) not paid by native token? (2) xcmPallet (3) partially paid?
            // use the highest fee computed
            res.fee = Math.max(withdrawFee, totalDepositFee, treasuryFee)
            if (isSigned && res.fee == 0) {
                // not sure if those are paid at all...
                //console.log(`unusual signed extrinsic [${extrinsicID}] ${extrinsicHash} - fee=${res.fee}, withdraw=${withdrawFee}, deposit=${totalDepositFee}, treasury=${treasuryFee}`)
            } else if (treasuryFee > 0) {
                // not sure if this case exist but will log and see what happens
                //console.log(`unusual unsined extrinsic [${extrinsicID}] ${extrinsicHash} - fee=${res.fee}, withdraw=${withdrawFee}, deposit=${totalDepositFee}, treasury=${treasuryFee}`)
            }
        }
        return res
    }

    async processRawFeedRewards(feed, rawFeedRewards, blockTS) {
        let feedRewards = []
        let era = false

        for (const rawFeedReward of rawFeedRewards) {
            if (rawFeedReward.section == "staking" && rawFeedReward.method == "PayoutStarted") {
                era = rawFeedReward.era
                continue
            } else if (rawFeedReward.section == "dappsStaking" && rawFeedReward.method == "Reward") {
                era = rawFeedReward.era
            }
            // skip the "zero" payout here
            if (rawFeedReward != undefined && rawFeedReward.value != undefined && rawFeedReward.value > 0) {
                let feedReward = await this.decorateFeedReward(feed, rawFeedReward, blockTS, era)
                feedRewards.push(feedReward)
                // console.log(feedReward)
            }
        }
        return feedRewards
    }

    async decorateFeedReward(feed, rawFeedReward, blockTS, era) {
        let feedReward = {}
        feedReward["chainID"] = this.chainID
        feedReward["blockNumber"] = feed.blockNumber
        feedReward["blockHash"] = feed.blockHash
        feedReward["ts"] = blockTS
        feedReward["eventID"] = rawFeedReward.eventID
        feedReward["extrinsicID"] = feed.extrinsicID
        feedReward["extrinsicHash"] = feed.extrinsicHash
        feedReward["section"] = rawFeedReward.section
        feedReward["method"] = rawFeedReward.method
        feedReward["account"] = rawFeedReward.account
        let accountAddress = paraTool.getPubKey(rawFeedReward.account)
        if (accountAddress) {
            feedReward["accountAddress"] = accountAddress
        }
        feedReward["amount"] = rawFeedReward.value
        if (era) {
            feedReward['era'] = era
        }
        let symbol = this.getChainSymbol(feed.chainID)
        let asset = `{"Token":"${symbol}"}`
        let decimals = this.getChainDecimal(feed.chainID)
        if (symbol && decimals !== false) {
            feedReward["rawAmount"] = feedReward["amount"];
            feedReward["amount"] = feedReward["amount"] / 10 ** decimals;
            let p = await this.computePriceUSD({
                val: feedReward["amount"],
                asset: asset,
                chainID: this.chainID,
                ts: blockTS
            })
            if (p) {
                feedReward["amountUSD"] = p.valUSD
                feedReward["priceUSD"] = p.priceUSD
            } else {
                feedReward["amountUSD"] = 0
                feedReward["priceUSD"] = 0
            }
            feedReward["asset"] = asset
            feedReward["symbol"] = symbol
            feedReward["decimals"] = decimals
        } else if (feedReward["amount"] != undefined) {
            feedReward["rawAmount"] = feedReward["amount"]
            feedReward["amount"] = null
            feedReward["asset"] = null
            feedReward["symbol"] = null
            feedReward["decimals"] = null
        }
        feedReward["genTS"] = this.currentTS();
        feedReward["source"] = this.hostname // add index source for debugging
        return feedReward
    }

    processRawFeedCrowdLoans(feed, rawFeedCrowdloans, blockTS, remarks) {
        let feedcrowdloans = []
        let feedcrowdloansMap = {}
        let era = false

        //let's assume crowdloan events come in pairs of Contributed+MemoUpdated or Contributed+remarks
        for (const rawFeedCrowdloan of rawFeedCrowdloans) {
            if (rawFeedCrowdloan.method == "Contributed") {
                let accountParaID = `${rawFeedCrowdloan.account}${rawFeedCrowdloan.paraID}`
                let crowdloanrec = this.decorateFeedCrowdLoan(feed, rawFeedCrowdloan, blockTS)
                if (feedcrowdloansMap[accountParaID] != undefined) {
                    delete crowdloanrec.remark
                    feedcrowdloansMap[accountParaID].amount = crowdloanrec.amount
                } else {
                    feedcrowdloansMap[accountParaID] = crowdloanrec
                }
            } else if (rawFeedCrowdloan.method == "MemoUpdated") {
                let accountParaID = `${rawFeedCrowdloan.account}${rawFeedCrowdloan.paraID}`
                let crowdloanrec = this.decorateFeedCrowdLoan(feed, rawFeedCrowdloan, blockTS)
                if (feedcrowdloansMap[accountParaID] != undefined) {
                    feedcrowdloansMap[accountParaID].memo = crowdloanrec.memo
                } else {
                    feedcrowdloansMap[accountParaID] = crowdloanrec
                }
            }
        }

        let remarkIndex = 0
        for (const accountParaID of Object.keys(feedcrowdloansMap)) {
            let feedcrowdloan = feedcrowdloansMap[accountParaID]
            if (feedcrowdloan.memo == null) {
                //maybe it's a remark contribution...
                if (remarks[remarkIndex] != undefined) {
                    feedcrowdloan.remark = remarks[remarkIndex]
                    remarkIndex++
                } else {
                    delete feedcrowdloan.remark
                }
                delete feedcrowdloan.memo
            }
            //console.log(feedcrowdloan)
            feedcrowdloans.push(feedcrowdloan)
        }
        return feedcrowdloans
    }

    decorateFeedCrowdLoan(feed, rawFeedCrowdloan, blockTS) {
        let feedcrowdloan = {}
        feedcrowdloan["chainID"] = this.chainID
        feedcrowdloan["blockNumber"] = feed.blockNumber
        feedcrowdloan["blockHash"] = feed.blockHash
        feedcrowdloan["ts"] = blockTS
        feedcrowdloan["eventID"] = rawFeedCrowdloan.eventID
        feedcrowdloan["extrinsicID"] = feed.extrinsicID
        feedcrowdloan["extrinsicHash"] = feed.extrinsicHash
        feedcrowdloan["section"] = rawFeedCrowdloan.section
        feedcrowdloan["method"] = rawFeedCrowdloan.method
        feedcrowdloan["account"] = rawFeedCrowdloan.account
        feedcrowdloan["paraID"] = rawFeedCrowdloan.paraID
        if (rawFeedCrowdloan.value) {
            feedcrowdloan["amount"] = rawFeedCrowdloan.value
            feedcrowdloan["memo"] = null
            feedcrowdloan["remark"] = null
        }
        if (rawFeedCrowdloan.memo) {
            feedcrowdloan["amount"] = 0
            feedcrowdloan["memo"] = rawFeedCrowdloan.memo
        }

        //feedReward["data"] = rawFeedReward
        feedcrowdloan["genTS"] = this.currentTS();
        feedcrowdloan["source"] = this.hostname // add index source for debugging
        return feedcrowdloan
    }


    //support both formats
    parseEventSectionMethod(e) {
        if (e.method != undefined && e.method.pallet != undefined) {
            return [e.method.pallet, e.method.method]
        } else {
            return [e.section, e.method]
        }
    }

    //support both formats
    parseExtrinsicSectionMethod(e) {
        if (e.method != undefined && e.method.pallet != undefined) {
            return [e.method.pallet, e.method.method]
        } else {
            return [e.section, e.method]
        }
    }

    map_feedTransfers_to_transfers(feedTransfers) {
        let transfers = [];
        let covered = {}
        for (const f of feedTransfers) {
            let k = `${f.extrinsicHash}-${f.fromAddress}-${f.toAddress}-${f.rawAmount}` // it's nearly impossible to have collision even dropping the asset
            //let k = `${f.fromAddress}-${f.toAddress}-${f.rawAmount}-${f.asset}`
            if (covered[k] == undefined) { // PROBLEM: no preference between redundant events
                covered[k] = 1;
                // copy key pieces of feedTransfer into transfer (skipping: chainID/extrinsicID/extrinsicHash/...)
                let t = {
                    eventID: f.eventID,
                    section: f.section,
                    method: f.method,
                    from: f.from,
                    to: f.to,
                    fromAddress: f.fromAddress,
                    toAddress: f.toAddress,
                    amount: f.amount,
                    rawAmount: f.rawAmount,
                    asset: f.asset,
                    //symbol: f.symbol,
                    //decimals: f.decimals
                }
                if (f.priceUSD > 0) t.priceUSD = f.priceUSD;
                if (f.amountUSD > 0) t.amountUSD = f.amountUSD;
                if (f.rawAsset != undefined) t.rawAsset = f.rawAsset;
                if (f.symbol != undefined) t.symbol = f.symbol;
                if (f.decimals != undefined) t.decimals = f.decimals;
                transfers.push(t);
            }
        }
        return transfers;
    }

    map_feedRewards_to_rewards(feedRewards) {
        let rewards = [];
        for (const f of feedRewards) {
            let t = {
                eventID: f.eventID,
                section: f.section,
                method: f.method,
                account: f.account,
                accountAddress: f.accountAddress,
                amount: f.amount,
                rawAmount: f.rawAmount,
                asset: f.asset
            }
            if (f.priceUSD > 0) t.priceUSD = f.priceUSD;
            if (f.amountUSD > 0) t.amountUSD = f.amountUSD;
            if (f.rawAsset != undefined) t.rawAsset = f.rawAsset;
            if (f.symbol != undefined) t.symbol = f.symbol;
            if (f.decimals != undefined) t.decimals = f.decimals;
            rewards.push(t);
        }
        return rewards;
    }

    // we wait until the end of the block to do the call -- these are only for accounts on the tip if traces are not available
    flagAddressBalanceRequest(address, reaped = false) {
        this.addressBalanceRequest[address] = {
            blockNumber: this.chainParser.parserBlockNumber,
            blockTS: this.chainParser.parserTS,
            blockHash: this.chainParser.parserBlockHash,
            reaped: reaped
        };
        // console.log("flagAddressBalanceRequest", address, this.chainParser.parserBlockNumber, this.chainParser.parserTS, this.chainParser.parserBlockHash, reaped);
    }

    async dump_addressBalanceRequest() {
        // queue requests in address${chainID} so streaming process can work through requests
        let addresses = Object.keys(this.addressBalanceRequest);
        if (addresses.length == 0) return;
        let out = [];
        let vals = ["free", "reserved", "miscFrozen", "frozen", "blockHash", "lastUpdateDT", "lastUpdateBN", "blockTS", "requested"];
        let rows = [];
        for (const address of addresses) {
            let r = this.addressBalanceRequest[address];
            if (r == undefined) continue;
            let free_balance = 0;
            let reserved_balance = 0;
            let miscFrozen_balance = 0;
            let feeFrozen_balance = 0;
            try {
                let query = await this.api.query.system.account(address);
                let balance = query.data;
                let decimals = this.getChainDecimal(this.chainID)
                if (balance.free) free_balance = parseInt(balance.free.toString(), 10) / 10 ** decimals;
                if (balance.reserved) reserved_balance = balance.reserved.toString() / 10 ** decimals;
                if (balance.miscFrozen) miscFrozen_balance = balance.miscFrozen.toString() / 10 ** decimals;
                if (balance.feeFrozen) feeFrozen_balance = balance.feeFrozen.toString() / 10 ** decimals;
            } catch (err) {
                this.logger.error({
                    "op": "dump_addressBalanceRequest",
                    "chainID": this.chainID,
                    "address": address,
                    err
                })
            }


            let str = `('${address}', '${free_balance}', '${reserved_balance}', '${miscFrozen_balance}', '${feeFrozen_balance}', '${r.blockHash}', Now(), '${r.blockNumber}', '${r.blockTS}',   2)`
            out.push(str)
            //console.log("dump_addressBalanceRequest", str);

            let asset = this.getChainAsset(this.chainID);
            let assetChain = paraTool.makeAssetChain(asset, this.chainID);
            let encodedAssetChain = paraTool.encodeAssetChain(assetChain)
            let rec = {};
            let newState = {
                free: free_balance,
                reserved: reserved_balance,
                miscFrozen: miscFrozen_balance,
                feeFrozen: feeFrozen_balance,
                frozen: feeFrozen_balance,
                ts: r.blockTS,
                bn: r.blockNumber,
                source: this.hostname,
                genTS: this.currentTS()
            };
            let rowKey = address.toLowerCase()
            await this.insertAccountRealtime(rowKey, encodedAssetChain, r.blockTS, JSON.stringify(newState));
        }


        rows = [];
        await this.upsertSQL({
            "table": `address${this.chainID}`,
            "keys": ["address"],
            "vals": vals,
            "data": out,
            "lastUpdateBN": vals
        });
        // TODO OPTIMIZATION: also write placeholder in "accountrealtime" (in "request" column family) which can mark the need to do work on the client (ie when traces are not available)
        this.addressBalanceRequest = {}
    }

    async process_extrinsic(api, extrinsicRaw, eventsRaw, block, index, finalized = false, isTip = false, tracesPresent = false) {
        let blockNumber = block.header.number;
        let blockHash = block.hash;
        let blockTS = block.blockTS;
        let extrinsicID = blockNumber + "-" + index;
        // must do extrinsicHash, isSigned here. information is lost after decode_s_extrinsic
        let extrinsicHash = extrinsicRaw.hash.toHex();

        let extrinsic = this.decode_s_extrinsic(extrinsicRaw, blockNumber, index, api);
        if (!extrinsic.method) {
            // TODO: onInitialize, onFinalize
            return (extrinsic);
        }
        let isSigned = this.isExtrinsicSigned(extrinsic)


        let success = false;
        extrinsic.events = eventsRaw

        //(ed25519 and sr25519 do not have id?)
        let signer = false
        if (extrinsic.signature.signer.id != undefined) {
            signer = extrinsic.signature.signer.id
        } else if (extrinsic.signature.signer != undefined) {
            signer = extrinsic.signature.signer
        }

        let res = this.checkExtrinsicStatusAndFee(api, extrinsic, extrinsicHash, extrinsicID, isSigned, signer)
        let chainDecimal = this.getChainDecimal(this.chainID)
        if (isSigned) {
            extrinsic.signature.tip = extrinsic.signature.tip / 10 ** chainDecimal
        }
        let evmTxStatus = false
        if (res.isEVM) {
            evmTxStatus = res.isEVM
            let evmTxHash = evmTxStatus.transactionHash
            // add extrinsicEvmMap here to link evmTX <=> substrateTX
            this.extrinsicEvmMap[evmTxHash] = {
                extrinsicID: extrinsicID,
                extrinsicHash: extrinsicHash
            }
        }

        extrinsic.fee = res.fee / 10 ** chainDecimal
        extrinsic.success = res.success
        if (extrinsic.success == 0) {
            extrinsic.err = res.err
            //console.log(`failedTX [${extrinsicID}] ${extrinsicHash}`, JSON.stringify(res))
            //console.log(JSON.stringify(extrinsic))
        }
        if (!(extrinsic.signature)) {
            return (extrinsic);
        }

        // fromAddress is pubkey representation common to ALL substrate chains
        //let fromAddress = isSigned ? paraTool.getPubKey(signer) : "NONE";
        let fromAddress = "NONE"
        try {
            fromAddress = isSigned ? paraTool.getPubKey(signer) : "NONE";
        } catch (e) {
            console.log("getPubKey error", e)
        }

        let params = extrinsic.args;

        let nonce = isSigned ? extrinsic.signature.nonce : 0 //non-signed extrinsic has by default 0 nonce

        let tip = isSigned ? extrinsic.signature.tip : 0 //non-signed extrinsic has by default 0 tip
        let txFee = extrinsic.fee
        let txResult = extrinsic.success
        let txErr = (extrinsic.success == 0) ? extrinsic.err : ''

        let txLifetime = (extrinsic.lifetime != undefined) ? extrinsic.lifetime : false

        let sigs = extrinsic.signature
        sigs.fee = extrinsic.fee
        let result = {
            success: res.success,
            err: res.err
        }

        // "rExtrinsic" cleaned output - same output should be used for storing block-extrinsics + feed, and any additional processing (processExtrinsicEvents/processXCMTransfer)
        let [exSection, exMethod] = this.parseExtrinsicSectionMethod(extrinsic)
        let rExtrinsic = {
            chainID: this.chainID,
            ts: blockTS,
            blockHash: blockHash,
            blockNumber: blockNumber,
            extrinsicID: extrinsicID,
            extrinsicHash: extrinsicHash,
            evm: null,
            signer: isSigned ? signer : null,
            signature: isSigned ? extrinsic.signature.signature : null,
            lifetime: txLifetime,
            nonce: nonce,
            tip: tip,
            fee: txFee,
            result: txResult,
            err: null,
            section: exSection,
            method: exMethod,
            params: extrinsic.args,
            events: extrinsic.events,
        }
        if (evmTxStatus) {
            rExtrinsic.evm = evmTxStatus;
        } else {
            delete rExtrinsic.evm;
        }
        if (txResult) {
            delete rExtrinsic.err;
        } else {
            rExtrinsic.err = txErr
        }

        if (!isSigned) {
            this.chainParser.processIncomingXCM(this, rExtrinsic, extrinsicID, eventsRaw, isTip, finalized);
        }
        try {
            // feed is used for {feed, feedTransfer, feedRewards}
            var feed = {};
            feed = rExtrinsic
            feed.encodedCalls = extrinsic.encodedCalls
            feed["genTS"] = this.currentTS();
            this.chainParser.processExtrinsicEvents(this, rExtrinsic.section, rExtrinsic.method, rExtrinsic.events);
            let isSuccess = (rExtrinsic.err == undefined) ? true : false //skip feedtransfer/feedxcm/feedreward/feedcrowdloan processing if is failure case
            if (isSuccess) {
                /* process feedtransfer:
                feedtransfer keeps a list of incoming transfers
                for outgoing transfer, we set isIncoming to 0 and addresss as senderAddress
                */
                let feedTransfers = await this.processFeedTransfer(feed, blockTS)
                let valueExtrinsicUSD = 0;
                for (const feedTransfer of feedTransfers) {
                    if (fromAddress != "NONE" && feedTransfer["fromAddress"] != undefined && feedTransfer["amountUSD"] != undefined) {
                        if (fromAddress == feedTransfer["fromAddress"]) {
                            let amountUSD = feedTransfer["amountUSD"];
                            if (amountUSD > valueExtrinsicUSD) {
                                valueExtrinsicUSD = amountUSD;
                            }
                        }
                    }

                    // incoming transfers (recipient)
                    let receiptAddress = paraTool.getPubKey(feedTransfer.to)

                    await this.updateAddressExtrinsicStorage(receiptAddress, extrinsicID, extrinsicHash, "feedtransfer", feedTransfer, blockTS, block.finalized);

                    // outgoing transfers (sender)
                    let senderAddress = paraTool.getPubKey(feedTransfer.from)
                    let outgoingFeedTransfer = feedTransfer
                    outgoingFeedTransfer.isIncoming = 0

                    await this.updateAddressExtrinsicStorage(senderAddress, extrinsicID, extrinsicHash, "feedtransfer", outgoingFeedTransfer, blockTS, block.finalized);
                }

                if (valueExtrinsicUSD > 0) {
                    feed["v"] = valueExtrinsicUSD;
                }
                if (feedTransfers.length > 0) {
                    feed["transfers"] = this.map_feedTransfers_to_transfers(feedTransfers);
                }

                //TODO: add shibuya testnet later
                if (this.chainID == paraTool.chainIDAstar || this.chainID == paraTool.chainIDShiden || this.chainID == paraTool.chainIDShibuya) {
                    this.chainParser.processWasmContracts(this, rExtrinsic, feed, fromAddress, false, false, false);
                }

                //check the "missed" xcm case - see if it contains xTokens event not triggered by pallet
                this.chainParser.processOutgoingXCMFromXTokensEvent(this, rExtrinsic, feed, fromAddress, false, false, false);

                if (rExtrinsic.xcms == undefined) {
                    // process xcmtransfer extrinsic params
                    this.chainParser.processOutgoingXCM(this, rExtrinsic, feed, fromAddress, false, false, false); // we will temporarily keep xcms at rExtrinsic.xcms and remove it afterwards
                } else if (rExtrinsic.xcms != undefined && Array.isArray(rExtrinsic.xcms)) {
                    // check if fallback is required
                    let fallbackRequired = false
                    for (const xcm of rExtrinsic.xcms) {
                        if (xcm.destAddress == undefined || xcm.destAddress == false) {
                            if (xcm.msgHash != undefined) {
                                let beneficiary = this.getBeneficiaryFromMsgHash(xcm.msgHash)
                                if (beneficiary) {
                                    xcm.destAddress = beneficiary
                                    console.log(`patch destAddress using beneficiary [${rExtrinsic.extrinsicID}] [${rExtrinsic.extrinsicHash}] B=${beneficiary}`)
                                } else {
                                    fallbackRequired = true
                                }
                            } else if (xcm.innerCall != undefined) {
                                // lookup msgHash using innerCall -- it shouldn't be empty?
                                let msgHashCandidate = this.getMsgHashCandidate(xcmtransfer.blockNumber, xcm.innerCall, rExtrinsic.extrinsicID, rExtrinsic.extrinsicHash, 'innercall')
                                if (msgHashCandidate) xcmtransfer.msgHash = msgHashCandidate
                                //accept the fact that this xcm doesn not have destAddress
                            } else {
                                console.log(`fallback Required [${rExtrinsic.extrinsicID}] [${rExtrinsic.extrinsicHash}] [${xcm.xcmIndex}-${xcm.transferIndex}]`)
                                fallbackRequired = true
                            }
                        }
                    }
                    //destAddress is missing from events
                    if (fallbackRequired) {
                        delete rExtrinsic.xcms
                        this.chainParser.processOutgoingXCM(this, rExtrinsic, feed, fromAddress, false, false, false); // we will temporarily keep xcms at rExtrinsic.xcms and remove it afterwards
                    }
                }

                // signed Extrinsic are guranteed to be consistent, regardless of proposer
                // unsigned Extrinsic is NOT guranteed to bo consistent, therefore we shouldn't write it unless it's finalized
                let isXcmTipSafe = false
                if (isSigned || finalized) {
                    isXcmTipSafe = true
                }

                if (rExtrinsic.xcms != undefined && Array.isArray(rExtrinsic.xcms) && rExtrinsic.xcms.length > 0) {
                    if (this.debugLevel >= paraTool.debugInfo) console.log(`[${rExtrinsic.extrinsicID}] [${rExtrinsic.section}:${rExtrinsic.method}] xcmCnt=${rExtrinsic.xcms.length}`, rExtrinsic.xcms)
                    if (isXcmTipSafe) {
                        if (this.debugLevel >= paraTool.debugInfo && !finalized) console.log(`safeXcmTip [${rExtrinsic.extrinsicID}] [${rExtrinsic.section}:${rExtrinsic.method}] xcmCnt=${rExtrinsic.xcms.length}`)
                        for (const xcmtransfer of rExtrinsic.xcms) {
                            //Look up msgHash
                            if (xcmtransfer.msgHash == undefined || xcmtransfer.msgHash.length != 66) {
                                let msgHashCandidate;
                                if (xcmtransfer.innerCall != undefined) {
                                    msgHashCandidate = this.getMsgHashCandidate(xcmtransfer.blockNumber, xcmtransfer.innerCall, rExtrinsic.extrinsicID, rExtrinsic.extrinsicHash, 'innercall')
                                } else {
                                    msgHashCandidate = this.getMsgHashCandidate(xcmtransfer.blockNumber, xcmtransfer.destAddress, rExtrinsic.extrinsicID, rExtrinsic.extrinsicHash, 'address')
                                }
                                if (msgHashCandidate) xcmtransfer.msgHash = msgHashCandidate
                            }

                            await this.updateAddressExtrinsicStorage(fromAddress, extrinsicID, extrinsicHash, "feedxcm", xcmtransfer, blockTS, block.finalized); //not sure about bt write here..

                            // build pendingXCMInfo here
                            let pendingXcmInfo = await this.buildPendingXcmInfo(xcmtransfer, rExtrinsic)
                            if (this.debugLevel >= paraTool.debugInfo) console.log(`pendingXcmInfo [${xcmtransfer.extrinsicID}] [${xcmtransfer.extrinsicHash}]`, pendingXcmInfo)
                            xcmtransfer.xcmInfo = pendingXcmInfo
                            await this.updateXCMTransferStorage(xcmtransfer, isTip, finalized); // store, flushed in flushXCM
                        }
                    } else {
                        if (this.debugLevel >= paraTool.debugInfo) console.log(`unsafeXcmTip [${rExtrinsic.extrinsicID}] [${rExtrinsic.section}:${rExtrinsic.method}] xcmCnt=${rExtrinsic.xcms.length} - skip`)
                        for (const xcmtransfer of rExtrinsic.xcms) {
                            //Look up msgHash
                            let unsafeXcmtransfer = xcmtransfer
                            if (unsafeXcmtransfer.msgHash == undefined || unsafeXcmtransfer.msgHash.length != 66) {
                                let msgHashCandidate;
                                if (unsafeXcmtransfer.innerCall != undefined) {
                                    msgHashCandidate = this.getMsgHashCandidate(unsafeXcmtransfer.blockNumber, unsafeXcmtransfer.innerCall, rExtrinsic.extrinsicID, rExtrinsic.extrinsicHash, 'innercall')
                                } else {
                                    msgHashCandidate = this.getMsgHashCandidate(unsafeXcmtransfer.blockNumber, unsafeXcmtransfer.destAddress, rExtrinsic.extrinsicID, rExtrinsic.extrinsicHash, 'address')
                                }
                                if (msgHashCandidate) unsafeXcmtransfer.msgHash = msgHashCandidate
                            }
                            //for unsafeXcmtransfer. we will send xcmtransfer that may eventually got dropped

                        }
                    }
                    delete rExtrinsic.xcms
                }

                if (block.finalized) {
                    // filter events into proxyEvents, rewardEvents, crowdloanEvents, reapingEvents, multisigEvents
                    let proxyEvents = [];
                    let rewardEvents = [];
                    let crowdloanEvents = [];
                    let reapingEvents = [];
                    extrinsic.events.forEach((ev) => {
                        let palletMethod = `${ev.section}(${ev.method})`
                        if (this.chainParser.proxyFilter(palletMethod)) {
                            proxyEvents.push(ev);
                        } else if (this.chainParser.rewardFilter(palletMethod)) {
                            rewardEvents.push(ev);
                        } else if (this.chainParser.crowdloanFilter(palletMethod)) {
                            crowdloanEvents.push(ev);
                        } else if (isTip && tracesPresent && this.chainParser.reapingFilter(palletMethod)) {
                            reapingEvents.push(ev);
                        }
                    })

                    // (a) process proxyEvents
                    if (proxyEvents.length > 0) {
                        let rawProxies = proxyEvents.map((pe) => {
                            return this.chainParser.prepareFeedProxy(this, pe.section, pe.method, pe.data, pe.eventID);
                        })
                        // step 3 - set proxyEvent if any turn up
                        for (const rawProxyRec of rawProxies) {
                            // mostly likely it's array of 1 element
                            if (rawProxyRec) {
                                this.updateProxyMap(rawProxyRec)
                            }
                        }
                    }

                    // (b) process rewardEvents into feedrewards
                    if (rewardEvents.length > 0) {
                        let rawFeedRewards = rewardEvents.map((re) => {
                            return this.chainParser.prepareFeedReward(this, re.section, re.method, re.data, re.eventID);
                        })
                        // decorate RawFeedReward using the "feed" we build
                        let feedRewards = await this.processRawFeedRewards(feed, rawFeedRewards, blockTS)
                        //console.log(`feedRewards`, feedRewards)
                        for (const feedreward of feedRewards) {
                            // TODO: can a same address get touched twice with an extrinsic?
                            // claim: it's possible but super rare
                            let toAddress = paraTool.getPubKey(feedreward.account)
                            // (3) acct:feedreward -> recFeedreward (can be processed immediately)

                            await this.updateAddressExtrinsicStorage(toAddress, extrinsicID, extrinsicHash, "feedreward", feedreward, blockTS, block.finalized);
                        }
                        if (feedRewards.length > 0) {
                            feed["rewards"] = this.map_feedRewards_to_rewards(feedRewards);
                        }
                    }

                    // (c) process crowdloanEvents into feedcrowdloan
                    if (crowdloanEvents.length > 0) {
                        let rawFeedCrowdloans = crowdloanEvents.map((ce) => {
                            return this.chainParser.prepareFeedcrowdloan(this, ce.section, ce.method, ce.data, ce.eventID);
                        })

                        let feedCrowdLoans = this.processRawFeedCrowdLoans(feed, rawFeedCrowdloans, blockTS, extrinsic.remarks)
                        for (const feedcrowdloan of feedCrowdLoans) {
                            // TODO: can a same address get touched twice with an extrinsic?
                            // claim: it's possible but super rare
                            let toAddress = paraTool.getPubKey(feedcrowdloan.account)
                            //TODO:should the key include event index?
                            // (3) acct:feedcrowdloan -> recFeedcrowdloan (can be processed immediately)

                            //console.log(`${toAddress} feedcrowdloan`, feedcrowdloan)
                            await this.updateAddressExtrinsicStorage(toAddress, extrinsicID, extrinsicHash, "feedcrowdloan", feedcrowdloan, blockTS, block.finalized);
                            this.updateCrowdloanStorage(feedcrowdloan);
                        }
                    }

                    // process reapingEvents
                    if (reapingEvents.length > 0) {
                        reapingEvents.forEach((ev) => {
                            // from the event, get the pubkey of the account being reaped and flag it for a balance query
                            let palletMethod = `${ev.section}(${ev.method})`
                            let accountIDIdx = 0;
                            if (palletMethod == "balances(DustLost)" || palletMethod == "system(KilledAccount)") {
                                accountIDIdx = 0
                                //} else if (palletMethod == "tokens(DustLost)") {
                                //   accountIDIdx = 1
                            }
                            let accountID = ev.data[accountIDIdx]
                            let reapedAddress = paraTool.getPubKey(accountID)
                            if (reapedAddress) {
                                this.flagAddressBalanceRequest(reapedAddress, true);
                            }
                        })
                    }

                    // if this is a multisig extrinsic, update map
                    let multisigRec = this.chainParser.processMultisig(this, rExtrinsic, feed, fromAddress);
                    if (multisigRec) {
                        this.updateMultisigMap(multisigRec)
                    }
                }


            }

            if (this.validAddress(fromAddress)) {
                // (4) txn (can be processed immediately)
                await this.updateAddressExtrinsicStorage(fromAddress, extrinsicID, extrinsicHash, "feed", feed, blockTS, block.finalized);
            }

            this.insertHash(extrinsicHash, JSON.stringify(feed), blockTS, finalized, "extrinsic");
        } catch (err) {
            this.log_indexing_error(err, "processBlock")
        }

        return (rExtrinsic);
    }

    async buildPendingXcmInfo(xcmtransfer, extrinsic) {
        let x = xcmtransfer // need deep clone?
        //build systhetic xcmInfo here when xcmInfo is not set yet
        //if (this.debugLevel >= paraTool.debugTracing) console.log(`buildPendingXcmInfo xcmtransfer`, x)
        //if (this.debugLevel >= paraTool.debugTracing) console.log(`buildPendingXcmInfo extrinsic`, extrinsic)
        try {
            let sectionPieces = x.sectionMethod.split(':')
            let xSection = null,
                xMethod = null;
            if (sectionPieces.length == 2) {
                xSection = sectionPieces[0];
                xMethod = sectionPieces[1];
            }

            /*
            let substrateTxHash = x.extrinsicHash
            let substratetx;
            try {
                substratetx = await this.getTransaction(substrateTxHash);
            } catch (err) {
                console.log("looking for", substrateTxHash, err);
            }
            let sourceTxFeeUSD = (substratetx.feeUSD != undefined) ? substratetx.feeUSD : null
            let sourceChainSymbol = this.getChainSymbol(chainID)
            let evmTransactionHash = null
            if (substratetx.evm != undefined && substratetx.evm.transactionHash != undefined) {
                evmTransactionHash = substratetx.evm.transactionHash
                let evmtx = await this.getTransaction(evmTransactionHash, decorate, decorateExtra, false);
                if (!evmtx) return [false, false]
                sourceTxFee = evmtx.fee
                sourceTxFeeUSD = evmtx.feeUSD
                sourceChainSymbol = evmtx.symbol
            }
            */

            // looks up assetInfo
            let symbolRelayChain = paraTool.makeAssetChain(x.xcmSymbol, x.relayChain);
            let sourceTxFee = (extrinsic.fee != undefined && extrinsic.fee > 0) ? extrinsic.fee : null //can't do evm fee for now
            let sourceTxFeeUSD = null
            let sourceChainSymbol = this.getChainSymbol(x.chainID)
            if (sourceTxFee != undefined) {
                let inp = {
                    val: sourceTxFee,
                    symbol: sourceChainSymbol,
                    relayChain: x.relayChain,
                    ts: x.sourceTS
                }
                let p = await this.computePriceUSD(inp);
                if (this.debugLevel >= paraTool.debugTracing) console.log(`computePriceUSD fee`, p)
                if (p) {
                    x.sourceTxFeeUSD = p.valUSD;
                }
            }


            let assetInfo = this.getXcmAssetInfoBySymbolKey(symbolRelayChain);
            let amountSent = x.amountSent
            if (assetInfo) {
                x.decimals = assetInfo.decimals;
                amountSent = x.amountSent / 10 ** x.decimals;
                x.priceUSD = null;
                x.amountSentUSD = null;
                let inp = {
                    val: amountSent,
                    symbol: x.xcmSymbol,
                    relayChain: x.relayChain,
                    ts: x.sourceTS
                }

                let p = await this.computePriceUSD(inp);

                if (this.debugLevel >= paraTool.debugTracing) console.log(`computePriceUSD p`, p)
                if (p) {
                    x.amountSentUSD = p.valUSD;
                    x.priceUSD = p.priceUSD;
                }
                //x.amountReceived = x.amountReceived / 10 ** x.decimals;
                //x.xcmFee = amountSent - x.amountReceived
                x.symbol = assetInfo.symbol;
                //if (assetInfo.localSymbol) x.localSymbol = assetInfo.localSymbol;
            } else {
                console.log(`[${x.extrinsicHash}] [${x.extrinsicID}] MISSING x.asset`, x.asset, x.chainID);
            }

            if (x.chainID != undefined) {
                let [_, id] = this.convertChainID(x.chainID)
                //[x.chainIDDest, x.idDest] = this.convertChainID(x.chainIDDest)
                x.id = (id == false) ? null : id
                x.chainName = this.getChainName(x.chainID);
                x.paraIDDest = paraTool.getParaIDfromChainID(x.chainID)
                let chainIDOriginationInfo = this.chainInfos[x.chainID]
                if (chainIDOriginationInfo != undefined && chainIDOriginationInfo.ss58Format != undefined) {
                    if (x.fromAddress != undefined) {
                        if (x.fromAddress.length == 42) x.sender = x.fromAddress
                        if (x.fromAddress.length == 66) x.sender = paraTool.getAddress(x.fromAddress, chainIDOriginationInfo.ss58Format)
                    }
                }
            }
            if (x.chainIDDest != undefined) {
                let [_, idDest] = this.convertChainID(x.chainIDDest)
                //[x.chainIDDest, x.idDest] = this.convertChainID(x.chainIDDest)
                x.idDest = (idDest == false) ? null : idDest
                x.chainDestName = this.getChainName(x.chainIDDest);
                x.paraIDDest = paraTool.getParaIDfromChainID(x.chainIDDest)
                let chainIDDestInfo = this.chainInfos[x.chainIDDest]
                if (chainIDDestInfo != undefined && chainIDDestInfo.ss58Format != undefined) {
                    if (x.destAddress != undefined) {
                        if (x.destAddress.length == 42) x.beneficiary = x.destAddress
                        if (x.destAddress.length == 66) x.beneficiary = paraTool.getAddress(x.destAddress, chainIDDestInfo.ss58Format)
                    }
                }
            }

            //(xcmtransfer.destStatus = 0 and xcmtransfer.incomplete = 0) or xcmtransfer.incomplete = 1)
            let failureType = null
            //if (x.destStatus == 0 && x.incomplete == 0) failureType = 'failedDestination'
            if (x.incomplete == 1) failureType = 'failedOrigination'
            let xcmInfo = {
                symbol: x.symbol,
                priceUSD: (x.priceUSD != undefined) ? x.priceUSD : null,
                relayChain: null,
                origination: null,
                destination: null,
                version: 'V2',
            }
            xcmInfo.relayChain = {
                relayChain: this.relayChain,
                relayAt: (failureType == 'failedOrigination') ? null : x.sentAt, //?
            }

            xcmInfo.origination = {
                chainName: x.chainName,
                id: x.id,
                chainID: x.chainID,
                paraID: x.paraID,
                sender: x.sender,
                amountSent: (failureType == 'failedOrigination') ? 0 : amountSent,
                amountSentUSD: (failureType == 'failedOrigination') ? 0 : x.amountSentUSD,
                txFee: sourceTxFee,
                txFeeUSD: sourceTxFeeUSD,
                txFeeSymbol: sourceChainSymbol,
                blockNumber: x.blockNumber,
                section: xSection,
                method: xMethod,
                extrinsicID: x.extrinsicID,
                extrinsicHash: x.extrinsicHash,
                //transactionHash: evmTransactionHash,
                msgHash: x.msgHash,
                sentAt: x.sentAt,
                ts: x.sourceTS,
                complete: (x.incomplete) ? false : true,
            }
            //if (evmTransactionHash == undefined) delete xcmInfo.origination.transactionHash;
            if (failureType != undefined) {
                xcmInfo.destination = {
                    chainName: x.chainDestName,
                    id: x.idDest,
                    chainID: x.chainIDDest,
                    paraID: x.paraIDDest,
                    beneficiary: (x.beneficiary != undefined) ? x.beneficiary : null,
                    amountReceived: 0,
                    amountReceivedUSD: 0,
                    teleportFee: 0,
                    teleportFeeUSD: 0,
                    teleportFeeChainSymbol: x.symbol,
                    blockNumber: null,
                    extrinsicID: null,
                    eventID: null,
                    ts: null,
                    status: false,
                    error: {},
                }
                if (failureType == 'failedDestination') {
                    //xcmInfo.destination.error = this.getXcmErrorDescription(x.errorDesc) TODO..
                } else {
                    xcmInfo.destination.extrinsicID = null
                    xcmInfo.destination.error = {
                        errorCode: `NA`,
                        errorType: `FailedAtOriginationChain`,
                        errorDesc: `XCM Failed at origination Chain.`,
                    }
                }
            } else {
                xcmInfo.destination = {
                    chainName: x.chainDestName,
                    id: x.idDest,
                    chainID: x.chainIDDest,
                    paraID: x.paraIDDest,
                    beneficiary: (x.beneficiary != undefined) ? x.beneficiary : null,
                    amountReceived: null,
                    amountReceivedUSD: null,
                    teleportFee: null,
                    teleportFeeUSD: null,
                    teleportFeeChainSymbol: x.symbol,
                    blockNumber: null,
                    //extrinsicID: x.destExtrinsicID,
                    eventID: null,
                    ts: null,
                    status: false,
                }
            }
            //console.log(`synthetic xcmInfo [${x.extrinsicHash}]`, xcmInfo)
            return xcmInfo
        } catch (e) {
            console.log(`buildPendingXcmInfo [${x.extrinsicID}]  [${x.extrinsicHash}] err`, e)
            return false
        }
    }

    get_block_timestamp(block) {
        return (block.blockTS);
    }

    getBlockStats(block, events, evmBlock = false, evmReceipts = false, autoTraces = false) {
        let blockStats = {
            numExtrinsics: block.extrinsics.length,
            numSignedExtrinsics: 0,
            numTransfers: 0,
            numEvents: events.length,
            valueTransfersUSD: 0,
            fees: 0,
        }
        if (autoTraces && Array.isArray(autoTraces)) {
            blockStats.numTraceRecords = autoTraces.length
        }
        if (evmBlock) {
            blockStats.numTransactionsEVM = evmBlock.transactions.length;
            blockStats.numTransactionsInternalEVM = evmBlock.transactionsInternal ? evmBlock.transactionsInternal.length : 0;
        }
        if (evmReceipts) {
            blockStats.numReceiptsEVM = ethTool.computeNumEvmlogs(evmReceipts);
        }
        block.extrinsics.forEach((extrinsic, index) => {
            if (this.isExtrinsicSigned(extrinsic)) blockStats.numSignedExtrinsics++;
            if (extrinsic.fee != undefined && extrinsic.fee > 0) {
                blockStats.fees += extrinsic.fee;
            }
            let numTransfers = extrinsic.transfers ? extrinsic.transfers.length : 0;
            let valueTransfersUSD = 0;
            if (numTransfers > 0) {
                for (const t of extrinsic.transfers) {
                    if (t.amountUSD != undefined) {
                        valueTransfersUSD += t.amountUSD
                    }
                }
            }
            blockStats.numTransfers += numTransfers
            blockStats.valueTransfersUSD += valueTransfersUSD
        });

        return (blockStats);
    }

    getErc20LPAssetChain(tokenAddress, chainID) {
        // Store in lower case
        let lowerAsset = `${tokenAddress.toLowerCase()}:LP`
        return paraTool.makeAssetChain(lowerAsset, chainID);
    }

    getErc721TokenAssetChain(tokenAddress, chainID) {
        // Store in lower case
        let lowerAsset = tokenAddress.toLowerCase()
        let lowerAssetKey = JSON.stringify({
            ERC721: tokenAddress
        })
        return paraTool.makeAssetChain(lowerAssetKey, chainID);
    }

    getErc721TokenIDAssetChain(tokenAddress, tokenID, chainID) {
        // Store in lower case
        let lowerAsset = tokenAddress.toLowerCase()
        let lowerAssetKey = JSON.stringify({
            ERC721: tokenAddress,
            tokenID: ethTool.computeTokenIDHex(tokenID)
        })
        return paraTool.makeAssetChain(lowerAssetKey, chainID);
    }

    getErc1155TokenAssetChain(tokenAddress, chainID) {
        // Store in lower case
        let lowerAsset = tokenAddress.toLowerCase()
        let lowerAssetKey = JSON.stringify({
            ERC1155: tokenAddress
        })
        return paraTool.makeAssetChain(lowerAssetKey, chainID);
    }

    initERCAssetOnCache(assetChain, tokenInfo, isXcAsset = false) {
        let assetType = tokenInfo.assetType
        if (this.tallyAsset[assetChain] == undefined) {
            this.tallyAsset[assetChain] = tokenInfo
            //console.log(`${assetChain}`, this.tallyAsset[assetChain])
            let contractAddress = tokenInfo.tokenAddress.toLowerCase()
            this.ercTokenList[contractAddress] = tokenInfo;
            //console.log('CONTRACT Init ON Cache', assetType, assetChain, tokenInfo);
        }
    }

    initERCAssetOnMiss(assetChain, tokenInfo, assetType, isXcAsset = false) {
        tokenInfo.assetType = assetType;
        if (this.tallyAsset[assetChain] == undefined) {
            this.tallyAsset[assetChain] = tokenInfo
            //console.log(`${assetChain}`, this.tallyAsset[assetChain])
            let contractAddress = tokenInfo.tokenAddress.toLowerCase()
            this.ercTokenList[contractAddress] = tokenInfo;
            console.log('CONTRACT FETCH ON MISS', assetType, assetChain);
        }
    }

    initERCAsset(assetChain, tokenInfo, tx, assetType) {
        tokenInfo.creator = tx.from;
        tokenInfo.createdAtTx = tx.transactionHash;
        tokenInfo.assetType = assetType;
        tokenInfo.createTS = tx.timestamp;
        if (this.tallyAsset[assetChain] == undefined) {
            this.tallyAsset[assetChain] = tokenInfo
            let contractAddress = tokenInfo.tokenAddress.toLowerCase()
            this.ercTokenList[contractAddress] = tokenInfo;
            console.log('CONTRACT CREATE', assetType, assetChain, tokenInfo);
        }
    }

    async process_evm_contract_create(tx, chainID, finalized = false, isTip = false) {
        // waterfall model: use `getERC20TokenInfo` to categorize ERC20 contract first. if doesn't work, we will try erc720 next, and then erc1155..
        let web3Api = this.web3Api
        let bn = tx.blockNumber
        let contractAddress = tx.creates
        // ethTool rpccall (4)
        let erc20TokenInfo = await ethTool.getERC20TokenInfo(web3Api, contractAddress, bn)
        if (erc20TokenInfo) {
            // store in ercTokenList + tallyAsset, flushed in flushShort/flusTokens
            let ercType = paraTool.assetTypeERC20

            // ethTool rpccall (5)
            let lpTokenInfo = await ethTool.getERC20LiquidityPairTokenInfo(web3Api, contractAddress, bn)
            if (!lpTokenInfo) {
                this.cacheNonCompliantLP(contractAddress)
            }
            erc20TokenInfo.lpInfo = lpTokenInfo
            /*
            if (lpTokenInfo) {
                ercType = paraTool.assetTypeERC20LiquidityPair
            }
            */
            let [isXcAsset, assetChain, rawAssetChain] = paraTool.getErcTokenAssetChain(erc20TokenInfo.tokenAddress, chainID) // REVIEW
            this.initERCAsset(assetChain, erc20TokenInfo, tx, ercType);
            return `${paraTool.assetTypeERC20}`
        }
        // trying erc721 next
        // ethTool rpccall (6)
        let erc721ContractInfo = await ethTool.getERC721ContractInfo(web3Api, contractAddress, bn)
        if (erc721ContractInfo) {
            let assetChain = this.getErc721TokenAssetChain(erc721ContractInfo.tokenAddress, chainID)
            this.initERCAsset(assetChain, erc721ContractInfo, tx, paraTool.assetTypeERC721);
            return `${paraTool.assetTypeERC721}`
        }

        //trying erc1155 (stub)
        // ethTool rpccall (7)
        let erc1155ContractInfo = await ethTool.getERC1155ContractInfo(web3Api, contractAddress, bn)
        if (erc1155ContractInfo) {
            let assetChain = this.getErc1155TokenAssetChain(erc1155ContractInfo.tokenAddress, chainID)
            this.initERCAsset(assetChain, erc1155ContractInfo, tx, paraTool.assetTypeERC1155);
            return `${paraTool.assetTypeERC1155}`
        }

        {
            let contractInfo = {
                tokenAddress: contractAddress,
            };
            let [isXcAsset, assetChain, rawAssetChain] = paraTool.getErcTokenAssetChain(contractAddress, chainID); // REVIEW
            this.initERCAsset(assetChain, contractInfo, tx, paraTool.assetTypeContract);
            return `${paraTool.assetTypeContract}`
        }
        return (false);
    }

    async process_evmtx_native_transfer(tx, chainID, ts, blockNumber, finalized = false) {
        let nativeAsset = this.getNativeAsset()
        let nativeAssetChain = paraTool.makeAssetChain(nativeAsset, chainID);
        // mark assetholder as worthy of update
        // Note: could get internal transfer with evmtraces https://docs.moonbeam.network/builders/build/eth-api/debug-trace/ https://docs.moonbeam.network/builders/build/eth-api/debug-trace/
        if (finalized) {
            this.updateAssetHolder(nativeAssetChain, tx.from, tx.blockNumber)
            this.updateAssetHolder(nativeAssetChain, tx.to, tx.blockNumber)
        }
        return (false);
    }

    updateAssetHolder(asset, holder, bn, newState = false) {
        let assetholder = `${holder}-${asset}`
        let cachedState = this.assetholder[assetholder]

        if (cachedState == undefined) {
            this.assetholder[assetholder] = [bn, newState];
        } else {
            var [prevBN, prevState] = cachedState
            if (prevBN < bn) { // we record newState = false cases even if they are newer
                this.assetholder[assetholder] = [bn, newState];
            }
        }
    }


    async process_erc20_token_transfer(tx, t, chainID, eventID = "0", finalized = false) {
        let web3Api = this.web3Api
        let bn = tx.blockNumber
        //   1. if this is an unknown token, fetch tokenInfo with getERC20TokenInfo
        //   2. mark that the assetholder balancer have to be fetched
        let [isXcAsset, assetChain, rawAssetChain] = paraTool.getErcTokenAssetChain(t.tokenAddress, chainID) // REVIEW
        let tokenInfo = this.tallyAsset[assetChain]
        // [mint] token send from '0x0000000000000000000000000000000000000000'
        // [burn] token sent to '0x0000000000000000000000000000000000000000' or '0x000000000000000000000000000000000000dEaD'
        // we can't distinguish incremtental token mint within a block - so we only should fetch token at most once per block
        let isMint = t.from == '0x0000000000000000000000000000000000000000'
        let isBurn = (t.to == '0x0000000000000000000000000000000000000000' || t.to == '0x000000000000000000000000000000000000dEaD')
        let isMiss = true
        let isCached = false
        if (tokenInfo != undefined) {
            isCached = true
            isMiss = false
            /*if ((tokenInfo.blockNumber != tx.blockNumber) && (isMint || isBurn)) {
                // fetch once per block here
                isCached = false
            } */
        } else {
            // search ercTokenList first
            let cAddress = t.tokenAddress.toLowerCase();
            if (this.ercTokenList[cAddress]) {
                isCached = true;
                tokenInfo = this.ercTokenList[cAddress] // note: totalSupply is not accurate here

                // console.log(`[${bn}-${tx.transactionIndex}] ERC20 Cache FOUND  ${t.tokenAddress} ${tokenInfo.symbol}\t${tokenInfo.totalSupply}`)
            }
        }
        if (isCached) {
            // console.log(`[${bn}-${tx.transactionIndex}] ERC20 Cached  ${t.tokenAddress} ${tokenInfo.symbol}\t${tokenInfo.totalSupply}`)
            this.initERCAssetOnCache(rawAssetChain, tokenInfo, isXcAsset) //MK: should be rawAssetChain here
        } else {
            // TODO: search mysql asset first, then do RPC
            // ethTool rpccall (9)
            tokenInfo = await ethTool.getERC20TokenInfo(web3Api, t.tokenAddress, bn)
            let ercType = paraTool.assetTypeERC20

            let lpTokenInfo = false;
            if (!this.isCachedNonCompliantLP(t.tokenAddress)) {
                // ethTool rpccall (10)
                lpTokenInfo = await ethTool.getERC20LiquidityPairTokenInfo(web3Api, t.tokenAddress, bn)
                if (!lpTokenInfo) {
                    this.cacheNonCompliantLP(t.tokenAddress)
                }
            }
            /*
            if (lpTokenInfo) {
                ercType = paraTool.assetTypeERC20LiquidityPair
            }
            */
            if (tokenInfo) {
                tokenInfo.lpInfo = lpTokenInfo
                console.log(`**[${bn}-${tx.transactionIndex}] ${ercType} Fetched ${t.tokenAddress} ${tokenInfo.symbol}\t${tokenInfo.totalSupply} (Miss: ${isMiss}, Mint: ${isMint}, Burn: ${isBurn})`)
                this.initERCAssetOnMiss(rawAssetChain, tokenInfo, ercType, isXcAsset)
                //this.tallyAsset[assetChain] = tokenInfo
            }
        }
        // This mark for lookup on isTip = true for processAssetTypeERC20/fetchAssetHolderBalances
        if (finalized) {
            this.updateAssetHolder(assetChain, t.from, bn)
            this.updateAssetHolder(assetChain, t.to, bn)
        }

        if (t.from && t.to && t.tokenAddress) {
            let v = {
                type: "ERC20",
                chainID: chainID,
                blockNumber: tx.blockNumber,
                from: t.from.toLowerCase(),
                to: t.to.toLowerCase(),
                tokenAddress: t.tokenAddress,
                ts: tx.timestamp,
                value: t.value,
            };
            let extrinsicID = `${tx.blockNumber}-${tx.transactionIndex}`
            if (finalized) {
                await this.updateAddressExtrinsicStorage(t.from, extrinsicID, tx.transactionHash, "feedevmtransfer", v, tx.timestamp, true);
                await this.updateAddressExtrinsicStorage(t.to, extrinsicID, tx.transactionHash, "feedevmtransfer", v, tx.timestamp, true);
                await this.updateAddressExtrinsicStorage(t.tokenAddress, extrinsicID, tx.transactionHash, "feedevmtransfer", v, tx.timestamp, true);
            }
        }
    }

    async fetchMissingERC20(contractAddress, bn) {
        let web3Api = this.web3Api
        // ethTool rpccall (11)
        let tokenInfo = await ethTool.getERC20TokenInfo(web3Api, contractAddress, bn)
        let ercType = paraTool.assetTypeERC20
        // ethTool rpccall (12)
        /*
        if (lpTokenInfo) {
            ercType = paraTool.assetTypeERC20LiquidityPair
        }
        */
        if (tokenInfo) {
            //let lpTokenInfo = await ethTool.getERC20LiquidityPairTokenInfo(web3Api, contractAddress, bn)
            let lpTokenInfo = false;
            if (!this.isCachedNonCompliantLP(contractAddress)) {
                // ethTool rpccall (10)
                lpTokenInfo = await ethTool.getERC20LiquidityPairTokenInfo(web3Api, contractAddress, bn)
                if (!lpTokenInfo) {
                    this.cacheNonCompliantLP(contractAddress)
                }
            }

            tokenInfo.lpInfo = lpTokenInfo
            let [isXcAsset, assetChain, rawAssetChain] = paraTool.getErcTokenAssetChain(contractAddress, this.chainID) // REVIEW
            console.log(`**[${bn}] ${ercType} Fetched ${contractAddress} ${tokenInfo.symbol}\t${tokenInfo.totalSupply}`)
            this.initERCAssetOnMiss(rawAssetChain, tokenInfo, paraTool.assetTypeERC20, isXcAsset)
            //this.tallyAsset[assetChain] = tokenInfo
        }
    }

    async process_erc721_token_transfer(tx, t, chainID, eventID = "0", finalized = false) {
        let web3Api = this.web3Api
        let bn = tx.blockNumber
        let tokenID = t.tokenId
        let contractAddress = t.tokenAddress
        let sender = t.from
        let recipient = t.to
        //   1. if this is an unknown token, fetch tokenInfo with getERC20TokenInfo
        //   2. mark that the assetholder balancer have to be fetched
        let assetChain = this.getErc721TokenIDAssetChain(contractAddress, tokenID, chainID)
        let erc721TokenIDMeta = this.tallyAsset[assetChain]
        // [mint] token send from '0x0000000000000000000000000000000000000000'
        // [burn] token sent to '0x0000000000000000000000000000000000000000' or '0x000000000000000000000000000000000000dEaD'
        // we can't distinguish incremtental token mint within a block - so we only should fetch token at most once per block
        let isMint = sender == '0x0000000000000000000000000000000000000000'
        let isBurn = (recipient == '0x0000000000000000000000000000000000000000' || recipient == '0x000000000000000000000000000000000000dEaD')
        let isMiss = true
        let isCached = false
        if (erc721TokenIDMeta != undefined) {
            isCached = true
            isMiss = false
            if ((erc721TokenIDMeta.blockNumber != tx.blockNumber) && (isMint || isBurn)) {
                // only fetch for "missed" case
                // isCached = false
            }
        }

        if (isCached) {
            let prevHolder = erc721TokenIDMeta.owner
            erc721TokenIDMeta.owner = recipient
            erc721TokenIDMeta.blockNumber = bn
            console.log(`[${bn}-${tx.transactionIndex}] ERC721 tokenID Cached  ${contractAddress} [${erc721TokenIDMeta.tokenID}], prevHolder:${prevHolder} -> currHolder:${erc721TokenIDMeta.owner}`)

        } else {
            // TODO: search btAsset first, then do RPC
            // ignore burned tokenID on miss
            if (!isBurn && false) {
                // ethTool rpccall (13)
                erc721TokenIDMeta = await ethTool.getERC721NFTMeta(web3Api, contractAddress, tokenID, false, bn)
                console.log(`**[${bn}-${tx.transactionIndex}] ERC721 tokenID Fetched ${contractAddress} [${erc721TokenIDMeta.tokenID}], currHolder:${erc721TokenIDMeta.owner}, (Miss: ${isMiss}, Mint: ${isMint}, Burn: ${isBurn})`)
            }
        }
        if (erc721TokenIDMeta) {
            erc721TokenIDMeta.assetType = paraTool.assetTypeERC721Token;
            this.tallyAsset[assetChain] = erc721TokenIDMeta // TODO
        }
    }

    async process_erc1155_token_transfer(tx, t, chainID, eventID = "0", finalized = false) {
        //stub
    }

    async process_evmtx_token_transfer(tx, chainID, finalized = false) {
        let web3Api = this.web3Api
        let bn = tx.blockNumber
        let transfers = tx.transfers

        for (let e = 0; e < transfers.length; e++) {
            let eventID = e.toString();
            let t = transfers[e];
            //console.log(`Evm transfer [${bn}-${tx.transactionIndex}]`, JSON.stringify(t))
            if (t.type == "ERC20") {
                await this.process_erc20_token_transfer(tx, t, chainID, eventID, finalized)
            }
            if (t.type == "ERC721") {
                await this.process_erc721_token_transfer(tx, t, chainID, eventID, finalized)
            }
            if (t.type == "ERC1155") {
                await this.process_erc1155_token_transfer(tx, t, chainID, eventID, finalized)
            }

        }
        return (false);
    }

    //called after erc20 transfers is processed
    async process_evmtx_swap(tx, chainID, finalized = false) {
        let web3Api = this.web3Api
        let bn = tx.blockNumber
        let swaps = tx.swaps

        for (const s of swaps) {
            //concole.log(`[${bn}-${tx.transactionIndex}]`, JSON.stringify(t))
            if (s.type == "swapV2") {
                await this.process_v2_swap(s, chainID, bn, true, finalized)
            }
        }
        return (false);
    }

    async process_v2_swap(swapEvent, chainID, bn, retryOnMiss = true, finalized = false) {
        //console.log(`process_v2_swap`, swapEvent)
        if (swapEvent.type == "swapV2") {
            let lpTokenAddress = swapEvent.lpTokenAddress
            let lpToken = this.getLPToken(lpTokenAddress)
            if (lpToken && lpToken.lpInfo) {
                let lpTokenInfo = lpToken.lpInfo
                //console.log(lpToken)
                //console.log(lpTokenInfo)
                let token0In = paraTool.dechexToInt(swapEvent.amount0In) / 10 ** lpTokenInfo.token0Decimals
                let token1In = paraTool.dechexToInt(swapEvent.amount1In) / 10 ** lpTokenInfo.token1Decimals
                let token0Out = paraTool.dechexToInt(swapEvent.amount0Out) / 10 ** lpTokenInfo.token0Decimals
                let token1Out = paraTool.dechexToInt(swapEvent.amount1Out) / 10 ** lpTokenInfo.token1Decimals
                //trade volume: by definition, it's the inflow (token1In, token0Out)
                //trade fee: total outflow - total inflow (TODO)
                let token0Symbol = lpTokenInfo.token0Symbol
                let token1Symbol = lpTokenInfo.token1Symbol
                let inFlow = (token0In != 0) ? `${token0In} ${token0Symbol}` : `${token1In} ${token1Symbol}`
                let outFlow = (token0Out != 0) ? `${token0Out} ${token0Symbol}` : `${token1Out} ${token1Symbol}`
                //console.log(`[${lpTokenAddress}][${token0Symbol}/${token1Symbol}] - inFlow +${inFlow}, outFlow -${outFlow}`)
                if (token0Symbol == undefined || token1Symbol == undefined || isNaN(token0In) || isNaN(token1In) || isNaN(token0Out) || isNaN(token1Out)) {
                    console.log(`[${lpTokenAddress}] missing lpToken !`, lpToken)
                    console.log(`[${lpTokenAddress}] missing lpInfo  !`, lpTokenInfo)
                    console.log(`[${lpTokenAddress}] NAN check: 0In=${token0In}, 1In=${token1In}, 0Out=${token0Out}, 1Out=${token1Out}, 0Decimals=${lpTokenInfo.token0Decimals}, 1Decimals=${lpTokenInfo.token1Decimals}`)
                }
                let r = {
                    token0In: token0In,
                    token1Out: token1Out,
                    token1In: token1In,
                    token0Out: token0Out,
                    lpAddress: lpTokenAddress
                }
                //console.log(`swapV2`, r)
                let assetChainLP = this.getErc20LPAssetChain(lpTokenAddress, chainID)
                let [isXcAsset, assetChainLPAsNormal, rawAssetChainLPAsNormal] = paraTool.getErcTokenAssetChain(lpTokenAddress, chainID) // REVIEW
                lpToken.assetType = paraTool.assetTypeERC20 // modify assetType here so it get updated at the tip
                this.initERCAssetOnCache(rawAssetChainLPAsNormal, lpToken, isXcAsset) //MK should be original
                if (finalized) {
                    this.updateAssetERC20SwapTradingVolume(assetChainLP, r.token0In, r.token1In, r.token0Out, r.token1Out) //MK
                }
            } else if (retryOnMiss) {
                console.log(`process_v2_swap: fetching unknown lpToken ${lpTokenAddress}`, lpToken)
                await this.fetchMissingERC20(lpTokenAddress, bn)
                await this.process_v2_swap(swapEvent, chainID, bn, false, finalized)
            } else {
                console.log(`process_v2_swap: unknown lpToken ${lpTokenAddress} exit`, lpToken)
            }
        } else {
            console.log(`new swapEvent detected`, swapEvent)
        }
    }

    async process_evmtx_syncEvent(syncEvent, chainID, bn, retryOnMiss = true, finalized = false) {
        if (syncEvent.type == "syncV2") {
            let lpTokenAddress = syncEvent.lpTokenAddress
            let lpToken = this.getLPToken(lpTokenAddress)
            if (lpToken && lpToken.lpInfo) {
                let lpTokenInfo = lpToken.lpInfo
                //console.log(lpToken)
                //console.log(lpTokenInfo)
                let lp0 = paraTool.dechexToInt(syncEvent.reserve0) / 10 ** lpTokenInfo.token0Decimals
                let lp1 = paraTool.dechexToInt(syncEvent.reserve1) / 10 ** lpTokenInfo.token1Decimals
                let rat = lp0 / lp1
                let token0Symbol = lpTokenInfo.token0Symbol
                let token1Symbol = lpTokenInfo.token1Symbol
                //console.log(`[${lpTokenAddress}][${token0Symbol}/${token1Symbol}] - ${lp0}/${lp1} ~ ${rat}`)
                let r = {
                    lp0: lp0,
                    lp1: lp1,
                    rat: rat,
                    lpAddress: lpTokenAddress
                }
                //console.log(`syncV2`, r)
                let assetChainLP = this.getErc20LPAssetChain(lpTokenAddress, chainID)
                let [isXcAsset, assetChainLPAsNormal, rawAssetChainLPAsNormal] = paraTool.getErcTokenAssetChain(lpTokenAddress, chainID) // REVIEW
                lpToken.assetType = paraTool.assetTypeERC20 // modify assetType here so it get updated at the tip
                this.initERCAssetOnCache(rawAssetChainLPAsNormal, lpToken, isXcAsset) // should be original?
                if (finalized) {
                    this.updateAssetERC20LiquidityPair(assetChainLP, r.lp0, r.lp1, r.rat) //MK
                }
            } else if (retryOnMiss) {
                console.log(`process_evmtx_syncEvent: fetching unknown lpToken ${lpTokenAddress}`)
                await this.fetchMissingERC20(lpTokenAddress, bn)
                await this.process_evmtx_syncEvent(syncEvent, chainID, bn, false, finalized)
            } else {
                console.log(`process_evmtx_syncEvent: unknown lpToken ${lpTokenAddress} exit`)
            }
        } else {
            console.log(`new syncEvent detected`, syncEvent)
        }
    }

    getLPToken(lpTokenAddress) {
        lpTokenAddress = lpTokenAddress.toLowerCase()
        let lpToken = this.ercTokenList[lpTokenAddress]
        if (lpToken != undefined) {
            return lpToken
        }
        return false
    }


    // For all evm txs in evmFullBlock, we wish to be able to at least:
    //  - /account/0x7aB.. --> get all the ERC20/721/... assets across chains at the tip
    //    Design: easy to value native assets with coin prices, but very challenging to value ALL assets,
    //      so how do we provide historical balances for ERC20 assets as assets suddenly acquire USD values?
    //  - /asset/0x1d3.. --> get the totalSupply, top 1000 asset holders
    async process_evm_transaction(tx, chainID, finalized = false, isTip = false) {
        if (tx == undefined) return;
        let contractType = false
        if (ethTool.isTxContractCreate(tx)) {
            // Contract Creates
            contractType = await this.process_evm_contract_create(tx, chainID, finalized, isTip);
        }

        if (ethTool.isTxNativeTransfer(tx)) {
            // Native Transfers
            await this.process_evmtx_native_transfer(tx, chainID, finalized);
        }

        if (ethTool.isTxTokenTransfer(tx)) {
            // Token Transfers (ERC20/ERC721/1155)
            await this.process_evmtx_token_transfer(tx, chainID, finalized);
        }

        if (ethTool.isTxSwap(tx)) {
            // swap detected - aggregate trading volumes
            await this.process_evmtx_swap(tx, chainID, finalized);
        }
        let syncEvents = ethTool.isTxLPSync(tx) // swap, add/removeLiquidity
        if (syncEvents) {
            //LP token lp0, lp1 updates
            let bn = tx.blockNumber
            for (const syncEvent of syncEvents) {
                await this.process_evmtx_syncEvent(syncEvent, chainID, tx, true, finalized)
            }
        }
        //process feedevmtx
        let evmTxHash = tx.transactionHash
        let extRes = this.extrinsicEvmMap[evmTxHash]
        let syntheticExtrinsicID = `${tx.blockNumber}-${tx.transactionIndex}`
        if (extRes !== undefined) { // && finalized // REVIEW
            tx['substrate'] = extRes
            syntheticExtrinsicID = extRes.extrinsicID
        }
        if (tx.from != undefined) {
            let fromAddress = tx.from.toLowerCase()
            // writes into feed or feedunfinalized based on finalized
            await this.updateAddressExtrinsicStorage(fromAddress, syntheticExtrinsicID, evmTxHash, "feed", tx, tx.timestamp, finalized);
        }
        // (2) hashesRowsToInsert: evmTxHash -> evmTX

        await this.insertHash(evmTxHash, rects, JSON.stringify(tx), finalized, ctx);


        // write evmtx to "feedto" to index txs interacting with (contract) address
        if (finalized) {
            let col = `${chainID}-${syntheticExtrinsicID}`
            if (tx.to) {
                // writes into feedto ONLY
                let feedto = {
                    chainID: chainID,
                    blockNumber: tx.blockNumber,
                    transactionHash: evmTxHash,
                    decodedInput: tx.decodedInput,
                    from: tx.from.toLowerCase(),
                    to: tx.to.toLowerCase(),
                    ts: tx.timestamp,
                    value: tx.value,
                    fee: tx.fee
                }
                //console.log(`[${tx.blockNumber}][${evmTxHash}] sent to ${tx.to}`, feedto)
                await this.updateAddressExtrinsicStorage(tx.to, syntheticExtrinsicID, evmTxHash, "feedto", feedto, tx.timestamp, true);
            }
            if (tx.creates) {
                // this is contracts creates
                let feedCreates = {
                    chainID: chainID,
                    blockNumber: tx.blockNumber,
                    transactionHash: evmTxHash,
                    decodedInput: tx.decodedInput,
                    from: tx.from.toLowerCase(),
                    nonce: tx.nonce,
                    to: tx.creates.toLowerCase(),
                    ts: tx.timestamp,
                    value: tx.value,
                    fee: tx.fee
                }
                console.log(`[${tx.blockNumber}][${evmTxHash}] created at ${ethTool.toChecksumAddress(tx.creates)}`, feedCreates)
                await this.updateAddressExtrinsicStorage(tx.creates, syntheticExtrinsicID, evmTxHash, "feedto", feedCreates, tx.timestamp, true);
                if (contractType) {
                    let contractAddress = tx.creates.toLowerCase()
                    let contractMeta = {
                        asset: contractAddress,
                        chainID: chainID,
                        assetType: contractType,
                        creator: tx.from.toLowerCase(),
                        createdAtTx: evmTxHash,
                    };
                    console.log(`[${evmTxHash}] [${contractAddress}]`, contractMeta)
                    this.evmcontractMap[contractAddress] = contractMeta;
                }
            }
        }
    }


    async processEVMFullBlock(evmFullBlock, evmTrace, chainID, blockNumber, finalized, isTip = false) {
        if (!evmFullBlock) return (false)
        // could this be done with Promise.all?
        let evmTxnCnt = 0
        for (const tx of evmFullBlock.transactions) {
            evmTxnCnt++
            await this.process_evm_transaction(tx, chainID, finalized, isTip);
        }
    }

    // processEvents organizes events by index, and relays interesting events to
    processEvents(api, eventsRaw, numExtrinsics, blockNumber) {
        var events = [];
        for (let i = 0; i < numExtrinsics; i++) {
            events[i] = [];
        }

        for (let j = 0; j < eventsRaw.length; j++) {
            let e = eventsRaw[j]
            let index = -1;
            if (e.phase.applyExtrinsic != undefined) {
                index = e.phase.applyExtrinsic;
            }
            if (e.phase.initialization !== undefined || e.phase.finalization !== undefined) {
                // index 0 holds { moonbeam/moonriver reward events in e.phase.initialization.
                index = 0;
            }
            if (index >= 0) {
                let eventID = `${this.chainID}-${blockNumber}-${index}-${j}`
                let event = this.parseEvent(e.event, eventID, api); // this is the apiAt
                if (event) {
                    events[index].push(event)
                }
            }
        }
        return events;
    }


    // detect new session using block event
    checkNewSession(eventsIndexed = []) {
        let isNewSession = false;
        let sessionIndex = false;
        for (const extrinsicIndexEvents of eventsIndexed) {
            for (const ev of extrinsicIndexEvents) {
                let sectionMethod = `${ev.section}:${ev.method}`
                if (sectionMethod == 'session:NewSession') {
                    isNewSession = true
                    sessionIndex = ev.data[0]
                }
            }
        }
        return [isNewSession, sessionIndex]
    }

    async getBlockAuthor(api, block, isNewSession = false, sessionIndex = false) {
        if (this.chainID == paraTool.chainIDMoonbeam || this.chainID == paraTool.chainIDMoonriver || this.chainID == paraTool.chainIDMoonbaseAlpha || this.chainID == paraTool.chainIDMoonbaseBeta ||
            this.chainID == paraTool.chainIDRobonomics ||
            this.chainID == paraTool.chainIDQuartz
        ) {
            return //moonbeam has different struct. skip for now
        }
        let currSessionValidators = this.currentSessionValidators
        let currSessionIndex = this.currentSessionIndex

        var digest = api.registry.createType('Digest', block.header.digest);
        //let digestHex = digest.toHex()

        let blockNumber = block.header.number;
        let blockHash = block.hash;
        let blockTS = block.blockTS;

        if (!isNewSession && currSessionIndex > 0 && currSessionValidators.length > 0) {
            // no need to fetch sessionValidators
        } else {
            if (this.authorErrorSpecVersion == this.specVersion) return
            try {
                if (sessionIndex) {
                    currSessionIndex = sessionIndex
                    this.currentSessionIndex = currSessionIndex
                    if (this.debugLevel >= paraTool.debugInfo) console.log(`[${blockNumber}] update currentSession=${currSessionIndex}`)
                } else if (api.query.session != undefined && api.query.session.currentIndex != undefined) {
                    let currIndex = await api.query.session.currentIndex.at(blockHash)
                    currSessionIndex = currIndex.toNumber()
                    this.currentSessionIndex = currSessionIndex
                    if (this.debugLevel >= paraTool.debugInfo) console.log(`*[${blockNumber}] update currentSession=${currSessionIndex}`)
                } else {
                    return;
                }
                currSessionValidators = await api.query.session.validators.at(blockHash)
                currSessionValidators = currSessionValidators.toJSON()
                this.currentSessionValidators = currSessionValidators
                if (this.debugLevel >= paraTool.debugInfo) console.log(`*[${blockNumber}] update currentSessionValidators (${currSessionIndex}, len=${currSessionValidators.length})`)
            } catch (e) {
                if (this.debugLevel >= paraTool.debugErrorOnly) console.log(`*[${blockNumber}] [specV=${this.specVersion}] getSessionIndexAndValidators error`, e.toString())
                if (e.toString() == 'Error: query.session.currentIndex is not available in this version of the metadata') {
                    this.authorErrorSpecVersion = this.specVersion
                    if (this.debugLevel >= paraTool.debugErrorOnly) console.log(`*[${blockNumber}] [specV=${this.specVersion}] set authorErrorSpecVersion=${this.specVersion}`)
                }
                return
            }
        }
        let [author, authorPubkey] = paraTool.getAuthor(digest, currSessionValidators)
        if (this.debugLevel >= paraTool.debugTracing) console.log(`[${blockNumber}] ${blockHash}, author:${author}, authorPubkey:${authorPubkey}`)
        if (author != undefined) {
            block.author = author
        }
    }

    combine_tx_with_receipt_status(rawTx, rawReceipt, rawTransactionStatus, idx, blockHash, blockNumber, blockTS, prevCumulativeGasUsed) {
        // TODO: reformat to match
        let tx = null;
        let gasUsed = null;
        let typ = "legacy";
        if (rawTx.eip1559) {
            tx = JSON.parse(JSON.stringify(rawTx.eip1559))
            tx.type = 2;
            typ = "eip1559";
            gasUsed = rawReceipt.eip1559.gasUsed;
        } else if (rawTx.legacy) {
            tx = JSON.parse(JSON.stringify(rawTx.legacy))
            tx.type = 1;
            gasUsed = rawReceipt.legacy.gasUsed;
        }
        if (tx) {
            tx.ts = blockTS;
            tx.timestamp = blockTS;
            tx.blockNumber = blockNumber;
            tx.transactionIndex = rawTransactionStatus.transactionIndex
            tx.hash = rawTransactionStatus.transactionHash
            tx.from = rawTransactionStatus.from
            tx.to = rawTransactionStatus.to
            tx.logs = rawTransactionStatus.logs
            //tx.gasUsed = rawReceipt[typ].usedGas
            tx.statusCode = rawReceipt[typ].statusCode
        }
        let dtx = {
            rawTx,
            rawTransactionStatus,
            rawReceipt,
            tx
        };
        let receipt = (typ == "eip1559") ? JSON.parse(JSON.stringify(rawReceipt.eip1559)) : JSON.parse(JSON.stringify(rawReceipt.legacy));
        receipt.blockHash = blockHash;
        receipt.blockNumber = blockNumber;
        receipt.contractAddress = rawTransactionStatus.contractAddress;
        receipt.cumulativeGasUsed = prevCumulativeGasUsed + receipt.usedGas
        //receipt.effectiveGasPrice = "" // check
        receipt.gasUsed = receipt.usedGas; // check
        receipt.status = receipt.statusCode; // check
        receipt.from = rawTransactionStatus.from;
        receipt.to = rawTransactionStatus.to;
        receipt.transactionHash = rawTransactionStatus.transactionHash;
        receipt.transactionIndex = rawTransactionStatus.transactionIndex
        //console.log("combine", idx, dtx, "receipt", rawReceipt);
        return [tx, receipt];
    }

    convertUnfinalizedRawTraceData(current) {
        if (current.Block && current.Receipts && current.TransactionStatuses && current.evmBlockHash) {
            try {
                let receipts = [];
                let b = JSON.parse(JSON.stringify(current.Block.header));
                b.hash = current.evmBlockHash;
                b.ts = current.blockTS;
                b.timestamp = current.blockTS;
                b.transactions = [];
                let prevCumulativeGasUsed = 0;
                for (let idx = 0; idx < current.Block.transactions.length; idx++) {
                    let rawTransaction = current.Block.transactions[idx];
                    let rawReceipt = current.Receipts[idx];
                    let rawTransactionStatus = current.TransactionStatuses[idx];
                    let [tx, receipt] = this.combine_tx_with_receipt_status(rawTransaction, rawReceipt, rawTransactionStatus, idx, current.evmBlockHash, current.blockNumber, current.blockTS, prevCumulativeGasUsed);
                    if (receipt) {
                        prevCumulativeGasUsed = receipt.cumulativeGasUsed
                    }
                    b.transactions.push(tx);
                    receipts.push(receipt);
                }
                return [b, receipts];
            } catch (err) {
                console.log(err);
            }
        }
        return [null, null];
    }

    patch_xcm(xcmMsg) {
        try {
            //let xcmObj = this.api.registry.createType("XcmVersionedXcm", xcmMsg.msgHex);
            //let msg = xcmObj.toJSON();
            let msg = xcmMsg.msg
            //console.log("patch_xcm COMPUTE", xcmMsg.msgType, xcmMsg.msgHex);
            // generate beneficiaries, version, path
            let r = {
                beneficiaries: "",
                version: "",
                path: ""
            }
            if (this.chainParser) {
                r.beneficiaries = this.chainParser.getBeneficiary(msg);
                let p = this.chainParser.getInstructionPath(msg)
                if (p) {
                    r.version = p.version;
                    r.path = p.path
                }
            }
            //xcmMsg.msg = msg
            xcmMsg.beneficiaries = r.beneficiaries
            xcmMsg.version = r.version
            xcmMsg.path = r.path
        } catch (err) {
            this.logger.error({
                "op": "patch_xcm",
                "obj": JSON.stringify(xcmMsg),
                "err": err
            })
            console.log("patch_xcm", err);
        }
        return;
    }

    async process_rcxcm(xcmList) {
        let out = [];
        for (const x of xcmList) {
            try {
                let isFinalized = (x.finalized) ? 1 : 0
                out.push(`('${x.msgHash}', '${x.chainID}', '${x.chainIDDest}', '${x.sentAt}', '${x.relayChain}', '${x.relayedBlockHash}', '${x.relayedAt}', '${x.includedAt}', '${x.msgType}', '${x.blockTS}', ${mysql.escape(JSON.stringify(x.msg))}, '${x.msgHex}', ${mysql.escape(x.path)}, '${x.version}', ${mysql.escape(x.beneficiaries)}, Now(), ${isFinalized})`)
            } catch (err) {
                console.log("process_rcxcm", err);
            }
        }
        let vals = ["relayChain", "relayedBlockHash", "relayedAt", "includedAt", "msgType", "blockTS", "msgStr", "msgHex", "path", "version", "beneficiaries", "indexDT", "finalized"]
        let sqlDebug = false
        await this.upsertSQL({
            "table": "xcm",
            "keys": ["msgHash", "chainID", "chainIDDest", "sentAt"],
            "vals": vals,
            "data": out,
            "replace": vals
        }, sqlDebug);
    }

    ParaInclusionPendingAvailabilityFilter(traces) {
        let backedMap = {}
        for (const t of traces) {
            if (t.p == "ParaInclusion" && (t.s == "PendingAvailability")) {
                try {
                    if (t.v == '0x') continue
                    let pendingAvailability = t.pv ? JSON.parse(t.pv) : null; // pv:
                    if (pendingAvailability) {
                        let k = JSON.parse(t.pkExtra)
                        let paraID = paraTool.toNumWithoutComma(k[0])
                        backedMap[paraID] = pendingAvailability
                    }
                } catch (err) {
                    this.logger.error({
                        "op": "ParaInclusionPendingAvailabilityFilter",
                        "traceID": t.traceID,
                        "err": err
                    })
                    console.log(`ParaInclusionPendingAvailabilityFilter error`, err)
                }
            }
        }
        return backedMap
    }

    async indexRelayChainTrace(traces, bn, chainID, blockTS, relayChain = 'polkadot', isTip = false, finalized = false) {
        let xcmList = [];
        let backedMap = this.ParaInclusionPendingAvailabilityFilter(traces)
        let mp = {}
        for (const t of traces) {
            if (t.p == "ParaInclusion" && (t.s == "PendingAvailabilityCommitments")) {
                try {
                    let commitments = t.pv ? JSON.parse(t.pv) : null; // pv: '{"upwardMessages":[],"horizontalMessages":[],"newValidationCode":null,"headData":"0x8b479dbeef314a22bc8589a38b2b25a6396d5d0fa0a3caa906faee3aaf8188f7b2e47b001e8988caae6861bdfe076f0390770be196c146a30b5e86b03b397a628d79c985e34268e121c9cc333487d904bc10a0f7d1b58e978d0ae3a41e6c27bd03e5203d08066175726120e64446080000000005617572610101ccb39d04d868d3585bb68c0fcbfa1146dc3009422d36933841d2c086d24e5475824fe6428de54c00a9284665b016ec92039db793374b19fe78404e433d5c4780","processedDownwardMessages":0,"hrmpWatermark":12497248}'
                    if (commitments && (commitments.upwardMessages.length > 0 || commitments.horizontalMessages.length > 0)) {
                        let k = JSON.parse(t.pkExtra)
                        let paraID = parseInt(paraTool.toNumWithoutComma(k[0]), 10)
                        let backed = backedMap[paraID]
                        let sourceSentAt = backed.relayParentNumber // this is the true "sentAt" at sourceChain, same as commitments.hrmpWatermark
                        let sourceSentBlockHash = backed.paraHead // this is supposedly the "sentBN"
                        let relayedAt = bn // "relayedAt" -- aka backed at this relay bn
                        let includedAt = bn + 1 // "includedAt" -- aka when it's being delivered to destChain
                        for (const data of commitments.upwardMessages) {
                            var xcmFragments = this.chainParser.decodeXcmVersionedXcms(this, data, `upwardMessages`)
                            if (xcmFragments) {
                                for (const xcm of xcmFragments) {
                                    var msgHash = xcm.msgHash
                                    var msg = xcm.msg
                                    var msgHex = xcm.hex
                                    let umpMsg = {
                                        msgType: "ump",
                                        chainID: paraTool.getChainIDFromParaIDAndRelayChain(paraID, relayChain),
                                        chainIDDest: this.chainID,
                                        paraID: paraID,
                                        paraIDDest: 0,
                                        sentAt: sourceSentAt,
                                        relayedAt: relayedAt,
                                        includedAt: includedAt,
                                        msgHex: msgHex,
                                        msgHash: msgHash,
                                        msg: xcm.msg,
                                        blockTS: blockTS,
                                        relayChain: relayChain,
                                        isTip: isTip,
                                        finalized: finalized,
                                        ctx: t.s,
                                    }
                                    this.patch_xcm(umpMsg)
                                    xcmList.push(umpMsg)
                                }
                            }
                        }
                        for (const h of commitments.horizontalMessages) {
                            /*
                            {
                                "recipient": 2004,
                                "data":"0x000210010400010200411f06080001000b3cbef64bc1240a1300010200411f06080001000b3cbef64bc124010700f2052a010d0100040001030024a304386099637e578c02ffeaf2cf3dcfbab751"
                            }
                            */
                            let paraIDDest = parseInt(paraTool.toNumWithoutComma(h.recipient), 10)
                            let data = '0x' + h.data.substring(4).toString();
                            var xcmFragments = this.chainParser.decodeXcmVersionedXcms(this, data, `horizontalMessages`)
                            if (xcmFragments) {
                                for (const xcm of xcmFragments) {
                                    var msgHash = xcm.msgHash
                                    var msg = xcm.msg
                                    var msgHex = xcm.hex
                                    let hrmpMsg = {
                                        msgType: "hrmp",
                                        chainID: paraTool.getChainIDFromParaIDAndRelayChain(paraID, relayChain),
                                        chainIDDest: paraTool.getChainIDFromParaIDAndRelayChain(paraIDDest, relayChain),
                                        paraID: paraID,
                                        paraIDDest: paraIDDest,
                                        sentAt: sourceSentAt,
                                        relayedAt: relayedAt,
                                        includedAt: includedAt,
                                        msgHex: msgHex,
                                        msgHash: msgHash,
                                        msg: xcm.msg,
                                        blockTS: blockTS,
                                        relayChain: relayChain,
                                        isTip: isTip,
                                        finalized: finalized,
                                        ctx: t.s,
                                    }
                                    this.patch_xcm(hrmpMsg)
                                    xcmList.push(hrmpMsg)
                                }
                            }
                        }
                    }
                } catch (err) {
                    this.logger.error({
                        "op": "indexRelayChainTrace - ParaInclusion:PendingAvailabilityCommitments",
                        "traceID": t.traceID,
                        "trace": JSON.stringify(t),
                        "err": err
                    })
                    console.log(err);
                }
            } else if ((t.p == "Dmp") && (t.s == "DownwardMessageQueues")) {
                try {
                    let queues = JSON.parse(t.pv);
                    if (queues.length > 0) {
                        let k = JSON.parse(t.pkExtra)
                        let paraIDDest = parseInt(paraTool.toNumWithoutComma(k[0]), 10)
                        for (const q of queues) {
                            //let sentAt = q.sentAt; // NO QUESTION on dmp (this is usually always the same block where xcmtransfer is initiated), sentAt = includedAt = relayedAt
                            let data = (q.msg != undefined) ? q.msg : q.pubMsg
                            let sentAt = (q.sentAt != undefined) ? paraTool.dechexToInt(q.sentAt) : paraTool.dechexToInt(q.pubSentAt)
                            var xcmFragments = this.chainParser.decodeXcmVersionedXcms(this, data, `DownwardMessages`)
                            if (xcmFragments) {
                                for (const xcm of xcmFragments) {
                                    var msgHash = xcm.msgHash
                                    var msg = xcm.msg
                                    var msgHex = xcm.hex
                                    let dmpMsg = {
                                        msgType: "dmp",
                                        chainID: this.chainID,
                                        chainIDDest: paraTool.getChainIDFromParaIDAndRelayChain(paraIDDest, relayChain),
                                        paraID: 0,
                                        paraIDDest: paraIDDest,
                                        sentAt: sentAt,
                                        relayedAt: sentAt,
                                        includedAt: sentAt,
                                        msgHex: msgHex,
                                        msgHash: msgHash,
                                        msg: xcm.msg,
                                        blockTS: blockTS,
                                        relayChain: relayChain,
                                        isTip: isTip,
                                        finalized: finalized,
                                        ctx: t.s,
                                    }
                                    this.patch_xcm(dmpMsg)
                                    xcmList.push(dmpMsg)
                                }
                            }
                        }
                    }
                } catch (err) {
                    this.logger.error({
                        "op": "indexRelayChainTrace - Dmp:DownwardMessageQueues",
                        "traceID": t.traceID,
                        "trace": JSON.stringify(t),
                        "err": err
                    })
                }
            }
        }
        if (xcmList.length > 0) {
            //console.log(`!!! indexRelayChainTrace [${relayChain}-${bn}] len=${xcmList.length} (finalized=${finalized}, isTip=${isTip})`, xcmList)
            await this.process_rcxcm(xcmList)
        }
        return xcmList
    }

    async processBlockEvents(chainID, block, eventsRaw, evmBlock = false, evmReceipts = false, evmTrace = false, autoTraces = false, finalized = false, write_log = false, isTip = false, tracesPresent = false) {
        //processExtrinsic + processBlockAndReceipt + processEVMFullBlock
        if (!block) return;
        if (!block.extrinsics) return;
        let blockNumber = block.header.number;
        let blockHash = block.hash;
        let blockTS = block.blockTS;
        let stateRoot = block.header.stateRoot
        let paraID = paraTool.getParaIDfromChainID(chainID)
        if (paraID == 0) {
            //this.trailingBlockHashs[blockHash] = blockNumber;
        }
        let recentExtrinsics = [];
        let recentTransfers = [];
        let recentXcmMsgs = []; //new xcm here
        if (finalized == true && autoTraces) {
            //console.log("STANDARD BLOCK", JSON.stringify(evmBlock, null, 4));
            //console.log("STANDARD RECEIPTS", JSON.stringify(evmReceipts, null, 4));
        }
        if (finalized == false && autoTraces) {
            // OPTIMIZATION: we only need to do this for evm chains...
            let current = {
                Block: null,
                Receipts: null,
                TransactionStatuses: null,
                blockHash,
                blockNumber,
                blockTS,
                evmBlockHash: null
            }; // note that blockHash is the Substrate block hash
            for (const t of autoTraces) {
                if ((t.p == "Ethereum" && t.s == "CurrentBlock") && t.pv) {
                    current.Block = JSON.parse(t.pv)
                }
                if ((t.p == "Ethereum" && t.s == "CurrentReceipts") && t.pv) {
                    current.Receipts = JSON.parse(t.pv)
                }
                if ((t.p == "Ethereum" && t.s == "CurrentTransactionStatuses") && t.pv) {
                    current.TransactionStatuses = JSON.parse(t.pv);
                }
                if ((t.p == "Ethereum" && t.s == "BlockHash")) {
                    let pkExtraArr = JSON.parse(t.pkExtra);
                    if (Array.isArray(pkExtraArr) && pkExtraArr.length > 0) {
                        let bnCand = paraTool.toNumWithoutComma(pkExtraArr[0]);
                        if (bnCand == blockNumber) {
                            current.evmBlockHash = t.pv;
                        }
                    }
                }
            }
            let [newEVMBlock, newReceipts] = this.convertUnfinalizedRawTraceData(current);
            if (newEVMBlock && newReceipts) {
                //console.log("NEW BLOCK", JSON.stringify(newEVMBlock, null, 4));
                //console.log("NEW RECEIPTS", JSON.stringify(newReceipts, null, 4));
                evmBlock = newEVMBlock;
                evmReceipts = newReceipts;
            }
        }
        // setParserContext
        this.chainParser.setParserContext(block.blockTS, blockNumber, blockHash, chainID);
        if (this.isRelayChain) this.chainParser.setRelayParentStateRoot(stateRoot)
        this.apiAt = this.api
        let api = this.apiAt; //processBlockEvents is sync func, so we must initialize apiAt before pass in?
        block.finalized = finalized;

        // (0.a) index events by extrinsicIndex
        let eventsIndexed = this.processEvents(api, eventsRaw, block.extrinsics.length, blockNumber);

        // (0.b) check NewSession signal
        let [isNewSession, sessionIndex] = this.checkNewSession(eventsIndexed);

        // (0.c) derive/cache session validators - called once every ~ 2400 blocks
        await this.getBlockAuthor(this.api, block, isNewSession, sessionIndex)

        // NEW REQUIREMENT: must process extrinsics before evmTx
        // (0.d) decode block extrinsic (from the raw encoded bytes from crawlBlock)
        let processExtrinsicStartTS = new Date().getTime()
        let extrinsics = [];
        for (let index = 0; index < block.extrinsics.length; index++) {
            let extrinsicRaw = block.extrinsics[index];
            let ext = await this.process_extrinsic(api, extrinsicRaw, eventsIndexed[index], block, index, finalized, isTip, tracesPresent);
            if (ext) {
                extrinsics.push(ext);
                if ((this.currentTS() - blockTS < 86400 * 2) && finalized) { // only save in recentExtrinsic if finalized (otherwise extrinsicID would not be usable as a deduping key)
                    let [logDT, hr] = paraTool.ts_to_logDT_hr(blockTS)
                    let fromAddress = null
                    let signed = (ext.signer != undefined && ext.signer != 'NONE') ? 1 : 0;
                    if (signed) {
                        fromAddress = paraTool.getPubKey(ext.signer)
                        if (fromAddress === false) fromAddress = null;
                        let recentExtrinsic = `('${ext.extrinsicID}', '${this.chainID}', '${logDT}', '${hr}', '${ext.blockNumber}', '${ext.extrinsicHash}', '${ext.section}', '${ext.method}', '${fromAddress}', '${ext.ts}', '${ext.result}', '${signed}')`
                        recentExtrinsics.push(recentExtrinsic);
                        if (ext.transfers && ext.transfers.length > 0) {
                            for (const t of ext.transfers) {
                                if (t.fromAddress != undefined && t.toAddress != undefined) {
                                    // potentially empty fields: amount, priceUSD, amountUSD, decimals, symbol, asset
                                    let priceUSD = t.priceUSD != undefined ? t.priceUSD : 0;
                                    let amountUSD = t.amountUSD != undefined ? t.amountUSD : 0;
                                    // MK TODO transfersrecent
                                    let tAmount = (t.amount != undefined) ? `'${t.amount}'` : 'Null';
                                    let tAsset = (t.asset != undefined) ? `'${t.asset}'` : 'Null';
                                    let tSymbol = (t.symbol != undefined) ? `'${t.symbol}'` : 'Null';
                                    let tDecimals = (t.decimals != undefined && t.decimals > 0) ? `'${t.decimals}'` : 'Null';
                                    let tRawAsset = (t.rawAsset != undefined) ? `'${t.rawAsset}'` : 'Null';
                                    let tRawAmount = (t.rawAmount != undefined && t.rawAmount >= 0) ? `'${t.rawAmount}'` : 'Null';
                                    let recentTransfer = `('${ext.extrinsicID}', '${this.chainID}', '${logDT}', '${hr}', '${ext.blockNumber}', '${ext.extrinsicHash}', '${t.section}', '${t.method}', '${t.fromAddress}', '${t.toAddress}', ${tAsset}, ${tSymbol}, ${tAmount}, '${priceUSD}', '${amountUSD}', '${ext.ts}', ${tRawAsset}, ${tRawAmount}, ${tDecimals})`
                                    //console.log(`recentTransfer`, recentTransfer)
                                    recentTransfers.push(recentTransfer);
                                    if (isTip && (tracesPresent == false)) {
                                        // because traces are missing, we'll fill in gaps dynamically at the tip for the sender and the receiver
                                        this.flagAddressBalanceRequest(t.fromAddress);
                                        this.flagAddressBalanceRequest(t.toAddress);
                                        // TODO: check if this misses { burns, xcmtransfers, unsigned extrinsics }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        block.extrinsics = extrinsics;

        let processExtrinsicTS = (new Date().getTime() - processExtrinsicStartTS) / 1000

        let forceTry = true //MK: need to review this
        if ((isTip || forceTry) && this.isRelayChain) {
            let relayChain = paraTool.getRelayChainByChainID(chainID);
            if (autoTraces) {
                //console.log("this.indexRelayChainTrace SUCC", blockNumber, chainID, relayChain, autoTraces.length);
                await this.indexRelayChainTrace(autoTraces, blockNumber, chainID, blockTS, relayChain, isTip, finalized);
            } else {
                console.log("this.indexRelayChainTrace FAIL", blockNumber, chainID, relayChain);
            }
        }

        let relayParentStateRoot = this.chainParser.relayParentStateRoot
        let relayBN = this.chainParser.parserWatermark
        block.relayBN = relayBN
        block.relayStateRoot = relayParentStateRoot

        // (1) record blockHash in BT hashes
        let blockfeed = {
            chainID: chainID,
            blockNumber: blockNumber,
            relayBN: relayBN,
            relayStateRoot: relayParentStateRoot,
            blockType: 'substrate'
        }

        // console.log("processBlockEvents added hashesRowsToInsert", blockHash, this.hashesRowsToInsert.length);
        // (3) hashesRowsToInsert: substrateBlockHash -> substrateBlockBN

        // (3) fuse block+receipt for evmchain, if both evmBlock and evmReceipts are available
        let web3Api = this.web3Api
        let contractABIs = this.contractABIs
        let contractABISignatures = this.contractABISignatures
        let evmFullBlock = false
        if (evmBlock && evmReceipts) {
            if (web3Api && contractABIs) {
                // processBlockEvents is async, so can put await here ...
                let processBlockAndReceiptStartTS = new Date().getTime();

                // get dTxn, dReceipt, and then do decorateTxn
                //processBlockAndReceiptTS = processTransasctionTS/processReceiptTS/decorateTxnTS

                let processTransasctionStartTS = new Date().getTime()
                let processReceiptStartTS = new Date().getTime()
                var statusesPromise = Promise.all([
                    ethTool.processTranssctions(evmBlock.transactions, contractABIs, contractABISignatures),
                    ethTool.processReceipts(evmReceipts, contractABIs, contractABISignatures)
                ])
                let [dTxns, dReceipts] = await statusesPromise
                //console.log(`[${blockNumber}] dReceipts`, JSON.stringify(dReceipts))


                //let dTxns = await ethTool.processTranssctions(evmBlock.transactions, contractABIs, contractABISignatures)
                let processTransasctionTS = (new Date().getTime() - processTransasctionStartTS) / 1000


                //let dReceipts = await ethTool.processReceipts(evmReceipts, contractABIs, contractABISignatures)
                let processReceiptTS = (new Date().getTime() - processReceiptStartTS) / 1000

                let decorateTxnStartTS = new Date().getTime()
                evmFullBlock = await ethTool.fuseBlockTransactionReceipt(evmBlock, dTxns, dReceipts, evmTrace, chainID)
                if (evmFullBlock.transactionsConnected.length > 0) {
                    let connectedTxns = []
                    for (const connectedTxn of evmFullBlock.transactionsConnected) {
                        try {
                            let [msgHash, childMsgHash] = this.getEvmMsgHashCandidate(blockNumber, connectedTxn, 'evm')
                            if (msgHash) connectedTxn.msgHash = msgHash
                            if (childMsgHash) connectedTxn.childMsgHash = childMsgHash
                        } catch (e) {
                            console.log(`[${blockNumber}] [${connectedTxn.transactionHash}] connectTransaction `, e, connectedTxn)
                        }
                        // remote execution here
                        if (connectedTxn.msgHash != undefined) {
                            this.sendManagerMessage(connectedTxn, "remoteExecution", finalized);
                        }
                        connectedTxns.push(connectedTxn)
                        evmFullBlock.transactions[connectedTxn.transactionIndex] = connectedTxn
                        evmFullBlock.transactionsConnected = connectedTxns
                    }
                    console.log(`[${blockNumber}] connectTransaction`, evmFullBlock.transactionsConnected)
                }
                let decorateTxnTS = (new Date().getTime() - decorateTxnStartTS) / 1000

                let processBlockAndReceiptTS = (new Date().getTime() - processBlockAndReceiptStartTS) / 1000

                let processEVMFullBlockStartTS = new Date().getTime()
                await this.processEVMFullBlock(evmFullBlock, evmTrace, chainID, blockNumber, block.finalized, isTip)
                let processEVMFullBlockTS = (new Date().getTime() - processEVMFullBlockStartTS) / 1000
            } else {
                //console.log(`chainID=${chainID} missing web3Api or contractABIs. web3Api(set? ${!web3Api == false}) contractABIs(set? ${!contractABIs == false})`)
            }
        }

        let xcmKeys = Object.keys(this.xcmmsgMap)
        if (xcmKeys.length > 0 && this.debugLevel >= paraTool.debugInfo) console.log(`[${blockNumber}] xcmKeys=${xcmKeys}`)
        for (const xcmKey of xcmKeys) {
            let mpKey = this.xcmTrailingKeyMap[xcmKey]
            if (mpKey != undefined && mpKey.isPreemptive) { //MK: TODO: bypass isFresh without breaking the current implementation.. can't gurantee the correctness of the msg content..
                let mp = this.xcmmsgMap[xcmKey]
                if (mp != undefined) {
                    this.xcmTrailingKeyMap[xcmKey].isPreemptive = false // mark the record as preemptive sent
                }
            }
            if (mpKey != undefined && mpKey.isFresh) {
                let mp = this.xcmmsgMap[xcmKey]
                let direction = (mp.isIncoming) ? 'incoming' : 'outgoing'
                if (xcmKeys.length > 0 && this.debugLevel >= paraTool.debugInfo) console.log(`xcmMessages ${direction}`, mp)
                if (mp != undefined) {
                    //console.log(`[Delay=${this.chainParser.parserBlockNumber-mp.blockNumber}] send ${direction} xcmmessage ${mp.msgHash}, isTip=${isTip}, finalized=${finalized}`)
                    this.sendManagerMessage(mp, "xcmmessage", finalized)
                }
                let extrinsicID = (mp.extrinsicID != undefined) ? `'${mp.extrinsicID}'` : 'NULL'
                let extrinsicHash = (mp.extrinsicHash != undefined) ? `'${mp.extrinsicHash}'` : 'NULL'
                let beneficiaries = (mp.beneficiaries != undefined) ? `'${mp.beneficiaries}'` : 'NULL'
                let connectedTxHash = (mp.connectedTxHash != undefined) ? `'${mp.connectedTxHash}'` : 'NULL'
                //console.log(`mp beneficiaries`, beneficiaries)
                //["msgHash", "blockNumber", "incoming"] + ["sentAt", "chainIDDest", "chainID", "msgType", "msgHex", "msgStr", "blockTS", "relayChain", "version", "path", "extrinsicID", "extrinsicHash", "indexDT", "beneficiaries"]
                let s = `('${mp.msgHash}', '${mp.blockNumber}', '${mp.isIncoming}', '${mp.sentAt}', '${mp.chainIDDest}', '${mp.chainID}', '${mp.msgType}', '${mp.msgHex}', ${mysql.escape(mp.msgStr)}, '${mp.blockTS}', '${mp.relayChain}', '${mp.version}', '${mp.path}', ${extrinsicID}, ${extrinsicHash}, Now(), ${beneficiaries}, ${connectedTxHash})`
                if (mp.isIncoming == 1) {
                    if (this.numXCMMessagesIn[mp.blockNumber] == undefined) {
                        this.numXCMMessagesIn[mp.blockNumber] = 1;
                    } else {
                        this.numXCMMessagesIn[mp.blockNumber]++;
                    }
                } else {
                    if (this.numXCMMessagesOut[mp.blockNumber] == undefined) {
                        this.numXCMMessagesOut[mp.blockNumber] = 1;
                    } else {
                        this.numXCMMessagesOut[mp.blockNumber]++;
                    }
                }
                recentXcmMsgs.push(s);
                if (xcmKeys.length > 0 && this.debugLevel >= paraTool.debugInfo) console.log(`[${blockNumber}] add ${xcmKey}`, s)
                this.xcmTrailingKeyMap[xcmKey].isFresh = false // mark the record as processed
            }
        }
        this.xcmmsgMap = {} // remove here...
        if (recentXcmMsgs.length > 0 && this.debugLevel >= paraTool.debugInfo) console.log(`[${blockNumber}] recentXcmMsgs`, recentXcmMsgs)


        if (blockNumber % 20 == 0) {
            //TODO: remove this after we are ready to write into bq
            this.cleanTrailingXcmMap(blockNumber)
        }

        if (evmFullBlock) {
            let evmBlockfeed = {
                chainID: chainID,
                blockNumber: blockNumber,
                blockType: 'evm'
            }
            // add evmblockhash pointer for searchability
            let evmBlockhash = evmFullBlock.hash
            // console.log("processBlockEvents added hashesRowsToInsert", evmBlockhash, this.hashesRowsToInsert.length);
            // (4) hashesRowsToInsert: evmFullBlockHash -> evmBlockBN
            //this.hashesRowsToInsert.push(evmBlockHashRec)
        }

        let blockStats = this.getBlockStats(block, eventsRaw, evmBlock, evmReceipts, autoTraces);

        if (recentExtrinsics.length > 0 || recentTransfers.length > 0 || recentXcmMsgs.length > 0) {
            this.add_recent_activity(recentExtrinsics, recentTransfers, recentXcmMsgs)
        }

        return blockStats;
    }

    add_recent_activity(recentExtrinsics, recentTransfers, recentXcmMsgs) {
        for (const r of recentExtrinsics) {
            this.recentExtrinsics.push(r);
        }
        for (const r of recentTransfers) {
            this.recentTransfers.push(r);
        }
        for (const r of recentXcmMsgs) {
            this.recentXcmMsgs.push(r);
        }
    }

    async processFeedIssuedAndBurned(feed, blockTS) {
        let events = feed.events
        let feedTransfers = []
        for (const e of events) {
            let eventID = e.eventID
            let [pallet, method] = this.parseEventSectionMethod(e)
            //STUB for now
        }
        return feedTransfers
    }

    async processFeedTransfer(feed, blockTS) {
        let events = feed.events
        let feedTransfers = []
        for (const e of events) {
            let eventID = e.eventID
            let [pallet, method] = this.parseEventSectionMethod(e)
            let data = e.data
            let resFeedTransferIn = await this.decorateFeedTransfer(pallet, method, data, feed, eventID, blockTS)
            if (resFeedTransferIn) {
                feedTransfers.push(resFeedTransferIn)
                //let recFeedOut = resFeedTransferIn
                // make a feedout record (setting)
                // recFeedOut.isIncoming = 0
                //feedTransfers.push(recFeedOut)

            }
        }
        return feedTransfers
    }

    //TODO: no good way to catch token:Deposited / assets:Issued
    async decorateFeedTransfer(pallet, method, data, feed, eventID, blockTS) {
        let chainID = feed.chainID
        let pallet_method = `${pallet}:${method}`
        let asset = null;
        let rawAsset = null;
        let rawAssetString = null;
        // WIP: add additional events using chainParser
        if (pallet_method == "balances:Transfer" || pallet_method == "currencies:Transferred" || pallet_method == "assets:Transferred" || pallet_method == "tokens:Transfer") {
            let feedTransfer = {}
            let fdata = {}
            let decimals = null
            let symbol = null;

            switch (pallet_method) {

                // native asset in the chainID
                case "balances:Transfer":
                    fdata = {
                        from: data[0],
                        to: data[1],
                        rawAmount: paraTool.dechexToInt(data[2]),
                        rawAsset: this.getNativeAsset()
                    }
                    symbol = this.getChainSymbol(chainID)
                    asset = `{"Token":"${symbol}"}`
                    decimals = this.getChainDecimal(chainID)
                    break;

                case "currencies:Transferred":
                case "tokens:Transfer":
                    let rAsset = data[0]

                    if (rAsset.dexShare != undefined) rAsset = rAsset.dexShare
                    if (rAsset.dEXShare != undefined) rAsset = rAsset.dEXShare

                    fdata = {
                        from: data[1],
                        to: data[2],
                        rawAmount: paraTool.dechexToInt(data[3]),
                        rawAsset: JSON.stringify(rAsset)
                    }
                    let rawAssetSymbol = null
                    let rawAssetDecimals = null
                    let rawAssetString = null
                    try {
                        [rawAssetSymbol, rawAssetDecimals, rawAssetString] = this.chainParser.getGenericSymbolAndDecimal(this, rAsset)
                    } catch (merr) {
                        console.log("this.chainParser.getGenericSymbolAndDecimal", rAsset, merr)
                    }
                    if (rAsset.token != undefined || rAsset.Token != undefined) { // move to chainParser ... this is Acala specific
                        symbol = rawAssetSymbol
                        decimals = rawAssetDecimals
                        asset = `{"Token":"${symbol}"}`
                    } else if (rawAssetSymbol && rawAssetDecimals !== false) {
                        //symbol = rawAssetSymbol
                        //asset = `{"Token":"${symbol}"}`
                        symbol = rawAssetSymbol
                        decimals = rawAssetDecimals
                        asset = rawAssetString
                        fdata.rawAsset = rawAssetString
                        /*
                        currencies:Transferred [
                          { liquidCrowdloan: 13 },
                          '25N6q25h2UMVES4etqQNxtMDWGBwqaKeNBPrwA4Ageyk3Wwi',
                          '23M5ttkmR6Kco2CnDJLZ9Xf15SfCVqH1EWsvTrw9PkHqUEqE',
                          2233001
                        ]
                        currencies:Transferred [
                          { stableAssetPoolToken: 0 },
                          '23zvAPSpwE3Bdr6Cw5L7hPSTjaFuU32KAKtM4VSMmh4cKVZi',
                          '23M5ttkmR6KcoCvrNZsA97DQMPxQmqktF8DHYZSDW4HLcEDw',
                          8999378691
                        ]
                        */
                    } else {
                        // NOT COVERED (dexShare)
                        /*
                        currencies:Transferred [
                          { dexShare: [ [Object], [Object] ] },
                          '23M5ttkmR6Kco7bReRDve6bQUSAcwqebatp3fWGJYb4hDSDJ',
                          '24rnopvwiRsVD75PHwLGtZgYKw5NJVQ5EtYPXcu7YCod7vuN',
                          343010445510480
                        ]
                        */
                        console.log(`decorateFeedTransfer not covered`, pallet_method, data)
                    }
                    //console.log(pallet_method, data)
                    break;

                case "assets:Transferred":
                    // console.log(pallet_method, data)
                    // TODO: use currencyID lookup
                    /* asset_id, from, to, rawAmount
                    [
                      "0x1fcacbd218edc0eba20fc2308c778080",
                      "0xa927E1e1E044CA1D9fe1854585003477331fE2Af",
                      "0x33597f544AcF67C6C450FBCe1EDD9457640Df58C",
                      97580439649
                    ]
                    */
                    let assetID = data[0]
                    //console.log(`assets:Transferred - rawAsset = ${assetID}`)
                    let [assetIDSymbol, assetIDDecimals, assetIDString] = this.chainParser.getGenericSymbolAndDecimal(this, assetID)
                    if (assetIDSymbol && assetIDDecimals !== false) {
                        symbol = assetIDSymbol
                        decimals = assetIDDecimals
                        asset = `{"Token":"${symbol}"}`
                    }
                    if (this.debugLevel >= paraTool.debugTracing) console.log(`>> symbol=${symbol},decimals=${decimals}, asset=${asset}`)
                    fdata = {
                        from: data[1],
                        to: data[2],
                        rawAmount: paraTool.dechexToInt(data[3]),
                        rawAsset: assetID,
                    }
                    break;

                default:
                    break;
            }
            if (fdata.from != undefined && fdata.to != undefined) {
                feedTransfer["chainID"] = chainID
                feedTransfer["chainName"] = this.getChainName(chainID);
                feedTransfer["blockNumber"] = feed.blockNumber
                feedTransfer["blockHash"] = feed.blockHash
                feedTransfer["ts"] = blockTS
                feedTransfer["isIncoming"] = 1 // vs outgoing
                feedTransfer["eventID"] = eventID
                feedTransfer["section"] = pallet
                feedTransfer["method"] = method
                feedTransfer["extrinsicID"] = feed.extrinsicID
                feedTransfer["extrinsicHash"] = feed.extrinsicHash
                feedTransfer["from"] = fdata.from
                feedTransfer["to"] = fdata.to
                feedTransfer["fromAddress"] = paraTool.getPubKey(fdata.from)
                feedTransfer["toAddress"] = paraTool.getPubKey(fdata.to)
                feedTransfer["rawAsset"] = fdata.rawAsset
                feedTransfer["rawAmount"] = fdata.rawAmount

                // get asset/decimals and pricing result for amountUSD
                /*
                  rawAmount: the original amount
                  Amount: rawAmount adjusted by decimals
                  symbol: asset's symbol
                  decimals: asset's decimals
                */

                if (symbol && decimals !== false) {
                    //asset = `{"Token":"${symbol}"}`
                    let amount = fdata.rawAmount / 10 ** decimals;
                    let p = await this.computePriceUSD({
                        val: amount,
                        asset: asset,
                        chainID: chainID,
                        ts: blockTS
                    })
                    feedTransfer["amount"] = amount;
                    feedTransfer["asset"] = asset
                    feedTransfer["symbol"] = symbol
                    feedTransfer["decimals"] = decimals
                    if (p) {
                        feedTransfer["amountUSD"] = p.valUSD;
                        feedTransfer["priceUSD"] = p.priceUSD;
                    }
                } else if (fdata.rawAmount != undefined) {
                    feedTransfer["amount"] = null
                    feedTransfer["asset"] = null
                    feedTransfer["symbol"] = null
                    feedTransfer["decimals"] = null
                    console.log(`[${eventID}] symbol, decimals unknown`, fdata);
                }

                feedTransfer["data"] = data
                // add index source for debugging
                feedTransfer["genTS"] = this.currentTS();
                feedTransfer["source"] = this.hostname
                //console.log(`feedTransfer`, feedTransfer)
                return feedTransfer
            }
        }
        return false
    }

    isExtrinsicSigned(extrinsic) {
        // we are calling this function with two formats (rExtrinsic(from blockStats) and extrinsic)
        //cleaned format .. usually called from blockstat
        if (extrinsic.signer !== undefined) {
            // unsgined cleaned extrinsics has signer null
            if (extrinsic.signer != undefined) {
                return true
            } else {
                return false
            }
        } else {
            // raw format ... called within process_extrinsic, process_pending_extrinsic
            let signature = extrinsic.signature ? extrinsic.signature : false
            if (signature) {
                if (signature.isSigned != undefined) {
                    return signature.isSigned
                }
            }
            return (false);
        }
    }

    init_asset(asset, assetType = paraTool.assetTypeToken, assetSource = paraTool.assetSourceOnChain, ctx = false) { // TODO: add currencyID here
        if (typeof asset !== 'string') {
            console.log("init_asset:", ctx, asset);
            return (false);
        }
        if (this.tallyAsset[asset] !== undefined) return (true);
        if (!this.validAsset(asset, this.chainID, "init_asset", asset)) {
            console.log("CREATING INVALID ASSET", ctx, asset, assetType);
        }
        switch (assetType) {
            case paraTool.assetTypeToken:
                this.tallyAsset[asset] = {
                    assetType: assetType,
                    // TODO: currencyID
                    assetSource: assetSource,
                    assetSourceMap: {},
                    issuance: 0,
                    price: 0,
                    syntheticRate: 0,
                };
                break;
            case paraTool.assetTypeLiquidityPair:
                this.tallyAsset[asset] = {
                    assetType: assetType,
                    assetSource: assetSource,
                    assetSourceMap: {},
                    lp0: [],
                    lp1: [],
                    rat: [],
                    token0In: 0,
                    token1In: 0,
                    token0Out: 0,
                    token1Out: 0,
                    issuance: 0,
                    price: 0,
                    isDualAssetTypeToken: 0,
                };
                break;
            case paraTool.assetTypeERC20LiquidityPair:
                var [assetKey, chainID] = paraTool.parseAssetChain(asset)
                let lpAddress = assetKey.split(":")[0]
                this.tallyAsset[asset] = {
                    assetType: assetType,
                    assetSource: assetSource,
                    lpAddress: ethTool.toChecksumAddress(lpAddress),
                    pair: null,
                    lp0: [],
                    lp1: [],
                    rat: [],
                    token0In: 0,
                    token1In: 0,
                    token0Out: 0,
                    token1Out: 0,
                    issuance: 0,
                };
                break;
            case paraTool.assetTypeLoan:
                // TODO: why is asset.assetType not getting set for loans?  How should parallel loans get a same/different assettype?
                this.tallyAsset[asset] = {
                    assetType: assetType,
                    assetSource: assetSource,
                    issuance: 0,
                    debitExchangeRate: 0
                }
                break;
            case paraTool.assetTypeCDP:
                this.tallyAsset[asset] = {
                    assetType: assetType,
                    //issuance: 0, //??
                    assetSource: assetSource,
                    supplyExchangeRate: 0,
                    borrowExchangeRate: 0
                }
                break;
            case paraTool.assetTypeNFT:
                this.tallyAsset[asset] = {
                    assetType: assetType,
                    assetSource: assetSource,
                    metadata: false,
                }
                break;
            case paraTool.assetTypeNFTToken:
                this.tallyAsset[asset] = {
                    assetType: assetType,
                    assetSource: assetSource,
                    metadata: false,
                }
                break;
            default:
                console.log("WARNING: init_asset: Unknown type", assetType);
                return (false);
                break;
        }
        return (true);
    }

    async processTraceAsAuto(blockTS, blockNumber, blockHash, chainID, trace, traceType, api) {
        // setParserContext
        this.chainParser.setParserContext(blockTS, blockNumber, blockHash, chainID)
        let rawTraces = [];
        if (!trace) return;
        if (!Array.isArray(trace)) {
            //console.log("prcessTrace", trace);
            return;
        }
        // (s) dedup the events
        let traceIdx = 0;
        for (const t of trace) {
            let [tRaw, _] = this.parse_trace_as_auto(t, traceType, traceIdx, blockNumber, blockHash, api);
            rawTraces.push(tRaw)
            traceIdx++
        }
        return rawTraces
    }

    /*
    {
      traceID: '1259126-37',
      p: 'CdpEngine',
      s: 'DebitExchangeRate',
      k: '0x5301bf5ff0298f5c7b93a446709f8e8812d36c1058eccc97dcabba867eab6dc7c483de2de1246ea70002',
      v: '0x406716b2b8070367010000000000000000',
      pkExtra: '[{"Token":"DOT"}]',
      pv: '101052848337458791'
    }
    */
    async processTraceFromAuto(blockTS, blockNumber, blockHash, chainID, autoTraces, traceType, api) {

        // setParserContext
        this.chainParser.setParserContext(blockTS, blockNumber, blockHash, chainID)

        let dedupEvents = {};
        if (!autoTraces) return;
        if (!Array.isArray(autoTraces)) {
            //console.log("prcessTrace", autoTraces);
            return;
        }
        // (s) dedup the events
        for (const a of autoTraces) {
            let o = {}
            o.bn = blockNumber;
            o.blockHash = blockHash;
            o.ts = blockTS;
            o.s = a.s
            o.p = a.p
            o.k = a.k;
            o.v = a.v;
            o.pv = a.pv;
            o.pkExtra = (a.pkExtra != undefined) ? a.pkExtra : null;
            o.traceID = a.traceID
            dedupEvents[a.k] = o;
        }

        for (const dedupK of Object.keys(dedupEvents)) {
            let a = dedupEvents[dedupK];
            let [a2, _] = this.parse_trace_from_auto(a, traceType, blockNumber, blockHash, api);

            if (!a2) continue;
            let p = a2.p;
            let s = a2.s;

            let pallet_section = `${p}:${s}`

            //temp local list blacklist for easier debugging
            if (pallet_section == '...') {
                continue
            }
            //console.log(`processTrace ${pallet_section}`, a2)
            if (a2.mpType && a2.mpIsSet) {
                await this.chainParser.processMP(this, p, s, a2)
            } else if (a2.mpIsEmpty) {
                // we can safely skip the empty mp here - so that it doens't count towards not handled
            } else if (a2.accountID && a2.asset) {
                let chainID = this.chainID
                let rAssetkey = a2.asset
                let fromAddress = paraTool.getPubKey(a2.accountID)
                await this.chainParser.processAccountAsset(this, p, s, a2, rAssetkey, fromAddress)
            } else if (a2.asset) {
                await this.chainParser.processAsset(this, p, s, a2)
            } else if (a2.lptokenID) {
                // decorate here
                a2.asset = a2.lptokenID
                await this.chainParser.processAsset(this, p, s, a2)
            } else {
                if (this.unhandledTraceMap[pallet_section] == undefined) {
                    //console.log(`(not handled) ${pallet_section}`);
                    if (this.debugLevel >= paraTool.debugTracing) console.log(`(not handled) ${pallet_section}`, JSON.stringify(a2));
                    this.unhandledTraceMap[pallet_section] = 0;
                }
                this.unhandledTraceMap[pallet_section]++
            }
        }
    }

    currentHour() {
        let today = new Date();
        return today.getUTCHours();
    }


    currentDateAsString() {
        let today = new Date();
        let dd = today.getUTCDate().toString().padStart(2, '0');
        let mm = String(today.getUTCMonth() + 1).padStart(2, '0'); //January is 0!
        let yyyy = today.getUTCFullYear();
        let logDT = `${yyyy}-${mm}-${dd}`;
        return (logDT);
    }

    date_key(logDT) {
        let a = logDT;
        let year = a.getUTCFullYear();
        let month = (a.getUTCMonth() + 1).toString().padStart(2, '0')
        let date = a.getUTCDate().toString().padStart(2, '0');
        let logDTKey = `${year}-${month}-${date}`
        return logDTKey
    }

    async decodeRawBlock(r) {
        let blk = {
            block: r.block,
            justifications: null
        }
        var signedBlock2;
        try {
            signedBlock2 = this.apiAt.registry.createType('SignedBlock', blk);
        } catch (e) {}
        return signedBlock2
    }

    async setup_chainParser(chain, debugLevel = paraTool.debugNoLog, isTip = false) {
        await this.chainParserInit(chain.chainID, debugLevel);
        if (chain.isEVM == 1) {
            await this.getChainERCAssets(this.chainID);
        }
        await this.get_skipStorageKeys();
        if (isTip == false) return;
        let assetRegistryMetaChain = [paraTool.chainIDKarura, paraTool.chainIDAcala, paraTool.chainIDBifrostKSM, paraTool.chainIDBifrostDOT]
        let assetMetaChain = [paraTool.chainIDAstar, paraTool.chainIDShiden, paraTool.chainIDMoonbeam, paraTool.chainIDMoonriver, paraTool.chainIDHeiko, paraTool.chainIDParallel]
        if (false && (this.chainID == paraTool.chainIDKarura || this.chainID == paraTool.chainIDAcala ||
                this.chainID == paraTool.chainIDBifrostKSM || this.chainID == paraTool.chainIDBifrostDOT)) {
            //TODO: chainIDBifrostDOT does not support assetRegistry yet
            if (this.chainID == paraTool.chainIDKarura || this.chainID == paraTool.chainIDAcala) {
                console.log(`Fetch assetRegistry:assetMetadatas`)
                await this.chainParser.fetchAssetRegistry(this)
                console.log(`Fetch assetRegistry:foreignAssetLocations`)
                await this.chainParser.fetchXCMAssetRegistryLocations(this)
                await this.chainParser.updateLiquidityInfo(this)
            }
            if (this.chainID == paraTool.chainIDBifrostKSM || this.chainID == paraTool.chainIDBifrostDOT) {
                //console.log(`Fetch assetRegistry:currencyMetadatas`)
                //await this.chainParser.fetchAssetRegistryCurrencyMetadatas(this)
                console.log(`Fetch assetRegistry:currencyIdToLocations`)
                await this.chainParser.fetchXCMAssetRegistryLocations(this)
            }
        } else if (false && (this.chainID == paraTool.chainIDAstar || this.chainID == paraTool.chainIDShiden || this.chainID == paraTool.chainIDShibuya ||
                this.chainID == paraTool.chainIDMoonbeam || this.chainID == paraTool.chainIDMoonriver || this.chainID == paraTool.chainIDMoonbaseAlpha || this.chainID == paraTool.chainIDMoonbaseBeta ||
                this.chainID == paraTool.chainIDHeiko || this.chainID == paraTool.chainIDParallel ||
                this.chainID == paraTool.chainIDStatemine || this.chainID == paraTool.chainIDStatemint ||
                this.chainID == paraTool.chainIDPhala || this.chainID == paraTool.chainIDKhala ||
                this.chainID == paraTool.chainIDHydraDX || this.chainID == paraTool.chainIDBasilisk ||
                this.chainID == paraTool.chainIDCalamari ||
                this.chainID == paraTool.chainIDRobonomics ||
                this.chainID == paraTool.chainIDMangataX ||
                this.chainID == paraTool.chainIDListen ||
                this.chainID == paraTool.chainIDCrustShadow)) {
            await this.chainParser.fetchAsset(this)
            if (this.chainID == paraTool.chainIDHeiko || this.chainID == paraTool.chainIDParallel) {
                await this.chainParser.fetchAsset(this)
                await this.chainParser.updateLiquidityInfo(this)
            }
            if (this.chainID == paraTool.chainIDMoonbeam || this.chainID == paraTool.chainIDMoonriver || this.chainID == paraTool.chainIDMoonbaseAlpha || this.chainID == paraTool.chainIDMoonbaseBeta) {
                await this.chainParser.fetchLocalAsset(this)
            }
            if (this.chainID == paraTool.chainIDMoonbeam || this.chainID == paraTool.chainIDMoonriver || this.chainID == paraTool.chainIDMoonbaseAlpha || this.chainID == paraTool.chainIDMoonbaseBeta ||
                this.chainID == paraTool.chainIDHeiko || this.chainID == paraTool.chainIDParallel ||
                this.chainID == paraTool.chainIDCrustShadow) {
                console.log(`fetch assetManager:assetIdType`)
                await this.chainParser.fetchXCMAssetIdType(this)
            }
            if (this.chainID == paraTool.chainIDAstar || this.chainID == paraTool.chainIDShiden || this.chainID == paraTool.chainIDShibuya ||
                this.chainID == paraTool.chainIDCalamari) {
                console.log(`fetch xcAssetConfig:assetIdToLocation (assetRegistry:assetIdToLocation)`)
                await this.chainParser.fetchXCMAssetIdToLocation(this)
            }
        } else if (false && this.chainID == paraTool.chainIDKico) {
            console.log(`fetch asset:fetchCurrenciesDicoAssetInfos`)
            await this.chainParser.fetchCurrenciesDicoAssetInfos(this)
        }

        // for any new unknown assets, set them up with names, decimals

        await this.chainParser.getSystemProperties(this, chain);
    }

    // given a row r fetched with "fetch_block_row", processes the block, events + trace
    async index_chain_block_row(r, signedBlock = false, write_bq_log = false, refreshAPI = false, isTip = false) {
        /* index_chain_block_row shall process trace(if available) + block + events in orders
        xcm steps:
        (1a) processTrace: parse outgoing xcmmessages from traces
        (1b) processBlockEvents: parse xcm transfers + xcm-incoming executed signals(TODO), use result from 1a to link xcmtransfers to xcmmessages
        > This implies that we MUST do 1a, 1b in seqence UNLESS to push all the flushes to step 2
        */
        //console.log('index_chain_block_row', JSON.stringify(r))

        let autoTraces = false
        if (r.block && r.trace) {
            // setup ParserContext here
            let blk = r.block
            let blockNumber = blk.header.number;
            let blockHash = blk.hash;
            let blockTS = blk.blockTS;
            let processTraceStartTS = new Date().getTime()
            if (r.blockHash == undefined || r.blockHash.length != 66) {
                this.logger.error({
                    "op": "index_chain_block_row",
                    "bn": `${this.chainID}-${blockNumber}`,
                    "msg": 'missing blockHash - check source',
                })
            } else {
                let forceParseTrace = false
                let traceType = this.compute_trace_type(r.trace, r.traceType);
                let api = (refreshAPI) ? await this.api.at(blockHash) : this.apiAt;
                if (r.autotrace === false || r.autotrace == undefined || (r.autotrace && Array.isArray(r.autotrace) && r.autotrace.length == 0) || forceParseTrace) {
                    if (this.debugLevel >= paraTool.debugInfo) console.log(`[${blockNumber}] [${blockHash}] autotrace generation`);
                    autoTraces = await this.processTraceAsAuto(blockTS, blockNumber, blockHash, this.chainID, r.trace, traceType, api);
                } else {
                    // SKIP PROCESSING since we covered autotrace generation already
                    if (this.debugLevel >= paraTool.debugTracing) console.log(`[${blockNumber}] [${blockHash}] autotrace already covered len=${r.autotrace.length}`);
                    autoTraces = r.autotrace;
                }
                await this.processTraceFromAuto(blockTS, blockNumber, blockHash, this.chainID, autoTraces, traceType, api); // use result from rawtrace to decorate

                let processTraceTS = (new Date().getTime() - processTraceStartTS) / 1000
                //console.log(`index_chain_block_row: processTrace`, processTraceTS);
            }
        } else {
            console.log("index_chain_block_row missing block/trace");
        }

        if (r.block && r.events) {
            let decodeRawBlockStartTS = new Date().getTime()
            if (!signedBlock) {
                let decodeRawBlockSignedBlockStartTS = new Date().getTime()
                signedBlock = await this.decodeRawBlock(r)
                let decodeRawBlockSignedBlockTS = (new Date().getTime() - decodeRawBlockSignedBlockStartTS) / 1000
            }
            r.block.extrinsics = signedBlock.block.extrinsics
            let decodeRawBlockTS = (new Date().getTime() - decodeRawBlockStartTS) / 1000

            let processBlockEventsStartTS = new Date().getTime()
            //console.log(`calling processBlockEvents evmBlock=${r.evmBlock.number}`)
            let tracesPresent = (r.trace) ? true : false;
            let blockStats = await this.processBlockEvents(this.chainID, r.block, r.events, r.evmBlock, r.evmReceipts, r.evmTrace, autoTraces, true, write_bq_log, isTip, tracesPresent);
            r.blockStats = blockStats

        } else {
            console.log("index_chain_block_row missing block/events");
        }

        return r;
    }

    synthetic_blockTS(chainID, blockNumber) {
        if (chainID == paraTool.chainIDStatemine || chainID == paraTool.chainIDStatemint || chainID == paraTool.chainIDShiden) {
            return 1577836800; // placeholder
        }
        return (false);
    }

    isH160Native(chainID) {
        if (chainID == paraTool.chainIDMoonbeam || chainID == paraTool.chainIDMoonriver) {
            return (true);
        }
        return (false);
    }

    async indexEVMTrace(chain, blockNumber) {
        await this.setup_chainParser(chain, this.debugLevel);
        //await this.initApiAtStorageKeys(chain, null, blockNumber);
        this.chainID = chain.chainID;
        console.log("evmtrace chainID=", chain.chainID, blockNumber);
        let rRow = await this.fetch_block_row(chain, blockNumber);
        let transactionsInternal = ethTool.processEVMTrace(rRow['evmTrace'], rRow['evmBlock'].transactions);
        //console.log(evmTrace.length, JSON.stringify(evmTrace, null, 4));
        console.log(transactionsInternal);
    }

    getNativeAsset() {
        let symbol = this.getChainSymbol(this.chainID);
        if (symbol) {
            return JSON.stringify({
                Token: symbol
            })
        } else {
            return (false);
        }
    }

    getNativeSymbol() {
        let symbol = this.getChainSymbol(this.chainID);
        if (symbol) {
            return symbol
        } else {
            return (false);
        }
    }

    getRelayChainSymbol() {
        let relayChain = this.relayChain
        let relayChainID = paraTool.getRelayChainID(relayChain)
        let symbol = this.getChainSymbol(relayChainID);
        if (symbol) {
            return symbol
        } else {
            return (false);
        }
    }

    getNativeAssetChain() {
        let nativeAsset = this.getNativeAsset();
        if (!nativeAsset) return (false);
        let nativeAssetChain = paraTool.makeAssetChain(nativeAsset, this.chainID);
        return (nativeAssetChain);
    }

    getRelayChainAsset() {
        let relayChain = this.relayChain
        let relayChainID = paraTool.getRelayChainID(relayChain)
        let symbol = this.getChainSymbol(relayChainID);
        if (symbol) {
            return JSON.stringify({
                Token: symbol
            })
        } else {
            return (false);
        }
    }

    async genesisAsset(chain) {
        let nativeAssetChain = this.getNativeAsset();
        if (!nativeAssetChain) return (false);
        let totalIssuance = 0;
        try {
            totalIssuance = await this.apiAt.query.balances.totalIssuance();
            let d = this.getChainDecimal(this.chainID);
            totalIssuance = Math.floor(totalIssuance / (10 ** d));
        } catch (err) {
            this.logger.warn({
                "op": "genesisAsset",
                "chainID": chain.chainID,
                err
            })
        }
        let result = {};
        result[nativeAssetChain] = {
            issuance: totalIssuance
        };
        return result;
    }

    async update_xcm_count(daysago = 2) {}

    async update_chain_assets(chain, daysago = 2) {}


    getSpecVersionAtBlockNumber(chain, bn) {
        if (chain.specVersions == undefined) return (null);
        let result = null;
        for (let i = 0; i < chain.specVersions.length; i++) {
            let sv = chain.specVersions[i];
            if (bn >= sv.blockNumber) {
                result = sv; // there could be a better one, cannot return it
            }
        }
        return (result);
    }

    async initApiAtStorageKeys(chain, blockHash = false, bn = 1) {
        var runtimeVersion = await this.api.rpc.state.getRuntimeVersion();
        this.specVersion = runtimeVersion.toJSON().specVersion;
        return this.specVersion
    }

    // goal: lookup index m which is LESS than el and n which IS element, and return n
    async specSearch(maxBlockNumber, el, manager, compare_fn) {
        var m = 1;
        var n = maxBlockNumber;

        while (n - m > 1) {
            var k = (n + m) >> 1;
            var cmp = await compare_fn(el, k, manager);
            if (cmp == null) {
                return false;
            } else if (cmp < 0) { // if ar[k] is < el then move n down
                m = k;
            } else { // if ar[k] is >= el then move m up
                n = k;
            }
        }
        var cmp = await compare_fn(el, n, manager);
        if (cmp == 0) {
            return n;
        }
        return false;
    }

    async update_spec_version(chainID, specVersion) {
        try {
            let chain = await this.getChain(chainID);
            let api = this.api;
            let maxBlockNumber = chain.blocksFinalized;
            if (maxBlockNumber == null) {
                console.log("update_spec_version no blocksFinalized! -- skip");
                return (false);
            }

            console.log("reading blocks looking for specVersion", specVersion, maxBlockNumber)
            let r = await this.specSearch(maxBlockNumber, specVersion, this, async function(a, bn, manager) {
                let sql = `select blockHash from block${chainID} where blockNumber = '${bn}'`
                let blocks = await manager.poolREADONLY.query(sql);
                if (blocks.length > 0) {
                    let blockHash = blocks[0].blockHash;
                    if (blockHash != undefined && blockHash.length > 10) {
                        let runtimeVersion = await api.rpc.state.getRuntimeVersion(blocks[0].blockHash);
                        let specVersion = runtimeVersion.toJSON().specVersion;
                        return (specVersion - a);
                    } else {
                        console.log("MISSING blockHash", sql);
                        return null
                    }
                } else {
                    console.log("MISSING bn", sql);
                    return null;
                }
            });
            if (r) {
                let sql = `select blockNumber, blockHash, from_unixtime(blockDT) as blockTS, blockHash from block${chainID} where blockNumber = '${r}'`
                let blocks = await this.poolREADONLY.query(sql);
                if (blocks.length > 0) {
                    let b = blocks[0];
                    let blockHash = b.blockHash;
                    let metadataRaw = blockHash ? await this.api.rpc.state.getMetadata(blockHash) : await this.api.rpc.state.getMetadata();
                    let metadata = metadataRaw.asV14.toJSON();
                    await this.upsertSQL({
                        "table": "specVersions",
                        "keys": ["chainID", "specVersion"],
                        "vals": ["blockNumber", "blockHash", "firstSeenDT", "metadata"],
                        "data": [`('${chainID}', '${specVersion}', '${b.blockNumber}', '${b.blockHash}', Now(), ${mysql.escape(JSON.stringify(metadata))})`],
                        "replace": ["blockNumber", "blockHash", "firstSeenDT", "metadata"]
                    });
                }
            }
        } catch (err) {
            console.log(err)
        }
        return false
    }

    async updateSpecVersions(chain) {
        let specVersions = await this.poolREADONLY.query(`select specVersion, UNIX_TIMESTAMP(firstSeenDT) as firstSeenTS from specVersions where chainID = ${chain.chainID} and blockNumber is Null order by chainID, specVersion`);
        for (let i = 0; i < specVersions.length; i++) {
            let specVersion = specVersions[i].specVersion;
            // goal: search for the first blockNumber which is the same as specVersion
            await this.update_spec_version(chain.chainID, specVersion);
        }
    }
}
