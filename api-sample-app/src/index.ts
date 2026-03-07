import { querySubgraph } from "./utils/helper";

/**
 * main method
 */
const main = async () => {
  // Example usage
  const data = await querySubgraph(`
    query GetMarkets($first: Int!) {
      markets(first: $first) {
        id
        quoteToken { symbol }
        baseToken { symbol }
      }
    }
  `, { first: 10 });

  console.log(JSON.stringify(data, null, 2));
};

main().catch(console.error);