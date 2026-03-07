import { SUBGRAPH_URL } from "./constants";

/**
 * API call helper function to query the subgraph
 * @param query 
 * @param variables 
 * @returns 
 */
export async function querySubgraph(query: any, variables = {}) {
  const response = await fetch(SUBGRAPH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables })
  });
  
  const { data, errors } = await response.json();
  if (errors) throw new Error(errors[0].message);
  return data;
}