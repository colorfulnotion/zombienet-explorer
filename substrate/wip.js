    // for all holders get the balances (native or not) and write to BT and mysql ... within 10 mins
    async updateChainAssetHoldersBalances(chain, limitSeconds = 600) {
        let batchSize = 128;
        let bn = chain.blocksFinalized;
        await this.setupAPI(chain);
        let chainID = chain.chainID;
        this.chainID = chainID;
        let web3Api = this.web3Api
        let startTS = this.getCurrentTS();

        let nativeAsset = this.getNativeAsset();
        var sql = `select asset.asset, assetholder.holder, asset.decimals, asset.xcContractAddress, asset.assetType, assetholder.lastUpdateBN, UNIX_TIMESTAMP(assetholder.lastUpdateDT) as lastUpdateTS
from assetholder${chainID} as assetholder, asset where assetholder.asset = asset.asset and asset.chainID = ${chainID} and assetholder.lastCrawlBN < assetholder.lastUpdateBN and length(holder) = 42 limit 100000`;

        let ts = this.getCurrentTS();
        var assetholderRecs = await this.poolREADONLY.query(sql);
        let assetdecimals = {};
        let assetholders = {};
        for (let i = 0; i < assetholderRecs.length; i++) {
            let a = assetholderRecs[i];
            let asset = a.asset;
            let assetChain = paraTool.makeAssetChain(asset, chainID);
            let holder = a.holder;
            let decimals = a.decimals;
            let lastUpdateTS = a.lastUpdateTS;
            let lastUpdateBN = a.lastUpdateBN;
            if (!assetdecimals[assetChain]) {
                assetdecimals[assetChain] = decimals;
            }
            if (!assetholders[assetChain]) {
                assetholders[assetChain] = {};
            }
            assetholders[assetChain][holder] = a;
        }
        let rows = [];
        let out = [];
        let assetsList = []; //for debugging
        for (const assetChain of Object.keys(assetholders)) {
            if (this.getCurrentTS() - startTS > limitSeconds) return (true);
            let a = assetholders[assetChain];
            let holdersAll = Object.keys(assetholders[assetChain]);
            let i = 0;
            let decimals = this.getChainDecimal(chainID);
            while (i < holdersAll.length) {
                let holders = holdersAll.slice(i, i + batchSize);
                let holderBalances = {};
                let [asset, _] = paraTool.parseAssetChain(assetChain);
                let tokenDecimal = assetdecimals[asset];
                try {
                    console.log("FETCH", asset, holders.length, nativeAsset, this.chainID)
                    if (asset == nativeAsset && (chainID !== paraTool.chainIDMoonbeam) && (chainID !== paraTool.chainIDMoonriver)) { // TODO: check Astar/Shiden
                        holderBalances.blockNumber = chain.blocksFinalized;
                        holderBalances.holders = [];
                        for (let h = 0; h < holders.length; h++) {
                            let account_id = holders[h];
                            try {
                                var x = await this.api.query.system.account(account_id);
                                let d = x.toJSON().data;
                                d.free = d.free / 10 ** decimals;
                                d.reserved = d.reserved / 10 ** decimals;
                                d.miscFrozen = d.miscFrozen / 10 ** decimals;
                                d.feeFrozen = d.feeFrozen / 10 ** decimals;
                                holderBalances.holders.push({
                                    holderAddress: account_id,
                                    data: d
                                });
                            } catch (e) {
                                console.log(e);
                            }
                        }
                        // holderBalances = await ethTool.getNativeChainBalances(web3Api, holders, bn)
                    } else {
                        let tokenAddress = asset;
                        let assetInfo = this.assetInfo[assetChain];
                        if (assetInfo && assetInfo.xcContractAddress) {
                            // if there is a mapping from asset => xcContractAddress,use that for the tokenAddress in this ethTool rpccall
                            tokenAddress = assetInfo.xcContractAddress;
                        }
                        holderBalances = await ethTool.getTokenHoldersRawBalances(web3Api, tokenAddress, holders, tokenDecimal, bn)
                        if (holderBalances.holders.length != holders.length) {
                            console.log("FETCH FAIL", tokenAddress, holders.length, holderBalances.holders.length);
                        }
                    }
                } catch (err) {
                    this.logger.warn({
                        "op": "crawlAssetHoldersBalances",
                        "asset": asset,
                        err
                    })
                }
                if (holderBalances && holderBalances.holders) {
                    let lastCrawlBN = holderBalances.blockNumber;
                    let nwrites = 0;
                    holderBalances.holders.map((b) => {
                        let holder = b.holderAddress;
                        let accKey = b.holderAddress.toLowerCase();
                        let newState = false;
                        let free = 0;
                        let reserved = 0;
                        let feeFrozen = 0;
                        let miscFrozen = 0;
                        if (b.data) {
                            newState = b.data;
                            free = newState.free;
                            reserved = newState.reserved;
                            feeFrozen = newState.feeFrozen;
                            miscFrozen = newState.miscFrozen;

                        } else if (b.balance != undefined) {
                            free = b.balance;
                            if (b.error != undefined) {
                                console.log(`crawlAssetHoldersBalances acctError ${holder}, asset=${asset}, errMsg= ${b.error}`)
                            }
                            newState = {
                                free: b.balance
                            }
                        }

                        if (free < 10 ** 32) {
                            let rec = {};
                            let lastUpdateTS = assetholders[holder];
                            await this.insertAccountRealtime(accKey, assetChain, ts, JSON.stringify(newState));
                            out.push(`('${asset}', '${chainID}', '${accKey}', '${free}', '${reserved}', '${feeFrozen}', '${miscFrozen}', '${lastCrawlBN}')`);
                            nwrites++;
                        }
                    });
                    console.log(" --> ", asset, nwrites);
                }
                console.log(out);

                i += batchSize
                if (out.length > 0) {
                    await this.upsertSQL({
                        "table": `assetholder${chainID}`,
                        "keys": ["asset", "chainID", "holder"],
                        "vals": ["free", "reserved", "frozen", "miscFrozen", "lastCrawlBN"],
                        "data": out,
                        "replace": ["free", "reserved", "frozen", "miscFrozen", "lastCrawlBN"]
                    });
                    out = [];
                }
            }
        }


        if (out.length > 0) {
            await this.upsertSQL({
                "table": `assetholder${chainID}`,
                "keys": ["asset", "chainID", "holder"],
                "vals": ["free", "reserved", "frozen", "miscFrozen", "lastCrawlBN"],
                "data": out,
                "replace": ["free", "reserved", "frozen", "miscFrozen", "lastCrawlBN"]
            });
            out = [];
        }
        return (true);
    }

async flush_assets(ts = false, blockNumber = false, isFullPeriod = false, isTip = false) {
        if (!ts) ts = Math.floor(Date.now() / 1000)
        let ats = ts * 1000000;

        // for all this.assetList, write to asset; mysql address table
        if (isTip) {
            //console.log(`flush_assets [${blockNumber}], ts=${ts}, isFullPeriod=${isFullPeriod}, isTip=${isTip}`)
        }
        let chainID = this.chainID;
        let web3Api = this.web3Api;

        var erc20s = [];
        var tokens = [];

        var erc721classes = [];
        var erc721tokens = [];
        var erc1155classes = [];
        var erc1155tokens = [];
        var contracts = [];
        let assetlogLiquidityPairs = [];
        let assetlogTokensIssuance = [];
        let assetlogTokensPrice = [];
        let assetlogLoans = [];
        let assetlogCDPs = [];

        for (const assetChain of Object.keys(this.tallyAsset)) {
            let assetInfoType = this.tallyAsset[assetChain].assetType;
            let lastTouchedBn = this.tallyAsset[assetChain].blockNumber
            if (this.assetChainMap[assetInfoType] == undefined) {
                this.assetChainMap[assetInfoType] = []
                this.assetStat[assetInfoType] = 0
            }
            this.assetChainMap[assetInfoType].push(assetChain)
            this.assetStat[assetInfoType]++
        }

        // console.log(`assetStat`, this.assetStat, `assetChainMap`, this.assetChainMap)

        let erc20LPPromise = false,
            erc20Promise = false

        for (const assetType of Object.keys(this.assetChainMap)) {
            //potential batch all erc call parallel
            let assetChains = this.assetChainMap[assetType]
            //console.log(`${assetType} len=${assetChains.length}`, assetChains)
            //console.log(`${assetChains}`)
            switch (assetType) {
                case paraTool.assetTypeERC20:
                    if (isTip) {
                        //console.log(`${assetType} len=${assetChains.length}`, assetChains)
                    }
                    erc20Promise = await assetChains.map(async (assetChain) => {
                        try {
                            return this.processAssetTypeERC20(web3Api, chainID, assetChain, ts, blockNumber, isFullPeriod, isTip)
                        } catch (err) {
                            console.log(`processAssetTypeERC20 ${assetChain}`, err)
                            return false
                        }
                    });
                    break;
                case paraTool.assetTypeToken:
                    break;
                case paraTool.assetTypeLoan:
                    break;
                case paraTool.assetTypeLiquidityPair:
                    break;
                case paraTool.assetTypeERC20LiquidityPair:
                    erc20LPPromise = await assetChains.map(async (assetChain) => {
                        try {
                            return this.processAssetTypeERC20LiquidityPair(web3Api, chainID, assetChain, ts, blockNumber, isFullPeriod)
                        } catch (err) {
                            console.log(`processAssetTypeERC20LiquidityPair ${assetChain}`, err)
                            return false
                        }
                    });
                    break;
                case paraTool.assetTypeNFTToken:
                    break;
                case paraTool.assetTypeNFT:
                    break;
                case paraTool.assetTypeERC721:
                    break;
                case paraTool.assetTypeERC721Token:
                    break;
                case paraTool.assetTypeERC1155:
                    break;
                case paraTool.assetTypeERC1155Token:
                    break;
                case paraTool.assetTypeContract:
                    break;
                case paraTool.assetTypeCDP:
                    break;
                default:
                    console.log("TODO: flush - unknown assetType", assetType);
                    break;
            }
        }

        if (erc20LPPromise) {
            let erc20LPPromiseStartTS = new Date().getTime();
            var erc20LPList = await Promise.allSettled(erc20LPPromise)
            let erc20LPPromisTS = (new Date().getTime() - erc20LPPromiseStartTS) / 1000
            if (this.debugLevel >= paraTool.debugVerbose) console.log("flush(b) - erc20LP", erc20LPPromisTS);

            for (const erc20LPRes of erc20LPList) {
                if (erc20LPRes['status'] == 'fulfilled') {
                    if (erc20LPRes['value']) {
                        assetlogLiquidityPairs.push(erc20LPRes['value'])
                    }
                } else {
                    console.log(`error`, erc20LPRes)
                }
            }
        }

        if (erc20Promise) {
            let erc20PromiseStartTS = new Date().getTime();
            var erc20List = await Promise.allSettled(erc20Promise)
            let erc20PromisTS = (new Date().getTime() - erc20PromiseStartTS) / 1000
            if (this.debugLevel >= paraTool.debugVerbose) console.log("flush(b) - erc20", erc20PromisTS);


            for (const erc20Res of erc20List) {
                if (erc20Res['status'] == 'fulfilled') {
                    if (erc20Res['value']) {
                        erc20s.push(erc20Res['value'])
                    }
                } else {
                    console.log(`error`, erc20Res)
                }
            }

        }

        for (const assetChain of Object.keys(this.tallyAsset)) {
            //need to generate revered pairKey in order to final volume
            let [asset, _] = paraTool.parseAssetChain(assetChain);
            let assetInfo = this.tallyAsset[assetChain];

            switch (assetInfo.assetType) {
                // process both normal erc20 (non-lp token) and erc20LP token info
                case paraTool.assetTypeERC20:
                    break;

                case paraTool.assetTypeToken: {
                    let issuance = assetInfo.issuance;
                    tokens.push(`('${asset}', '${chainID}', '${assetInfo.assetType}', '${issuance}', FROM_UNIXTIME('${ts}'), '${blockNumber}' )`); // *** REVIEW assetType here
                    if (isFullPeriod) {
                        let updIssuance = false
                        let updPrice = false
                        let r = {
                            issuance: 0,
                            price: 0,
                            source: null,
                        };
                        if (assetInfo.issuance) {
                            r.issuance = assetInfo.issuance;
                            assetInfo.issuance = 0;
                            updIssuance = true;
                        }
                        if (assetInfo.price) {
                            r.price = assetInfo.price;
                            updPrice = true;
                        }
                        if (updIssuance) {
                            let o1 = `('${asset}', '${this.chainID}', '${ts}', '${paraTool.assetSourceOnChain}','${r.issuance}')`
                            if (this.debugLevel >= paraTool.debugInfo) console.log(`paraTool.assetTypeToken[${paraTool.assetSourceOnChain}] ${assetChain}`, o1)
                            if (this.validAsset(asset, this.chainID, assetInfo.assetType, o1)) {
                                assetlogTokensIssuance.push(o1)
                            }
                        }
                        if (updPrice) {
                            let o2 = `('${asset}', '${this.chainID}', '${ts}', '${paraTool.assetSourceOracle}','${r.price}')`
                            if (this.debugLevel >= paraTool.debugInfo) console.log(`paraTool.assetTypeToken[${paraTool.assetSourceOracle}] ${assetChain}`, o2)
                            if (this.validAsset(asset, this.chainID, assetInfo.assetType, o2)) {
                                assetlogTokensPrice.push(o2)
                            }
                        }
                    }
                }
                break;

                case paraTool.assetTypeLoan:
                    if (isFullPeriod) {
                        let r = {
                            issuance: 0,
                            debitExchangeRate: 0,
                            source: assetInfo.assetSource,
                        };
                        let upd = false;
                        if (assetInfo.issuance) {
                            r.issuance = assetInfo.issuance;
                            assetInfo.issuance = 0;
                            upd = true;
                        }
                        if (assetInfo.debitExchangeRate) {
                            r.debitExchangeRate = assetInfo.debitExchangeRate;
                            assetInfo.debitExchangeRate = 0;
                            upd = true;
                        }
                        if (upd) {
                            let o = `('${asset}', '${this.chainID}', '${ts}', '${r.source}', '${r.issuance}', '${r.debitExchangeRate}')`
                            if (this.debugLevel >= paraTool.debugInfo) console.log(`Loan`, o)
                            if (this.validAsset(asset, this.chainID, assetInfo.assetType, o) && this.validDouble(r, assetInfo.assetType, o) && this.validDecimal(r, assetInfo.assetType, o)) {
                                assetlogLoans.push(o);
                            }
                        }
                    }
                    break;
                case paraTool.assetTypeCDP:
                    if (isFullPeriod) {
                        let r = {
                            //issuance: 0,
                            supplyExchangeRate: 0,
                            borrowExchangeRate: 0,
                            source: assetInfo.assetSource,
                        };
                        let upd = false;
                        if (assetInfo.supplyExchangeRate && assetInfo.borrowExchangeRate) {
                            r.supplyExchangeRate = assetInfo.supplyExchangeRate;
                            r.borrowExchangeRate = assetInfo.borrowExchangeRate;
                            assetInfo.supplyExchangeRate = 0;
                            assetInfo.borrowExchangeRate = 0;
                            upd = true;
                        }
                        if (upd) {
                            let o = `('${asset}', '${this.chainID}', '${ts}', '${r.source}', '${r.supplyExchangeRate}', '${r.borrowExchangeRate}')`
                            console.log(`CDP`, o)
                            if (this.validAsset(asset, this.chainID, assetInfo.assetType, o) && this.validDouble(r, assetInfo.assetType, o) && this.validDecimal(r, assetInfo.assetType, o)) {
                                assetlogCDPs.push(o);
                            }
                        }
                    }
                    break;
                case paraTool.assetTypeLiquidityPair:
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
                            issuance: 0,
                            source: assetInfo.assetSource,
                        };
                        let upd = false;

                        if (assetInfo.rat !== undefined && assetInfo.rat.length > 0) {
                            r.low = Math.min(...assetInfo.rat);
                            r.high = Math.max(...assetInfo.rat);
                            r.open = assetInfo.rat[0];
                            r.close = assetInfo.rat[assetInfo.rat.length - 1];
                            upd = true;
                        }
                        if (assetInfo.lp0 !== undefined && assetInfo.lp1 !== undefined && assetInfo.lp0.length > 0 && assetInfo.lp1.length > 0) {
                            r.lp0 = assetInfo.lp0[assetInfo.lp0.length - 1];
                            r.lp1 = assetInfo.lp1[assetInfo.lp1.length - 1];
                            upd = true;
                        }
                        if (assetInfo.issuance !== undefined) {
                            r.issuance = assetInfo.issuance;
                            assetInfo.issuance = 0;
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

                        if (upd) {
                            this.tallyAsset[assetChain].lp0 = [];
                            this.tallyAsset[assetChain].lp1 = [];
                            this.tallyAsset[assetChain].rat = [];


                            // clear volume tally
                            this.tallyAsset[assetChain].token0In = 0;
                            this.tallyAsset[assetChain].token1In = 0;
                            this.tallyAsset[assetChain].token0Out = 0;
                            this.tallyAsset[assetChain].token1Out = 0;

                            //(asset, chainID, indexTS, source, open, close, low, high, lp0, lp1, issuance, token0Volume, token1Volume, state )
                            let state = JSON.stringify(r)
                            let o = `('${asset}', '${this.chainID}', '${ts}', '${r.source}', '${r.open}', '${r.close}', '${r.low}', '${r.high}', '${r.lp0}', '${r.lp1}', '${r.issuance}', '${r.token0Volume}', '${r.token1Volume}', '${state}')`
                            if (this.debugLevel >= paraTool.debugInfo) console.log(`LP update`, o)
                            if (this.validAsset(asset, this.chainID, assetInfo.assetType, o) && this.validDouble(r, assetInfo.assetType, o) && this.validDecimal(r, assetInfo.assetType, o)) {
                                assetlogLiquidityPairs.push(o);
                            }
                        }
                        if (assetInfo.isDualAssetTypeToken) {
                            let issuance = assetInfo.issuance;
                            if (isFullPeriod) {
                                let updIssuance = false
                                let updPrice = false
                                let r = {
                                    issuance: 0,
                                    price: 0,
                                    source: null,
                                };
                                if (assetInfo.issuance) {
                                    r.issuance = assetInfo.issuance;
                                    assetInfo.issuance = 0;
                                    updIssuance = true;
                                }
                                if (assetInfo.price) {
                                    r.price = assetInfo.price;
                                    updPrice = true;
                                }
                                //TODO: add metadata
                                if (updPrice) {
                                    let o2 = `('${asset}', '${this.chainID}', '${ts}', '${paraTool.assetSourceOracle}','${r.price}')`
                                    if (this.debugLevel >= paraTool.debugInfo) console.log(`[DualAssetTypeToken] paraTool.assetTypeToken[${paraTool.assetSourceOracle}] ${assetChain}`, o2)
                                    if (this.validAsset(asset, this.chainID, assetInfo.assetType, o2)) {
                                        assetlogTokensPrice.push(o2)
                                    }
                                }
                            }
                        }
                    }
                    break;
                case paraTool.assetTypeERC20LiquidityPair:
                    /*
                      let res = await this.processAssetTypeERC20LiquidityPair(web3Api, chainID, assetChain, ts, blockNumber, isFullPeriod)
                      if (res) {
                      assetlogLiquidityPairs.push(res)
                      }
                    */
                    break;
                case paraTool.assetTypeNFTToken: {
                    let sqlAssetKey = assetInfo.nftClass; // String eg {"NFTClass":3}
                    let tokenID = assetInfo.tokenID; // String eg {"NFTToken":0}
                    let holder = assetInfo.holder;
                    let tokenURI = assetInfo.tokenURI;
                    let free = assetInfo.free;
                    let meta = (assetInfo.metadata !== undefined) ? assetInfo.metadata : "";
                    let sql1 = `('${sqlAssetKey}', '${chainID}', '${tokenID}', '${holder}', FROM_UNIXTIME('${ts}'), '${blockNumber}', ${mysql.escape(meta)}, '${tokenURI}', '${free}')`;
                    if (this.validAsset(sqlAssetKey, chainID, assetInfo.assetType, sql1)) {
                        erc721tokens.push(sql1);
                    }
                }
                break;

                case paraTool.assetTypeNFT:
                    var sql = ''; //(asset, chainID, assetType, totalSupply, lastUpdateDT, lastUpdateBN, metadata, lastState, erc721isMetadata, erc721isEnumerable, tokenBaseURI)
                    if (assetInfo.metadata != undefined) {
                        //acala nft format unified with erc721
                        let deposit = assetInfo.deposit ? assetInfo.deposit : 0;
                        let sqlAssetKey = asset;
                        let creatorSql = (assetInfo.creator != undefined) ? `'${assetInfo.creator.toLowerCase()}'` : 'NULL';
                        let createdAtTxSql = (assetInfo.createdAtTx != undefined) ? `'${assetInfo.createdAtTx}'` : 'NULL';
                        let createDTSql = (assetInfo.createTS != undefined) ? `FROM_UNIXTIME('${assetInfo.createTS}')` : 'NULL'
                        let creator = (assetInfo.creator != undefined) ? assetInfo.creator.toLowerCase() : null;
                        let createdAtTx = (assetInfo.createdAtTx != undefined) ? assetInfo.createdAtTx : null;

                        let isEnumerable = (assetInfo.isEnumerable !== undefined && assetInfo.isEnumerable) ? 1 : 0;
                        let isMetadataSupported = (assetInfo.isMetadataSupported !== undefined && assetInfo.isMetadataSupported) ? 1 : 0;
                        let metadata = assetInfo.metadata;
                        let baseURI = (assetInfo.baseURI !== undefined) ? assetInfo.baseURI : "";
                        let ipfsUrl = (assetInfo.ipfsUrl !== undefined) ? assetInfo.ipfsUrl : "";
                        let imageUrl = (assetInfo.imageUrl !== undefined) ? assetInfo.imageUrl : "";
                        let totalSupply = ethTool.validate_bigint(assetInfo.totalIssuance);
                        // sql will continue using contract address as asset key
                        let sql = `('${sqlAssetKey}', '${chainID}', '${assetInfo.assetType}', Null, Null, '${totalSupply}', FROM_UNIXTIME('${ts}'), '${blockNumber}', Null , '${isMetadataSupported}', '${isEnumerable}', ${mysql.escape(baseURI)}, ${mysql.escape(ipfsUrl)}, ${mysql.escape(imageUrl)}, ${createDTSql}, ${creatorSql}, ${createdAtTxSql})`;
                        if (this.validAsset(sqlAssetKey, chainID, assetInfo.assetType, sql)) {
                            erc721classes.push(sql);
                        }
                    }
                    break;
                case paraTool.assetTypeERC721:
                    if (assetInfo.tokenAddress != undefined) {
                        let sql = '';
                        //erc721
                        let sqlAssetKey = assetInfo.tokenAddress.toLowerCase();
                        let creatorSql = (assetInfo.creator != undefined) ? `'${assetInfo.creator.toLowerCase()}'` : 'NULL';
                        let createdAtTxSql = (assetInfo.createdAtTx != undefined) ? `'${assetInfo.createdAtTx}'` : 'NULL';
                        let createDTSql = (assetInfo.createTS != undefined) ? `FROM_UNIXTIME('${assetInfo.createTS}')` : 'NULL'
                        let creator = (assetInfo.creator != undefined) ? assetInfo.creator.toLowerCase() : null;
                        let createdAtTx = (assetInfo.createdAtTx != undefined) ? assetInfo.createdAtTx : null;

                        let isEnumerable = (assetInfo.isEnumerable) ? 1 : 0
                        let isMetadataSupported = (assetInfo.isMetadataSupported) ? 1 : 0
                        let metadata = assetInfo.metadata
                        let baseURI = 'Null'
                        let ipfsUrl = 'Null'
                        let imageUrl = 'Null'
                        let totalSupply = ethTool.validate_bigint(assetInfo.totalSupply);
                        if (isMetadataSupported) {
                            if (metadata.baseURI != undefined) baseURI = `${metadata.baseURI}`
                            if (metadata.ipfsUrl != undefined) ipfsUrl = `${metadata.ipfsUrl}`
                            if (metadata.imageUrl != undefined) imageUrl = `${metadata.imageUrl}`
                        }
                        // sql will continue using contract address as asset key
                        if (isMetadataSupported) {
                            //(asset, chainID, assetType, assetName, symbol, totalSupply, lastUpdateDT, lastUpdateBN, metadata, erc721isMetadata, erc721isEnumerable, tokenBaseURI, ipfsUrl, imageUrl, createDT, creator, createdAtTx)
                            sql = `('${sqlAssetKey}', '${chainID}', '${assetInfo.tokenType}', ${mysql.escape(this.clip_string(metadata.name))}, ${mysql.escape(this.clip_string(metadata.symbol))}, '${totalSupply}', FROM_UNIXTIME('${ts}'), '${blockNumber}', ${mysql.escape(JSON.stringify(metadata))},  '${isMetadataSupported}', '${isEnumerable}', '${baseURI}', '${ipfsUrl}', '${imageUrl}', ${createDTSql}, ${creatorSql}, ${createdAtTxSql})`;
                        } else {
                            sql = `('${sqlAssetKey}', '${chainID}', '${assetInfo.tokenType}', Null, Null, '${totalSupply}', FROM_UNIXTIME('${ts}'), '${blockNumber}', Null , '${isMetadataSupported}', '${isEnumerable}', ${mysql.escape(baseURI)}, ${mysql.escape(ipfsUrl)}, ${mysql.escape(imageUrl)}, ${createDTSql}, ${creatorSql}, ${createdAtTxSql} )`;
                        }
                        if (this.validAsset(sqlAssetKey, chainID, assetInfo.assetType, sql)) {
                            erc721classes.push(sql);
                        }
                    }
                    break;
                case paraTool.assetTypeERC721Token: {
                    let sqlAssetKey = assetInfo.tokenAddress.toLowerCase();
                    let erc721TokenID = assetInfo.tokenID
                    let holder = assetInfo.owner
                    let tokenURI = assetInfo.tokenURI
                    let free = 0;
                    let meta = (assetInfo.metadata != undefined) ? JSON.stringify(assetInfo.metadata) : "";
                    let sql1 = `('${sqlAssetKey}', '${chainID}', '${erc721TokenID}', '${holder}', FROM_UNIXTIME('${ts}'), '${blockNumber}', ${mysql.escape(meta)}, '${tokenURI}', '${free}')`;
                    if (this.validAsset(sqlAssetKey, chainID, assetInfo.assetType, sql1)) {
                        erc721tokens.push(sql1);
                    }
                }
                break;
                case paraTool.assetTypeERC1155:
                    break;
                case paraTool.assetTypeERC1155Token:
                    break;
                case paraTool.assetTypeContract:
                //{"blockNumber":534657,"tokenAddress":"...","tokenType":"ERC20","name":"Stella LP","symbol":"STELLA LP","decimal":"18","totalSupply":142192.4834495356}
                {
                    let assetKey = assetInfo.tokenAddress.toLowerCase();
                    let creatorSql = (assetInfo.creator != undefined) ? `'${assetInfo.creator.toLowerCase()}'` : 'NULL';
                    let createdAtTxSql = (assetInfo.createdAtTx != undefined) ? `'${assetInfo.createdAtTx}'` : 'NULL';
                    let createDTSql = (assetInfo.createTS != undefined) ? `FROM_UNIXTIME('${assetInfo.createTS}')` : 'NULL'
                    let creator = (assetInfo.creator != undefined) ? assetInfo.creator.toLowerCase() : null;
                    let createdAtTx = (assetInfo.createdAtTx != undefined) ? assetInfo.createdAtTx : null;
                    let o = `('${assetKey}', '${chainID}', '${assetInfo.assetType}', FROM_UNIXTIME('${ts}'), '${blockNumber}', ${createDTSql}, ${creatorSql}, ${createdAtTxSql})`;
                    if (this.validAsset(assetKey, chainID, assetInfo.assetType, o)) {
                        contracts.push(o);
                    }
                }
                break;
                default:
                    console.log("TODO: flush - unknown assetType", assetInfo.assetType);
                    break;
            }
        }

        let sqlDebug = (this.debugLevel >= paraTool.debugVerbose) ? true : false
        // ---- asset: erc20s,
        await this.upsertSQL({
            "table": "asset",
            "keys": ["asset", "chainID"],
            "vals": ["assetType", "assetName", "symbol", "lastState", "decimals", "totalSupply", "lastUpdateDT", "lastUpdateBN", "createDT", "creator", "createdAtTx",
                "token0", "token1", "token0Decimals", "token1Decimals", "token0Supply", "token1Supply", "token0Symbol", "token1Symbol"
            ], // add currencyID
            "data": erc20s,
            "replace": ["assetType", "assetName", "symbol", "decimals", "token0", "token1", "token0Decimals", "token1Decimals", "token0Symbol", "token1Symbol"],
            "lastUpdateBN": ["lastUpdateBN", "lastUpdateDT", "totalSupply", "token0Supply", "token1Supply", "lastState"],
            "replaceIfNull": ["createDT", "creator", "createdAtTx"] // add currencyID
        }, sqlDebug);


        await this.upsertSQL({
            "table": "asset",
            "keys": ["asset", "chainID"],
            "vals": ["assetType", "totalSupply", "lastUpdateDT", "lastUpdateBN"], // add currencyID
            "data": tokens,
            "replaceIfNull": ["assetType"], // add currencyID
            "lastUpdateBN": ["lastUpdateBN", "lastUpdateDT", "totalSupply"]
        }, sqlDebug);

        await this.upsertSQL({
            "table": "asset",
            "keys": ["asset", "chainID"],
            "vals": ["assetType", "assetName", "symbol", "totalSupply", "lastUpdateDT", "lastUpdateBN", "metadata", "erc721isMetadata", "erc721isEnumerable", "tokenBaseURI", "ipfsUrl", "imageUrl", "createDT", "creator", "createdAtTx"],
            "data": erc721classes,
            "replace": ["assetType", "assetName", "symbol", "erc721isMetadata", "erc721isMetadata"],
            "lastUpdateBN": ["totalSupply", "lastUpdateBN", "lastUpdateDT", "metadata", "tokenBaseURI", "ipfsUrl", "imageUrl"],
            "replaceIfNull": ["createDT", "creator", "createdAtTx"]
        }, sqlDebug);
        await this.upsertSQL({
            "table": "asset",
            "keys": ["asset", "chainID"],
            "vals": ["assetType", "lastUpdateDT", "lastUpdateBN", "createDT", "creator", "createdAtTx"],
            "data": contracts,
            "lastUpdateBN": ["lastUpdateBN", "lastUpdateDT"],
            "replace": ["assetType"],
            "replaceIfNull": ["createDT", "creator", "createdAtTx"]
        }, sqlDebug);
        // TODO: need new case for loans here to set asset for acala/parallel ... but how are they getting into "asset" now?

        // ---- assetlog
        await this.upsertSQL({
            "table": "assetlog",
            "keys": ["asset", "chainID", "indexTS", "source"],
            "vals": ["issuance"],
            "data": assetlogTokensIssuance,
            "replace": ["issuance"]
        })

        await this.upsertSQL({
            "table": "assetlog",
            "keys": ["asset", "chainID", "indexTS", "source"],
            "vals": ["priceUSD"],
            "data": assetlogTokensPrice,
            "replace": ["priceUSD"]
        })

        await this.upsertSQL({
            "table": "assetlog",
            "keys": ["asset", "chainID", "indexTS", "source"],
            "vals": ["open", "close", "low", "high", "lp0", "lp1", "issuance", "token0Volume", "token1Volume", "state"],
            "data": assetlogLiquidityPairs,
            "replace": ["open", "close", "low", "high", "lp0", "lp1", "issuance", "token0Volume", "token1Volume", "state"]
        }, sqlDebug)

        await this.upsertSQL({
            "table": "assetlog",
            "keys": ["asset", "chainID", "indexTS", "source"],
            "vals": ["issuance", "debitExchangeRate"],
            "data": assetlogLoans,
            "replace": ["issuance", "debitExchangeRate"]
        }, sqlDebug)

        await this.upsertSQL({
            "table": "assetlog",
            "keys": ["asset", "chainID", "indexTS", "source"],
            "vals": ["supplyExchangeRate", "borrowExchangeRate"],
            "data": assetlogCDPs,
            "replace": ["supplyExchangeRate", "borrowExchangeRate"]
        })

        // --- tokenholder
        await this.upsertSQL({
            "table": "tokenholder",
            "keys": ["asset", "chainID", "tokenID"],
            "vals": ["holder", "lastUpdateDT", "lastUpdateBN", "meta", "tokenURI", "free"],
            "data": erc721tokens,
            "lastUpdateBN": ["holder", "free", "meta", "tokenURI", "lastUpdateBN", "lastUpdateDT"]
        }, sqlDebug)

    }

/*if ( chain.features && chain.features.includes("evmtraces") ) {
		// evm traces only available
		let hexBlockNumber = "TODO";
		let cmd = `curl ${chain.evmRPC}  -X POST -H "Content-Type: application/json" --data '{"method":"debug_traceBlockByNumber","params":["${hexBlocknumber}", {"tracer": "callTracer"}],"id":1,"jsonrpc":"2.0"}'`
		const {
                    stdout,
                    stderr
		} = await exec(cmd, {
                    maxBuffer: 1024 * 64000
		});
		let traceData = JSON.parse(stdout);
		if (traceData.result) {
                    console.log(blockNumber, traceData.result.length, cmd);
                    evmTrace = traceData.result;
		}
	    }*/
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


        if (this.readyToCrawlParachains && (chainID == 0) ) {
            await this.crawl_parachains(chainID);
        }
        if (bn % 7200 == 0) { 
            await this.crawlParachains();
            try {
                await this.setup_chainParser(chain, paraTool.debugNoLog, true);
            } catch (e1) {}
	    
        }

        
