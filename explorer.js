#!/usr/bin/env node
// Usage: node explorer.js tomlFN zombieNetPath
var ZombieNetExplorer = require('./substrate/zombienetexplorer.js');

async function main() {
    let explorer = new ZombieNetExplorer();
    let tomlFN = "multi-parachains.toml";
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
