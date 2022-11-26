# Remote Execution of WASM Contracts

[Thanks to Dino Pacandi @ Astar who provided `custom-astar-collator` used in step 1 and the following recipe]

This is a recipe for demonstrating remote execution of a WASM Flipper contract deployed on 2000, from paraID 2007 using `polkadotXcm.send`:

```
2000 [Flipper] <-remote execution-  2007
```


### 1. **Spin up Zombienet**

```
./zombienet-linux -p native spawn shibuya.toml
```

Use [Zombienet explorer](https://github.com/w3f/Grants-Program/blob/master/applications/Zombienet-Explorer.md) or [polkadot.js](https://polkadot.js.org/) links.  

### 2. Deploy contract

On 2000, deploy `flipper.contract` with Developer -> Contracts -> Upload & deploy code and record Contract Address, e.g. `bcx7Ggu3S9kL2LgDcAFtaR5FvkXfaVuFUfxzNfpQ3wYCvx3`.  Add this contract address to 2000.

### 3. Get Encoded call

On 2000, open Developer -> Extrinsic -> contracts -> call but change
* `destination` should be the deployed flipper Contract address from (2)
* `gasLimit` should be 10000000000
* `data` should be 0x633aa551 (flip)

Encoded call for local flip: (execute and observe how the value changes)

```
0x460000fb6b09787b354f92cf34333f0563c38376e4efe3ed5feefd6253310ac88273d9000700e40b54020010633aa551
```

https://polkadot.js.org/apps/?rpc=wss%3A%2F%2Frpc.shiden.astar.network#/extrinsics/decode/0x460000fb6b09787b354f92cf34333f0563c38376e4efe3ed5feefd6253310ac88273d9000700e40b54020010633aa551

### 4. Fund Derived account on 2000

Send to Alice's derived account `0xfbe559a05e32e8821755283f8f4155387bde61ce40a7896db008d9b6a981d8e6`:
This is derivable using Astar's xcm-tools:
```
./xcm-tools account32-hash -a 0xd43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d -p 2007 -n any
```
or with [Polkaholic's Remote Execution tool](https://polkaholic.io/remoteexecution) using Alice's public key as an input
`0xd43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d`.

### 5. Remote Execution from 2007 to 2000

On 2007, execute a `polkadotXcm.send(dest, message)` with

* `dest` as paraID 2000
* `message` as:

```
0x330001010100411f021000040000000013000064a7b3b6e00d130000000013000064a7b3b6e00d0006010700aea68f02c0460000e99d4e59207f368c0577abd5738ee89376fe0ef21ce27a023940d04e02cf94bb000700e40b54020010633aa55114
```
but change the encoded call in `Transact` to (3).  Optionally, add `RefundSurplus` + `DepositAsset`, to move funds from the holding register to the account of your choosing:
```
0x330001010100411f021400040000000013000064a7b3b6e00d130000000013000064a7b3b6e00d0006010700aea68f02c0460000e99d4e59207f368c0577abd5738ee89376fe0ef21ce27a023940d04e02cf94bb000700e40b54020010633aa551140d000004010200411f0100fbe559a05e32e8821755283f8f4155387bde61ce40a7896db008d9b6a981d8e6
```

and see that your value changes on 2000 after the above is executed.


