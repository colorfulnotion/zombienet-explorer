const ethers = require('ethers');
const {
    ApiPromise,
    WsProvider,
    Keyring
} = require("@polkadot/api");
const {
    decodeAddress,
    encodeAddress
} = require("@polkadot/keyring");
const {
    u8aToHex,
    hexToBn,
    hexToU8a,
} = require('@polkadot/util');
const {
    evmToAddress,
    addressToEvm
} = require('@polkadot/util-crypto');
const Web3 = require("web3");
const web3 = new Web3();

const fs = require('fs');

const keyring = new Keyring({
    type: "sr25519",
    ss58Format: 2
});

function toHex(bytes) {
    return (
        "0x" +
        bytes.reduce((str, byte) => str + byte.toString(16).padStart(2, "0"), "")
    );
}
class XCMClient {
    providerRPCs = {
        collator1: {
            name: 'shibuya1',
            WSEndpoint: "wss://shiden-internal.polkaholic.io:6945", // Substrate
            rpc: 'http://shiden-internal.polkaholic.io:8545',
            chainId: 81,
            SS58Prefix: 5
        },
        collator2: {
            name: 'shibuya2',
            WSEndpoint: "wss://shiden-internal.polkaholic.io:6946", // Substrate
            rpc: 'http://shiden-internal.polkaholic.io:8546', // EVM RPC
            chainId: 81,
            SS58Prefix: 5
        },
    }
    providers = {};
    apis = {};
    address = {};
    wallet = {};

    // holds keyring / evm wallet keys
    pair = null;
    evmpair = null

    async init() {
        await cryptoWaitReady()
    }

    getSudoDev(sudo, id) {
        const keyring = new Keyring({
            type: 'sr25519'
        });
        let ss58Prefix = 5 // TODO: get from RPCprovider list
        keyring.setSS58Format(ss58Prefix);
        return keyring.createFromUri(sudo);
    }

    getEVMWallet(id) {
        var raw = fs.readFileSync("/root/.walletevm2", 'utf8');
        raw = raw.trim();
        let wallet = new ethers.Wallet(raw, this.providers[id]);
        return wallet;
    }

    async setupProvider(id) {
        let providerRPC = this.providerRPCs[id]
        // setup EVM connection
        this.providers[id] = new ethers.providers.StaticJsonRpcProvider(providerRPC.rpc, {
            chainId: providerRPC.chainId,
            name: providerRPC.name,
        });

        // setup Substrate api connection
        let WSEndpoint = providerRPC.WSEndpoint
        var api = await ApiPromise.create({
            provider: new WsProvider(WSEndpoint)
        });
        await api.isReady;
        this.apis[id] = api
    }

    async sendDev(sudo = "//Alice", addressTo = "WhPMw3gxuF6amuTnpYR6N3oaWgwZwia6y9TCSxE9UwNyAbN", id = "collator1", amount = "250000000000000000") {
        let sudodev = this.getSudoDev(sudo, id);
        console.log("sending from", sudodev.address, "to:", addressTo);

        const txHash = await this.apis[id].tx.balances
              .transfer(addressTo, amount)
            .signAndSend(sudodev);
        console.log(txHash.toString());
    }

    async balancesSS58(addresses, provider) {
        for (const k of Object.keys(addresses)) {
	    let address = addresses[k];
            let x = await this.apis[provider].query.system.account(address);
            let balances = x.toHuman();
            console.log(`balancesSS58 on ${provider}: ${k} @ ${address} ==> `, balances.data.free);
        }
    }

    async balancesEVM(addresses, id = "collator1") {
        for (const k of Object.keys(addresses)) {
	    let address = addresses[k];
            const balance = ethers.utils.formatEther(await this.providers[id].getBalance(address));
            console.log(`balancesEVM on ${id}: ${k} @ ${address} ==>  ${balance}`);
        }
    }

    async sendEVM(from, addressTo = "", amount = "1") {
        console.log(`Attempting to send transaction from ${wallet.address} to ${addressTo}`);

        const tx = {
            to: addressTo,
            value: ethers.utils.parseEther(amount),
        };

        const createReceipt = await wallet.sendTransaction(tx);
        await createReceipt.wait();
        console.log(`Transaction successful with hash: ${createReceipt.hash}`);
    }

    async deployFlipper(id) {
        const contractFile = require('./flipper');

        const abi = contractFile.abi;
        const bytecode = contractFile.evm.bytecode.object;

        let wallet = this.getEVMWallet(id)
        const flipper = new ethers.ContractFactory(abi, bytecode, wallet);

        const contract = await flipper.deploy([false])
        console.log(`Attempting to deploy contract on ${id}`, contract)
        await contract.deployed();
        console.log(`Contract deployed at address: ${contract.address} on ${id}`);
        return contract.address;
    }

    async getflipcount(contractAddress, id) {
        const {
            abi
        } = require('./flipper');
        console.log(`Making a call to contract at address: ${contractAddress}`);
        const flipper = new ethers.Contract(contractAddress, abi, this.providers[id]);
        const data = await flipper.getCounter();
        const data2 = await flipper.get();
        console.log(`READ Flipper Contract on ${id} -- getCounter() => ${data} |  get() ==> ${data2}`);
    }

    async flip(contractAddress, id) {
        const {
            abi
        } = require('./flipper');
        let wallet = this.getEVMWallet(id)
        const flipper = new ethers.Contract(contractAddress, abi, wallet);
        console.log(`Calling the flip function on ${id} at address: ${contractAddress}`);
        const createReceipt = await flipper.flip();
        await createReceipt.wait();
        console.log(`flip Tx successful on ${id} with hash: ${createReceipt.hash}`);
    }

    get_encoded_ethereum_transact(api, source, contract, input, gasLimit = 600000, maxFeePerGas = 20000000, maxPriorityFeePerGas = 20000000) {
        const internaltx = api.tx.evm.call(source, contract, input, 0, gasLimit, maxFeePerGas, maxPriorityFeePerGas, null, [])
        let encodedCall = internaltx.toHex();
        encodedCall = "0x" + encodedCall.substring(8) // why?
        return encodedCall;
    }

    async remote_transact(id, parachain_id, is_relay, payment_asset_id, payment_amount, call, transact_weight) {
        let abi = [{
            "inputs": [{
                "internalType": "uint256",
                "name": "parachain_id",
                "type": "uint256"
            }, {
                "internalType": "bool",
                "name": "is_relay",
                "type": "bool"
            }, {
                "internalType": "address",
                "name": "payment_asset_id",
                "type": "address"
            }, {
                "internalType": "uint256",
                "name": "payment_amount",
                "type": "uint256"
            }, {
                "internalType": "bytes",
                "name": "call",
                "type": "bytes"
            }, {
                "internalType": "uint64",
                "name": "transact_weight",
                "type": "uint64"
            }],
            "name": "remote_transact",
            "outputs": [{
                "internalType": "bool",
                "name": "",
                "type": "bool"
            }],
            "stateMutability": "nonpayable",
            "type": "function"
        }]

        let wallet = this.getEVMWallet(id)
        let systemContractAddress = "0x0000000000000000000000000000000000005004";
        const systemcontract = new ethers.Contract(systemContractAddress, abi, wallet);
        console.log(`Calling ${systemContractAddress} remote_transact on ${id}:`);
        const createReceipt = await systemcontract.remote_transact(parachain_id, is_relay, payment_asset_id, payment_amount, call, transact_weight, {
            gasLimit: 600000
        });
        await createReceipt.wait();
        console.log(`remote_transact Tx on ${id} successful with hash: ${createReceipt.hash}`);
    }

    async registerAssetLocation(assetLocation, assetId, sudo = "//Alice", id) {
        let sudodev = this.getSudoDev(sudo, id)
        const txHash = await this.apis[id].tx.xcAssetConfig.registerAssetLocation(assetLocation, assetId)
            .signAndSend(sudodev);
        console.log(txHash.toString());
    }

    async setAssetUnitsPerSecond(assetLocation, unitsPerSecond, sudo = "//Alice", id) {
        let sudodev = this.getSudoDev(sudo, id)
        const txHash = await this.apis[id].tx.xcAssetConfig.setAssetUnitsPerSecond(assetLocation, unitsPerSecond)
            .signAndSend(sudodev);
        console.log(txHash.toString());
    }
    
    // { "parents": 1, "interior": { "X1": [{ "Parachain": 1000 }]}}
    make_multilocation(paraID = null, address = null, namedNetwork = 'Any') {
        const ethAddress = address.length === 42;
        const named = (namedNetwork != 'Any') ? {
            Named: namedNetwork
        } : namedNetwork;
        const account = ethAddress ? {
            AccountKey20: {
                network: named,
                key: address
            }
        } : {
            AccountId32: {
                network: named,
                id: u8aToHex(decodeAddress(address))
            }
        };
        // make a multilocation object
        let interior = {
            here: null
        }
        if (paraID && account) {
            interior = {
                X2: [{
                    Parachain: paraID
                }, account]
            }
        } else if (paraID) {
            interior = {
                X1: {
                    Parachain: paraID
                }
            }
        } else if (account) {
            interior = {
                X1: account
            }
        }
        return {
            parents: 1,
            interior: interior
        }
    }


    // Converts a given MultiLocation into a 20/32 byte accountID by hashing with blake2_256 and taking the first 20/32 bytes
    // https://github.com/paritytech/polkadot/blob/master/xcm/xcm-builder/src/location_conversion.rs#L25
    // Ok(("multiloc", location.borrow()).using_encoded(blake2_256).into())
    calculateMultilocationDerivative(api, paraID = null, address = null, namedNetwork = 'Any') {
        let multilocationStruct = this.make_multilocation(paraID, address, namedNetwork)
        const multilocation = api.createType('XcmV1MultiLocation', multilocationStruct)
        const toHash = new Uint8Array([
            ...new Uint8Array([32]),
            ...new TextEncoder().encode('multiloc'),
            ...multilocation.toU8a(),
        ]);

        const DescendOriginAddress20 = u8aToHex(api.registry.hash(toHash).slice(0, 20));
        const DescendOriginAddress32 = u8aToHex(api.registry.hash(toHash).slice(0, 32));

        //console.log("calculateMultilocationDerivative", multilocation.toString(), DescendOriginAddress20, DescendOriginAddress32);
        // multilocation {"parents":1,"interior":{"x2":[{"parachain":1000},{"accountKey20":{"network":{"any":null},"key":"0x44236223ab4291b93eed10e4b511b37a398dee55"}}]}}
        // 20 byte: 0x5c27c4bb7047083420eddff9cddac4a0a120b45c
        // 32 byte: 0x5c27c4bb7047083420eddff9cddac4a0a120b45cdfa7831175e442b8f14391aa
        return [DescendOriginAddress20, DescendOriginAddress32]
    }

    // Converts a given MultiLocation into a 20/32 byte accountID by hashing with blake2_256 and taking the first 20/32 bytes
    calculateMultilocationDerivativeSubstrate(api, paraID = null, address = null, namedNetwork = 'Any') {
	let [DescendOriginAddress20, DescendOriginAddress32] = this.calculateMultilocationDerivative(api, paraID, address, namedNetwork);
	let ss58Address = keyring.encodeAddress( DescendOriginAddress32, 42);
	return [ss58Address, DescendOriginAddress32];
    }
    
    getPubKey(ss58Addr) {
	try {
            if (
		web3.utils.isHex(ss58Addr) &&
		    ss58Addr.substr(0, 2).toLowerCase() != "0x"
            ) {
		var paddedPubkey = "0x" + ss58Addr;
		return toHex(keyring.decodeAddress(paddedPubkey));
            } else {
		return toHex(keyring.decodeAddress(ss58Addr));
            }
	} catch (e) {
            return (false);
	}
    }

    async test(op) {
        let id = "collator1"; // 2000
        let id2 = "collator2"; // 2007
        await this.setupProvider(id);
        await this.setupProvider(id2);
        let api = this.apis[id];
        let sudoAlice = "//Alice";
        let ss58Alice = "ajYMsCKsEAhEvHpeA4XqsfiA9v1CdzZPrCfS6pEfeGHW9j8"
        let coreEVMAddress = "0xDcB4651B5BbD105CDa8d3bA5740b6C4f02b9256D";
        let coress58Address = evmToAddress(coreEVMAddress); // sending from Alice to this ss58 address funds the coreEVMAddress (WhPMw3gxuF6amuTnpYR6N3oaWgwZwia6y9TCSxE9UwNyAbN)
	let coress58AddressPubkey = this.getPubKey(coress58Address);
	//console.log(coress58AddressPubkey);

	
	//console.log(this.calculateMultilocationDerivative(api, 2000, coreEVMAddress));
	//console.log(this.calculateMultilocationDerivative(api, 2000, coress58AddressPubkey));
	//console.log(keyring.encodeAddress("0x219fdc1b21546616a6b76da5bc6132214c32eab1955b1ea7fc6efe1100bb532e", 42))

	//# target/release/xcm-tools account32-hash -p 2000 -a 0x2c8feeab5bd9a317375e01adb6cb959f1fea78c751936d556fa2e36ede425a47 ==> 5Hifgke6SApX4MuYrr4uAPTkbPRJGpq8SDXfaWnNFTtMQypr
	let [_, derivedpubkey_2000] = this.calculateMultilocationDerivative(api, 2000, coress58AddressPubkey) 
	let derivedss58_2000 = keyring.encodeAddress( derivedpubkey_2000, 5);

	//# target/release/xcm-tools account32-hash -p 2007 -a 0x2c8feeab5bd9a317375e01adb6cb959f1fea78c751936d556fa2e36ede425a47 ==> 5CstZ7mHQRy1eUcmxY3EdMZaRXiHNURt5wM191VZ7CeK5ZHL
	let [__, derivedpubkey_2007] = this.calculateMultilocationDerivative(api, 2007, coress58AddressPubkey) 
	let derivedss58_2007 = keyring.encodeAddress( derivedpubkey_2007, 5);
	// calculateMultilocationDerivative 2000: 5Hifgke6SApX4MuYrr4uAPTkbPRJGpq8SDXfaWnNFTtMQypr 2007: 5CstZ7mHQRy1eUcmxY3EdMZaRXiHNURt5wM191VZ7CeK5ZHL
	console.log(keyring.encodeAddress("0x219fdc1b21546616a6b76da5bc6132214c32eab1955b1ea7fc6efe1100bb532e", 5))
	//console.log("XXX", derivedss58_2000, derivedss58_2007);

	// map derived SS58 address to an H160 address by using addressToEvm
	let derivedevm_2000 = u8aToHex(addressToEvm(derivedss58_2000))
	let derivedevm_2007 = u8aToHex(addressToEvm(derivedss58_2007))
	let derivedevm_2000_ss58 = evmToAddress(derivedevm_2000);
	let derivedevm_2007_ss58 = evmToAddress(derivedevm_2007);

	// Funding derivative accounts:  
	// for 2000=>2007 we either have to fund: derivedss58_2000 (on substrate side) or derivedevm_2000 (on evm side) on 2007 with 2007 SBY
	// for 2007=>2000 we either have to fund: derivedss58_2007 (on substrate side) or derivedevm_2007 (on evm side) on 2000 with 2000 SBY
	// assert(derivedss58_2000 == "5Hifgke6SApX4MuYrr4uAPTkbPRJGpq8SDXfaWnNFTtMQypr");
	// assert(derivedss58_2007 == "5CstZ7mHQRy1eUcmxY3EdMZaRXiHNURt5wM191VZ7CeK5ZHL");
	
        // replace these based on deployFlipper(id) -- this will be the  2007->2000 remote execution
        let contractAddress2000 = "0xdb49e85E263614520115e14Dbb3CFc85967ffc69"
        // replace these based on deployFlipper(id2) --  this will be the 2000->2007 remote execution
        let contractAddress2007 = "0xdb49e85E263614520115e14Dbb3CFc85967ffc69"
        let input = "0xcde4efa9" // flip method

        console.log("coreEVMAddress:", coreEVMAddress, "coress58Address:", coress58Address, "(to use coreEVMAddress, send funds to coress58Address)")
        console.log("derivedevm_2000:", derivedevm_2000, "derivedevm_2000_ss58:", derivedevm_2000_ss58, "derivedss58_2000:", derivedss58_2000,  " (for remote execution initiated on 2000, send funds on 2007 to derivedevm_2000 / derivedss58_2000)");
        console.log("derivedevm_2007:", derivedevm_2007, "derivedevm_2007_ss58:", derivedevm_2007_ss58, "derivedss58_2007:", derivedss58_2007,  " (for remote execution initiated on 2007, send funds on 2000 to derivedevm_2007 / derivedss58_2007)");

	console.log("PUBKEYS", this.getPubKey(derivedevm_2000_ss58))
	console.log("PUBKEYS", this.getPubKey(derivedevm_2007_ss58))
	console.log("PUBKEYS", this.getPubKey(derivedss58_2000))
	console.log("PUBKEYS", this.getPubKey(derivedss58_2007))
        console.log("contractAddress2000:", contractAddress2000, "contractAddress2007:", contractAddress2007);
/*
coreEVMAddress: 0xDcB4651B5BbD105CDa8d3bA5740b6C4f02b9256D coress58Address: 5Cpnve5cBfbzMwsdJX6J4htXVTypbj1q5meJxjkNH7wRPAWH (to use coreEVMAddress, send funds to coress58Address)
derivedevm_2000: 0xfa212f3dca411007e9ad4bdba485638783bbae30 derivedss58_2000: 5Hifgke6SApX4MuYrr4uAPTkbPRJGpq8SDXfaWnNFTtMQypr  (for remote execution initiated on 2000, send funds on 2007 to derivedevm_2000 / derivedss58_2000)
derivedevm_2007: 0x23fc8b6d12a3ac3e3f85e7d74cc9b04ee598f32f derivedss58_2007: 5CstZ7mHQRy1eUcmxY3EdMZaRXiHNURt5wM191VZ7CeK5ZHL  (for remote execution initiated on 2007, send funds on 2000 to derivedevm_2007 / derivedss58_2007)
contractAddress2000: 0xdb49e85E263614520115e14Dbb3CFc85967ffc69 contractAddress2007: 0xdb49e85E263614520115e14Dbb3CFc85967ffc69
*/
        let unitsPerSecond = "10000000";
        switch (op) {
        case "checkbalances":
            // show balances on both parachains
            let ss58AddressList = {ss58Alice, coress58Address, derivedss58_2000, derivedss58_2007, derivedevm_2000_ss58, derivedevm_2007_ss58};
            let evmAddressList = {coreEVMAddress, derivedevm_2000, derivedevm_2007};
            await this.balancesSS58(ss58AddressList, id);
            await this.balancesSS58(ss58AddressList, id2);
            await this.balancesEVM(evmAddressList, id);
            await this.balancesEVM(evmAddressList, id2);
            break;
        case "fundaccounts":
            // Send funds to the evmAddress("0xDcB4651B5BbD105CDa8d3bA5740b6C4f02b9256D") on both chains, which will enable local execution
            await this.sendDev(sudoAlice, coress58Address, id, "250000000000000000"); // enables flip on 2000 by coreEVMAddress
            await this.sendDev(sudoAlice, coress58Address, id2, "251000000000000000"); // enables flip on 2007 by coreEVMAddress
            break;
        case "fundderivatives2000":
            // send to derivedss58_2007 (origin: 2007) on 2000 to support "remoteexecution2007=>2000"
            await this.sendDev(sudoAlice, derivedss58_2007, id, "100000000000000000");
            break;
        case "fundderivatives2007":
            // send to the derivative ss58 addresses (origin: 2000) on 2007 to support "remoteexecution2000=>2007"
            await this.sendDev(sudoAlice, derivedss58_2000, id2, "101000000000000000");
            break;
	case "fundevmderivatives2000":
            await this.sendDev(sudoAlice, derivedevm_2007_ss58, id, "102000000000000000");
	    break;
	case "fundevmderivatives2007":
            await this.sendDev(sudoAlice, derivedevm_2000_ss58, id2, "103000000000000000");
	    break;
        case "deploycontracts":
            contractAddress2000 = await this.deployFlipper(id);
            contractAddress2007 = await this.deployFlipper(id2);
            break;
        case "testlocalcontract2000":
            // test flip on 2000
            await this.getflipcount(contractAddress2000, id);
            await this.flip(contractAddress2000, id);
            break;
        case "testlocalcontract2007":
            // test flip on 2007
            await this.getflipcount(contractAddress2007, id2);
            await this.flip(contractAddress2007, id2);
            break;
        case "registerassets2000":
            // hrmp channels already in place, but UNCLEAR what has to be done next
            // on 2000, register 2007 assets
            {
                await this.registerAssetLocation({
                    v1: {
                        parents: 1,
                        x1: {
                            Parachain: 2007
                        }
                    }
                }, 2007, sudoAlice, id);
                await this.setAssetUnitsPerSecond({
                    v1: {
                        parents: 1,
                        x1: {
                            Parachain: 2007
                        }
                    }
                }, unitsPerSecond, sudoAlice, id);
            }
            break;
        case "registerassets2007":
            // on 2007, register 2000 assets
            {
                await this.registerAssetLocation({
                    v1: {
                        parents: 1,
                        x1: {
                            Parachain: 2000
                        }
                    }
                }, 2000, sudoAlice, id2);
                await this.setAssetUnitsPerSecond({
                    v1: {
                        parents: 1,
                        x1: {
                            Parachain: 2000
                        }
                    }
                }, unitsPerSecond, sudoAlice, id2);
            }
            break;
        case "remoteexecution2000=>2007": // 2000 => 2007 contractAddress2007 flip, which requires derivative account on 2007 to have balance
            {
                let call2007 = this.get_encoded_ethereum_transact(api, derivedevm_2000, contractAddress2007, input);
                let payment_amount  = "50000000000";   // this controls the xcm buy execution
                let transact_weight = "22750000000";   // this controls the Transacts requireWeightAtMost: 22750000000=(4_000_000_000 + weight(call = 750000 * 25000)
                let payment_address = ethers.utils.getAddress("0xffffffff000000000000000000000000000007d7");    // 7D7 = 2007 in hex   
                console.log("payment_address", payment_address, "call", call2007);
                await this.remote_transact(id, 2007, false, payment_address, payment_amount, call2007, transact_weight);
            }
            break;
        case "remoteexecution2000=>2007": // 2007 => 2000 contractAddress2000 flip, which requires derivative account on 2000 to have balance
            {
                let call2000 = this.get_encoded_ethereum_transact(api, derivedevm_2007, contractAddress2000, input);
                console.log(call2000);
		

                let payment_amount = "900000000000000";
                let transact_weight = "19941000000";
                let payment_address = ethers.utils.getAddress("0xffffffff000000000000000000000000000007d0");   // 7D1 = 2001 in hex
                console.log("payment_address", payment_address, "call", call2000);
                await this.remote_transact(id2, 2000, false, payment_address, payment_amount, call2000, transact_weight);
            }
            break;
        }
    }
}

async function main() {
    let client = new XCMClient();

    // standard EVM stuff: fund your account, deploy a contract (flipper on 2000/2007), test read/writes (getflipcount/flip)
    await client.test("checkbalances")     
    //await client.test("fundaccounts")      // fund 2 EVM accounts from "Alice" to deploy "flip" contracts on 2000/2007
    //await client.test("fundderivatives2000");
    //await client.test("fundderivatives2007");
    //await client.test("fundevmderivatives2000");
    //await client.test("fundevmderivatives2007");
    //await client.test("checkbalances")     // after "fundaccounts", check that the local+derivate accounts have balances
    await client.test("deploycontracts")   // after "fundaccounts" done, set up "flip" contracts on 2000/2007 
    //await client.test("testlocalcontract2000") // after "deploycontracts", update contractAddress2000/2007 in "test" function and test reads/writes
    //await client.test("testlocalcontract2007") // after "deploycontracts", update contractAddress2000/2007 in "test" function and test reads/writes

    // XCM remote_transact (2000=>2007 flip)
    // register assets (https://docs.astar.network/docs/xcm/building-with-xcm/create-xc20-assets https://docs.astar.network/docs/xcm/building-with-xcm/send-xc20-evm)
    // (1) Register 0xffffffff000000000000000000000000000007D7 on 2000, which is necessary for 2000=>2007  since we are paying for execution on 2007 with 2007 assets
    //await client.test("registerassets2000")
    // 0x219fdc1b21546616a6b76da5bc6132214c32eab1955b1ea7fc6efe1100bb532e
    // (2) remote_transact (2000=>2007) SEE: https://docs.astar.network/docs/xcm/building-with-xcm/xc-remote-transact
    //await client.test("remoteexecution2000=>2007")
    
    /*
    // XCM remote_transact (2007=>2000 flip) -- SAME as above, just the opposite direction
    // (1) Register 0xffffffff000000000000000000000000000007D0 on 2007, which is necessary for 2007=>2000 since we are paying for execution on 2000 with 2000 assets
    await client.test("registerassets2007")
    // (2) remote_transact (2007=>2000) SEE: https://docs.astar.network/docs/xcm/building-with-xcm/xc-remote-transact
    await client.test("remoteexecution2007=>2000")
    */
}

main()
    .then(() => {
        process.exit(0);
    })
    .catch((e) => {
        console.error('ERROR', e);
        process.exit(1);
    });
