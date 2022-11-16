var initchains = false;
var chainsTable = null;
var refreshIntervalMS = 6100;
var chainsUpdateIntervalId = false;

function stopchains() {
    if (chainsUpdateIntervalId) {
        clearInterval(chainsUpdateIntervalId);
        chainsUpdateIntervalId = false
    }
}

function showchains() {
    if (!chainsUpdateIntervalId) {
        show_chains();
    }
    chainsUpdateIntervalId = setInterval(function() {
        show_chains()
    }, refreshIntervalMS);
}

function get_accountBalanceOnChain(chainID, assetChain) {
    try {
        let balanceUSD = 0;
        for (let a = 0; a < accounts.length; a++) {
            let account = accounts[a];
            if (account.chains) {
                for (let i = 0; i < account.chains.length; i++) {
                    let c = account.chains[i];
                    if (c.chainID == chainID) {
                        for (let j = 0; j < c.assets.length; j++) {
                            let a = c.assets[j];
                            if (a.state.balanceUSD > 0) {
                                //console.log(a);
                                balanceUSD += a.state.balanceUSD;
                            }
                        }
                    }
                }
            }
        }
        return balanceUSD;
    } catch (err) {
        console.log(err);
    }
    return 0;
}

async function show_chains() {
    let pathParams = 'chains'
    let tableName = '#tablechains'
    if (initchains) {
        // if table is already initiated, update the rows
        //loadData2(pathParams, tableName, true)
    } else {
        initchains = true;
        chainsTable = $(tableName).DataTable({
            /*
            [0] id
            [1] blocksCovered
            [2] blocksFinalized
            [3] numSignedExtrinsics
            [4] numXCMTransfersIn
            [5] numXCMTransfersOut
            [6] relayChain
            */
            pageLength: -1,
            lengthMenu: [
                [10, 25, 50, -1],
                [10, 25, 50, "All"]
            ],
            columnDefs: [{
                "className": "dt-right",
                "targets": [2, 3, 4]
            }],
            order: [
                [2, "desc"],
            ],
            columns: [{
                data: 'chainName',
                render: function(data, type, row, meta) {
                    if (type == 'display') {
                        let links = [];
                        return presentChain(row.id, row.chainName, row.iconUrl, row.crawlingStatus) + `<div class="explorer">` + links.join(" | ") + `</div>`
                    }
                    return row.chainName;
                }
            }, {
                data: 'id',
                render: function(data, type, row, meta) {
                    if (type == 'display') {
                        try {
                            console.log(row)
                        } catch {

                            return "-"
                        }
                    }
                    return data;
                }
            }, {
                data: 'WSEndpoint',
                render: function(data, type, row, meta) {
                    if (type == 'display') {
                        try {
                            return presentWSEndpoint(row.WSEndpoint);
                        } catch {
                            return "-"
                        }
                    }
                    return data;
                }
            }, {
                data: 'blocksCovered',
                render: function(data, type, row, meta) {
                    if (type == 'display') {
                        try {
                            let s = "<BR>" + presentTS(row.lastCrawlTS);
                            return presentBlockNumber(row.id, "", row.blocksCovered) + s;
                        } catch {
                            return "-"
                        }
                    }
                    return data;
                }
            }, {
                data: 'blocksFinalized',
                render: function(data, type, row, meta) {
                    if (type == 'display') {
                        try {
                            let s = "<BR>" + presentTS(row.lastFinalizedTS);
                            return presentBlockNumber(row.id, "", row.blocksFinalized) + s;
                        } catch {
                            return "-"
                        }
                    }
                    return data;
                }
            }]
        });
    }

    $(tableName).on('page.dt', function() {
        stopchains();
    });

    //load data here: warning this function is technically async
    //load data here: warning this function is technically async
    await loadData2(pathParams, tableName, false)
}
