function showaccounttab(hash, chainListStr = 'all') {
    console.log("showaccounttab", hash);
    switch (hash) {
        case "#overview":
            setupapidocs("account", "", address, chainListStr);
            break;
        case "#extrinsics":
            showextrinsics(address, chainListStr);
            setupapidocs("account", "extrinsics", address, chainListStr);
            break;
        case "#evmtxs":
            showevmtxs(address, chainListStr);
            setupapidocs("account", "evmtxs", address, chainListStr);
            break;
        case "#transfers":
            showtransfers(address, chainListStr);
            setupapidocs("account", "transfers", address, chainListStr);
            break;
        case "#history":
            showhistory(address, chainListStr);
            setupapidocs("account", "history", address, chainListStr);
            break;
        case "#rewards":
            showrewards(address, chainListStr);
            setupapidocs("account", "rewards", address, chainListStr);
            break;
        case "#crowdloans":
            showcrowdloans(address, chainListStr);
            setupapidocs("account", "crowdloans", address, chainListStr);
            break;
        case "#xcmtransfers":
            showxcmtransfers(address, chainListStr);
            setupapidocs("account", "xcmtransfers", address, chainListStr);
            break;
        case "#ss58h160":
            showss58h160(address, chainListStr);
            setupapidocs("account", "ss58h160", address);
            break;
        case "#offers":
            showoffers(address, chainListStr);
            setupapidocs("account", "offers", address);
            break;
        case "#related":
            showrelated(address, chainListStr);
            setupapidocs("account", "related", address);
            break;
        case "#feed":
            showfeed(address, chainListStr);
            setupapidocs("account", "feed", address, chainListStr);
            break;
        default:
            showextrinsics(address, chainListStr);
            setupapidocs("account", "extrinsics", address, chainListStr);
    }
}

function setuptabs(tabs, address, requestedChainAddress, chainListStr = 'all', isEVM = 0) {
    if (chainListStr == '') chainListStr = 'all'
    console.log(`setuptabs chainListStr=${chainListStr}`)
    for (let i = 0; i < tabs.length; i++) {
        let t = tabs[i];
        let id = "#" + t.target + "-tab";
        let tabEl = document.querySelector(id);
        tabEl.addEventListener('shown.mdb.tab', function(event) {
            const hash = $(this).attr("href");
            let view = isEVM ? 'address' : 'account';
            let newUrl = `/${view}/` + requestedChainAddress + `?group=${t.target}&chainfilters=${chainListStr}`
            console.log("shown.mdb.tab", hash, newUrl);
            setTimeout(() => {
                showaccounttab(hash, chainListStr);
            }, 250);
            history.replaceState(null, null, newUrl);
        })
    }
    let url = location.href.replace(/\/$/, "");
    let hash = isEVM ? "#evmtxs" : "#overview";
    if (location.hash) {
        const urlhash = url.split("#");
        if (urlhash.length > 1) hash = "#" + urlhash[1];
    }
    const triggerEl = document.querySelector('#accountTab a[href="' + hash + '"]');
    //console.log("CAUSE shownmdb.tab for", triggerEl, hash);
    if (triggerEl) mdb.Tab.getInstance(triggerEl).show();
    if (isEVM == 0) {
        initTabs(address, chainListStr); //preemptively show the first page of every group
    }
}

function show_unfinalized(address) {
    let pathParams = `account/${address}?group=unfinalized`
    let endpoints = `${baseURL}/${pathParams}`
    let tableName = '#unfinalized'

    var req = new Request(endpoints, {
        method: 'GET',
        headers: new Headers({
            "Accept": "application/json; odata=verbose",
        })
    });
    fetch(req)
        .then((response) => response.json())
        .then((data) => {
            if (Array.isArray(data)) {
                let out = [];
                for (let i = 0; i < data.length; i++) {
                    let row = data[i];
                    let id = row.id
                    let e = presentExtrinsic(id, row.section, row.method)
                    let currentTS = Math.floor(Date.now() / 1000);
                    let secondsAgo = currentTS - row.ts;
                    let tsStr = presentTS(row.ts)
                    if ((row.finalized > 0) && (currentTS - row.ts < 3600)) {
                        let s = presentExtrinsicIDHash(row.extrinsicID, row.extrinsicHash)
                        let str = `<table><tr><td width="250">${e}</td><td width="250" style='padding:10px'>${presentChain(id, row.chainName)} ${s}</td><td><B>Finalized</B></td><td> ${tsStr}</td></tr></table>`
                        out.push('<div class="alert alert-info">' + str + '</div>');
                    } else if (row.finalized == 0 && (currentTS - row.ts < 3600)) {
                        let s = presentTxHash(row.extrinsicHash)
                        let str = `<table><tr><td width="250">${e}</td><td width="205" style='padding:10px'>${presentChain(id, row.chainName)} ${s}</td><td><B>Unfinalized</B></td><td> ${tsStr} </td></tr></table>`
                        out.push('<div class="alert alert-warning">' + str + '</div>');
                    }
                    if (out.length >= 5) {
                        i = data.length;
                    }
                }
                if (out.length > 0) {
                    document.getElementById('unfinalized').innerHTML = "<h5>Last 5 Unfinalized / Recently Finalized Extrinsics (last 1 hr)</h5>" + out.join("");
                }
            }
        })
}



function initTabs(address, chainListStr = 'all', isEVM = 0) {
    showunfinalized(address, chainListStr)
    if (isEVM == 1) {
        showevmtxs(address, chainListStr);
    } else {
        //showextrinsics(address, chainListStr);
        //showtransfers(address, chainListStr);
        //showxcmtransfers(address, chainListStr);
        //showrewards(address, chainListStr);
        //showcrowdloans(address, chainListStr);
        //showss58h160(address, chainListStr);
        //showrelated(address, chainListStr);
    }
}
var refreshIntervalMS = 6100;
var unfinalizedUpdateIntervalId = false;

function showunfinalized(address) {
    if (!unfinalizedUpdateIntervalId) {
        show_unfinalized(address);
    }
    unfinalizedUpdateIntervalId = setInterval(function() {
        show_unfinalized(address)
    }, refreshIntervalMS);
}

function submitSuggestion(address, nickname, submitter, addressType) {
    let endpoint = `${baseURL}/suggest/${address}`
    let data = {
        nickname,
        submitter,
        addressType
    }
    var req = new Request(endpoint, {
        method: 'POST',
        headers: new Headers({
            "Content-Type": "application/json"
        }),
        body: JSON.stringify(data)
    });

    try {
        console.log("submitSuggestion", endpoint, data)
        $('#suggestModal').modal('hide');
        // TODO: address cross-domain
        fetch(req)
            .then((response) => {
                console.log(response);
                if (response.status == 200) {
                    launchToast("Thank you!  If your suggestion is verified as reasonable it will appear within 24 hrs");
                } else {
                    launchToast("An error has occurred.");
                }
            })
    } catch (err) {
        console.log(err);
    }

}


$('#submitSuggestion').on('click', function(e) {
    let nickname = document.getElementById("nickname").value;
    let submitter = document.getElementById("submitter").value;
    let addressType = document.getElementById("addressType").value;
    submitSuggestion(address, nickname, submitter, addressType);
});

$('#chainIDfilter').on('change', function() {
    var selectedValues = $('#chainIDfilter').val();
    let filter = "(" + selectedValues.join("|") + ")";
    if (tableExtrinsics) tableExtrinsics.columns(5).search(filter, true).draw();
    if (tableTransfers) tableTransfers.columns(7).search(filter, true).draw();
    if (tableRewards) tableRewards.columns(7).search(filter, true).draw();
    if (tableFeed) tableFeed.columns(6).search(filter, true).draw();
    if (tableXCMTransfers) tableXCMTransfers.search(filter, true).draw();
});

setuptabs(tabs, address, requestedChainAddress, chainListStr, isEVM);