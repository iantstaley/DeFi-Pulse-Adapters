/*==================================================
  Imports
==================================================*/
const sdk = require('../../../../sdk');
const BigNumber = require('bignumber.js');
const axios = require('axios');

/*==================================================
  Settings
==================================================*/
const SY_POOLS_API_URL = 'https://prod-poly-v2.api.barnbridge.com/api/smartyield/pools';
const SA_POOLS_API_URL = 'https://prod-poly-v2.api.barnbridge.com/api/smartalpha/pools';

/*==================================================
  API
==================================================*/
async function fetchSyPools(apiUrl) {
    return axios.get(apiUrl)
        .then(res => res.data)
        .then(({status, data}) => status === 200 ? data : []);
}

async function fetchSaPools(apiUrl) {
    return axios.get(apiUrl)
        .then(res => res.data)
        .then(({status, data}) => status === 200 ? data : []);
}

/*==================================================
  Contract
==================================================*/
function syGetUnderlyingTotal(chain, smartYieldAddress, block) {
    return sdk.api.abi.call({
        abi: {
            name: "underlyingTotal",
            type: "function",
            stateMutability: "view",
            constant: true,
            payable: false,
            inputs: [],
            outputs: [
                {
                    name: "total",
                    type: "uint256",
                    internalType: "uint256",
                },
            ],
        },
        target: smartYieldAddress,
        chain,
        block,
    }).then(({output}) => new BigNumber(output));
}

function saGetEpochBalance(chain, smartAlphaAddress, block) {
    return sdk.api.abi.call({
        abi: {
            name: "epochBalance",
            type: "function",
            stateMutability: "view",
            constant: true,
            payable: false,
            inputs: [],
            outputs: [
                {
                    name: "balance",
                    type: "uint256",
                    internalType: "uint256",
                },
            ],
        },
        target: smartAlphaAddress,
        chain,
        block,
    }).then(({output}) => new BigNumber(output));
}

function saGetQueuedJuniorsUnderlyingIn(chain, smartAlphaAddress, block) {
    return sdk.api.abi.call({
        abi: {
            name: "queuedJuniorsUnderlyingIn",
            type: "function",
            stateMutability: "view",
            constant: true,
            payable: false,
            inputs: [],
            outputs: [
                {
                    name: "amount",
                    type: "uint256",
                    internalType: "uint256",
                },
            ],
        },
        target: smartAlphaAddress,
        chain,
        block,
    }).then(({output}) => new BigNumber(output));
}

function saGetQueuedSeniorsUnderlyingIn(chain, smartAlphaAddress, block) {
    return sdk.api.abi.call({
        abi: {
            name: "queuedSeniorsUnderlyingIn",
            type: "function",
            stateMutability: "view",
            constant: true,
            payable: false,
            inputs: [],
            outputs: [
                {
                    name: "amount",
                    type: "uint256",
                    internalType: "uint256",
                },
            ],
        },
        target: smartAlphaAddress,
        chain,
        block,
    }).then(({output}) => new BigNumber(output));
}

/*==================================================
  Helpers
==================================================*/
class TokensBalance {
    #balances = {};

    get balances() {
        return Object.assign({}, this.#balances);
    }

    addTokenToBalance(address, amount) {
        const key = this.resolveAddress(address);

        if (!this.#balances[key]) {
            this.#balances[key] = new BigNumber(0);
        }

        this.#balances[key] = this.#balances[key].plus(amount);
    }

    resolveAddress(address) {
        switch (address) {
            default:
                return address;
        }
    }
}

/*==================================================
  TVL
==================================================*/
async function tvl(timestamp, ethBlock) {
    const chain = 'polygon';
    const block = ethBlock;
    const tb = new TokensBalance();

    // calculate TVL from SmartYield pools
    const syPools = await fetchSyPools(SY_POOLS_API_URL);

    await Promise.all(syPools.map(async syPool => {
        const {smartYieldAddress, underlyingAddress} = syPool;
        const underlyingTotal = await syGetUnderlyingTotal(chain, smartYieldAddress, block);
        tb.addTokenToBalance(underlyingAddress, underlyingTotal);
    }));

    // calculate TVL from SmartAlpha pools
    const saPools = await fetchSaPools(SA_POOLS_API_URL);

    await Promise.all(saPools.map(async saPool => {
        const {poolAddress, poolToken} = saPool;
        const [epochBalance, queuedJuniorsUnderlyingIn, queuedSeniorsUnderlyingIn] = await Promise.all([
            saGetEpochBalance(chain, poolAddress, block),
            saGetQueuedJuniorsUnderlyingIn(chain, poolAddress, block),
            saGetQueuedSeniorsUnderlyingIn(chain, poolAddress, block),
        ]);

        const underlyingTotal = epochBalance
            .plus(queuedJuniorsUnderlyingIn)
            .plus(queuedSeniorsUnderlyingIn);
        tb.addTokenToBalance(poolToken.address, underlyingTotal);
    }));

    return tb.balances;
}

/*==================================================
  Metadata
==================================================*/
module.exports = {
    name: 'BarnBridge_Polygon',
    website: 'https://app.barnbridge.com',
    token: 'BOND',
    category: 'Derivatives',
    chain: 'polygon',
    start: 1615564559, // Mar-24-2021 02:17:40 PM +UTC
    tvl,
};
