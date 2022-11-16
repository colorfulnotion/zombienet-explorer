
alice:	
	./polkadot --chain rococo-local.json --name alice --rpc-cors all --unsafe-rpc-external --rpc-methods unsafe --unsafe-ws-external -l=parachain=debug,xcm=trace --no-mdns --node-key 2bd806c97f0e00af1a1fc3328fa763a9269723c8db8fac4f93af71db186d6e90 --no-telemetry --prometheus-external --validator --prometheus-port 43595 --rpc-port 38637 --ws-port 45535 --listen-addr /ip4/0.0.0.0/tcp/40779/ws --base-path ./alice/data

bob:	
	./polkadot --chain rococo-local.json --name bob --rpc-cors all --unsafe-rpc-external --rpc-methods unsafe --unsafe-ws-external -l=parachain=debug,xcm=trace --no-mdns --node-key 81b637d8fcd2c6da6359e6963113a1170de795e4b725b84d1e0b4cfd9ec58ce9 --no-telemetry --prometheus-external --validator --bootnodes /ip4/127.0.0.1/tcp/40779/ws/p2p/12D3KooWQCkBm1BYtkHpocxCwMgR8yjitEeHGx8spzcDLGt2gkBm --prometheus-port 34765 --rpc-port 42627 --ws-port 45909 --listen-addr /ip4/0.0.0.0/tcp/39009/ws --base-path ./bob/data                                                                    

charlie:
	./polkadot --chain rococo-local.json --name charlie --rpc-cors all --unsafe-rpc-external --rpc-methods unsafe --unsafe-ws-external -l=parachain=debug,xcm=trace --no-mdns --node-key b9dd960c1753459a78115d3cb845a57d924b6877e805b08bd01086ccdf34433c --no-telemetry --prometheus-external --validator --bootnodes /ip4/127.0.0.1/tcp/40779/ws/p2p/12D3KooWQCkBm1BYtkHpocxCwMgR8yjitEeHGx8spzcDLGt2gkBm --prometheus-port 40199 --rpc-port 45109 --ws-port 40933 --listen-addr /ip4/0.0.0.0/tcp/38203/ws --base-path ./charlie/data                              

dave:	
	./polkadot --chain rococo-local.json --name dave --rpc-cors all --unsafe-rpc-external --rpc-methods unsafe --unsafe-ws-external -l=parachain=debug,xcm=trace --no-mdns --node-key 61ea0803f8853523b777d414ace3130cd4d3f92de2cd7ff8695c337d79c2eeee --no-telemetry --prometheus-external --validator --bootnodes /ip4/127.0.0.1/tcp/40779/ws/p2p/12D3KooWQCkBm1BYtkHpocxCwMgR8yjitEeHGx8spzcDLGt2gkBm --prometheus-port 41511 --rpc-port 38561 --ws-port 38481 --listen-addr /ip4/0.0.0.0/tcp/41289/ws --base-path ./dave/data                                                                 

collator1:
	./astar-collator --name collator1 --node-key d0f6e85e22fccc6787e8492134a67e60158cb2bfae98eee9210327a4d0d00d80 --chain shibuya-dev_rococo-local-2000.json --base-path ./collator1/data --listen-addr /ip4/0.0.0.0/tcp/42517/ws --rpc-port 8545 --ws-port 35645 --prometheus-external --prometheus-port 37481 --rpc-cors all --unsafe-rpc-external --rpc-methods unsafe --unsafe-ws-external --collator --force-authoring -l=xcm=trace -- --chain rococo-local.json --execution wasm --port 44477 --ws-port 44029 --rpc-port 36467                                                                  


collator2:
	./astar-collator --name collator2 --node-key b5b7368b6893abab0a3b6d01e9a0ea2c29c5fcc8152a784beea49046c45ee806 --chain shibuya-dev_rococo-local-2007.json --base-path ./collator2/data --listen-addr /ip4/0.0.0.0/tcp/35223/ws --rpc-port 8546 --ws-port 36741 --prometheus-external --prometheus-port 44431 --rpc-cors all --unsafe-rpc-external --rpc-methods unsafe --unsafe-ws-external --collator --force-authoring -l=xcm=trace -- --chain rococo-local.json --execution wasm --port 45055 --ws-port 43385 --rpc-port 40905                                                                  
