#!/usr/bin/env node
 // Usage:  getAccount chainID
const Query = require("../query");

async function main() {
    let debugLevel = 0
    var query = new Query(debugLevel);
    await query.init();

    let txHash = "0x02e86275ad0f6129077b557042aca2fea5fad97c02fa75230ad17e08fd2b2eec";
    process.argv.forEach(function(val, index, array) {
        if (index == 2 && val.length > 0) {
            txHash = val;
        }
    });
    var a = await query.getTransaction(txHash);
    console.log(JSON.stringify(a));
}

main()
    .then(() => process.exit(0))
    .catch((e) => {
        console.error('ERROR', e);
        process.exit(1);
    });