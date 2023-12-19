const BigNumber = require("bignumber.js");
const sdk = require("../../sdk");
const token0 = require("./abis/token0.json");
const token1 = require("./abis/token1.json");
const getReserves = require("./abis/getReserves.json");

const START_BLOCK = 11330678;
const FACTORY = "0x696708db871b77355d6c2be7290b27cf0bb9b24b";

module.exports = async function tvl(_, block) {
  const logs = (
    await sdk.api.util.getLogs({
      keys: [],
      toBlock: block,
      target: FACTORY,
      fromBlock: START_BLOCK,
      topic: "PairCreated(address,address,address,uint256)"
    })
  ).output;

  const pairAddresses = logs.map((
    log // sometimes the full log is emitted
  ) =>
    typeof log === "string"
      ? log.toLowerCase()
      : `0x${log.data.slice(64 - 40 + 2, 64 + 2)}`.toLowerCase()
  );

  const [token0Addresses, token1Addresses] = await Promise.all([
    (
      await sdk.api.abi.multiCall({
        abi: token0,
        calls: pairAddresses.map(pairAddress => ({
          target: pairAddress
        })),
        block
      })
    ).output,
    (
      await sdk.api.abi.multiCall({
        abi: token1,
        calls: pairAddresses.map(pairAddress => ({
          target: pairAddress
        })),
        block
      })
    ).output
  ]);

  const pairs = {};
  token0Addresses.forEach(token0Address => {
    if (token0Address.success) {
      const tokenAddress = token0Address.output.toLowerCase();
      const pairAddress = token0Address.input.target.toLowerCase();
      pairs[pairAddress] = {
        token0Address: tokenAddress
      };
    }
  });

  // add token1Addresses
  token1Addresses.forEach(token1Address => {
    if (token1Address.success) {
      const tokenAddress = token1Address.output.toLowerCase();
      const pairAddress = token1Address.input.target.toLowerCase();
      pairs[pairAddress] = {
        ...(pairs[pairAddress] || {}),
        token1Address: tokenAddress
      };
    }
  });

  const reserves = (
    await sdk.api.abi.multiCall({
      abi: getReserves,
      calls: Object.keys(pairs).map(pairAddress => ({
        target: pairAddress
      })),
      block
    })
  ).output;

  return reserves.reduce((accumulator, reserve, i) => {
    if (reserve.success) {
      const pairAddress = reserve.input.target.toLowerCase();
      const pair = pairs[pairAddress] || {};

      // handle reserve0
      if (pair.token0Address) {
        const reserve0 = new BigNumber(reserve.output["0"]);
        if (!reserve0.isZero()) {
          const existingBalance = new BigNumber(
            accumulator[pair.token0Address] || "0"
          );

          accumulator[pair.token0Address] = existingBalance
            .plus(reserve0)
            .toFixed();
        }
      }

      // handle reserve1
      if (pair.token1Address) {
        const reserve1 = new BigNumber(reserve.output["1"]);

        if (!reserve1.isZero()) {
          const existingBalance = new BigNumber(
            accumulator[pair.token1Address] || "0"
          );

          accumulator[pair.token1Address] = existingBalance
            .plus(reserve1)
            .toFixed();
        }
      }
    }

    return accumulator;
  }, {});
};
