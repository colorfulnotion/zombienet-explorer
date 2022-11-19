curl -X POST http://localhost:9411 -H 'Content-Type: application/json' -d '[
    {
        "id": "b94fbe1c7a06802e",
        "traceId": "30590340012",
        "timestamp": 1666577712000000,
        "duration": 6000000,
        "name": "origination",
        "tags": {
            "extrinsicID": "3060365-433",
            "extrinsicHash": "0xcdb3d8795b945a14573e0cdfe7b17e5db9695e7f265ef9349d69673b31ae5d28",
            "blockNumber": "3060365"
        },
        "localEndpoint": {
            "serviceName": "moonbase-alpha"
        }
    },
    {
        "id": "1",
        "parentId": "b94fbe1c7a06802e",
        "traceId": "30590340012",
        "timestamp": 1666577712000000,
        "duration": 10000,
        "name": "balances:Withdraw",
        "tags": {
            "who": "0xDcB4651B5BbD105CDa8d3bA5740b6C4f02b9256D",
            "amount": "2,000,000,000,000,000"
        },
        "localEndpoint": {
            "serviceName": "event"
        }
    },
    {
        "id": "2",
        "parentId": "b94fbe1c7a06802e",
        "traceId": "30590340012",
        "timestamp": 1666577712000000,
        "duration": 10000,
        "name": "balances:Transfer",
        "tags": {
            "from": "0xDcB4651B5BbD105CDa8d3bA5740b6C4f02b9256D",
            "to": "0x7369626C78030000000000000000000000000000",
            "amount": "20,000,000,000,000,000"
        },
        "localEndpoint": {
            "serviceName": "event"
        }
    },
    {
        "id": "3",
        "parentId": "b94fbe1c7a06802e",
        "traceId": "30590340012",
        "timestamp": 1666577712000000,
        "duration": 10000,
        "name": "xcmpQueue:XcmpMessageSent",
        "tags": {
            "messageHash": "0x8f6a10d23cd02cfd097991023a6427dfdd0fc4001b57fc85a56de1686f49ec63"
        },
        "localEndpoint": {
            "serviceName": "event"
        }
    },
    {
        "id": "4",
        "parentId": "b94fbe1c7a06802e",
        "traceId": "30590340012",
        "timestamp": 1666577712000000,
        "duration": 10000,
        "name": "xTokens:TransferredMultiAssets",
        "tags": {
            "sender": "0xDcB4651B5BbD105CDa8d3bA5740b6C4f02b9256D"
        },
        "localEndpoint": {
            "serviceName": "event"
        }
    },
    {
        "id": "5",
        "parentId": "b94fbe1c7a06802e",
        "traceId": "30590340012",
        "timestamp": 1666577712000000,
        "duration": 10000,
        "name": "balances:Deposit",
        "tags": {
            "who": "0xDcB4651B5BbD105CDa8d3bA5740b6C4f02b9256D",
            "amount": "1,968,768,000,000,000"
        },
        "localEndpoint": {
            "serviceName": "event"
        }
    },
    {
        "id": "6",
        "parentId": "b94fbe1c7a06802e",
        "traceId": "30590340012",
        "timestamp": 1666577712000000,
        "duration": 10000,
        "name": "balances:Deposit",
        "tags": {
            "who": "0x6d6F646c70632f74727372790000000000000000",
            "amount": "6,246,400,000,000"
        },
        "localEndpoint": {
            "serviceName": "event"
        }
    },
    {
        "id": "7",
        "parentId": "b94fbe1c7a06802e",
        "traceId": "30590340012",
        "timestamp": 1666577712000000,
        "duration": 10000,
        "name": "treasury:Deposit",
        "tags": {
            "value": "6,246,400,000,000"
        },
        "localEndpoint": {
            "serviceName": "event"
        }
    },
    {
        "id": "8",
        "parentId": "b94fbe1c7a06802e",
        "traceId": "30590340012",
        "timestamp": 1666577712000000,
        "duration": 10000,
        "name": "ethereum:Executed",
        "tags": {
            "from": "0xdcb4651b5bbd105cda8d3ba5740b6c4f02b9256d",
            "to": "0x0000000000000000000000000000000000000804",
            "transactionHash": "0x0155018c578a6212231a9de3264c147430ccf40f210ecfc7c887f47858b88363"
        },
        "localEndpoint": {
            "serviceName": "event"
        }
    },
    {
        "id": "9",
        "parentId": "b94fbe1c7a06802e",
        "traceId": "30590340012",
        "timestamp": 1666577712000000,
        "duration": 10000,
        "name": "system:ExtrinsicSuccess",
        "tags": {},
        "localEndpoint": {
            "serviceName": "event"
        }
    }
]'

curl -X POST http://localhost:9411 -H 'Content-Type: application/json' -d '[
    {
        "id": "176aa8933a611aee",
        "traceId": "30590340012",
        "timestamp": 1666577718000000,
        "duration": 6000000,
        "name": "relay",
        "parentId": "3",
        "tags": {
            "serviceName": "moonbase-relay",
            "protocol": "hrmp",
            "msgHash": "0x8f6a10d23cd02cfd097991023a6427dfdd0fc4001b57fc85a56de1686f49ec63",
            "sentAt": "https://polkaholic.io/block/60000/7379735",
            "relayedAt": "https://polkaholic.io/block/60000/7379736",
            "includedAt": "https://polkaholic.io/block/60000/7379737"
        },
        "localEndpoint": {
            "serviceName": "moonbase-relay"
        }
    }
]'

curl -X POST http://localhost:9411 -H 'Content-Type: application/json' -d '[
    {
        "id": "3fcf6c92da8768e7",
        "traceId": "30590340012",
        "timestamp": 1666577730000000,
        "parentId": "176aa8933a611aee",
        "duration": 6000000,
        "name": "destination",
        "tags": {
            "blockNumber": "804449"
        },
        "localEndpoint": {
            "serviceName": "moonbase-beta"
        }
    },
    {
        "id": "1000",
        "parentId": "3fcf6c92da8768e7",
        "traceId": "30590340012",
        "timestamp": 1666577730000000,
        "duration": 6000000,
        "name": "Assets:Issued",
        "tags": {
            "assetId": "222,902,676,330,054,289,648,817,870,329,963,141,953",
            "owner": "0xDcB4651B5BbD105CDa8d3bA5740b6C4f02b9256D",
            "totalSupply": "19,994,800,000,000,000"
        },
        "localEndpoint": {
            "serviceName": "event"
        }
    }
]'
