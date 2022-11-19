
let networks = [
    {ids: ["nodle"], binary:"nodle-parachain-2.0.22"},
    {ids: ["turing", "oak"], binary: "oak-collator-1.4.0"},
    {ids: ["khala", "phala"], binary: "khala-node-0.1.13"},
    {ids: ["clover"], binary: "clover-0.1.23"},
    {ids: ["kico"], binary: "kico-2.0.0"},
    {ids: ["hydradx"], binary: "hydradx-13.0.0"},
    {ids: ['statemint'], binary: ""},
    {ids: ['unique'], binary: ""},
    {ids: ["centrifuge"], binary: "centrifuge-chain-0.10.20"},
    {ids: ["imbue"], binary: "imbue-2.0.0"},
    {ids: ["litentry"], binary: "litentry-collator-0.9.11"},
    {ids: ["composable"], binary: "composable-2.3.1"},
    {ids: ["genshiro"], binary: "gens-para-2.0.0"},
    {ids: ["robonomics"], binary: "robonomics-2.1.0"},
    {ids: ["parallel/heiko"], binary: "parallel-1.8.1"},
    {ids: ["acala/karura"], binary: "acala-2.6.3"},
    {ids: ["astar/shiden/shibuya"], binary: "astar-collator-4.21.0"},
    {ids: ["bifrost-dot/ksm"], binary: "bifrost-0.9.43"},
    {ids: ["efinity"], binary: "efinity-2.1.0"},
    {ids: ["moonbase/moonriver/moonbeam"], binary: "moonbeam-0.27.1"},
    {ids: ["interlay/kintusgi"], binary: "interbtc-parachain-1.18.0"},
    {ids: ["calamari/manta"], binary: "manta-3.3.0"},
    {ids: ["quartz/unique"], binary: "unique-collator-0.9.24"},
    {ids: ["equilibrium"], binary: " paranode-2.0.0"},
    {ids: ["polkadot/kusama"], binary: " polkadot-0.9.30"},
    {ids: ["litmus/litentry"], binary: "litentry-collator-0.9.11"},
    {ids: ["encointer"], binary: "encointer-collator-1.2.0"},
    {ids: ["statemine", "statemint"], binary: "polkadot-parachain-0.9.230"}
];

for ( const network of networks ) {
    //console.log(network);
    for ( const id of network.ids) {
	console.log(id, network.binary);
	// TODO: generate toml configurations with these binaries
    } 
}
