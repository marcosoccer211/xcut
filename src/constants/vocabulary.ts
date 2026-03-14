export const AI_TERMS = [
  'GPT', 'GPT-4', 'GPT-4o', 'Claude', 'Gemini', 'LLM', 'RAG', 'transformer',
  'fine-tuning', 'embeddings', 'tokenizer', 'inference', 'hallucination',
  'multimodal', 'RLHF', 'Anthropic', 'OpenAI', 'Mistral', 'Llama', 'Hugging Face',
  'diffusion model', 'Stable Diffusion', 'DALL-E', 'Midjourney', 'prompt engineering',
  'context window', 'vector database', 'Langchain', 'agent', 'MCP', 'Cursor', 'Copilot',
]

export const CRYPTO_TERMS = [
  'Bitcoin', 'BTC', 'Ethereum', 'ETH', 'DeFi', 'NFT', 'blockchain', 'wallet',
  'staking', 'yield farming', 'liquidity', 'DEX', 'CEX', 'Binance', 'Coinbase',
  'Solana', 'SOL', 'Polygon', 'MATIC', 'Layer 2', 'L2', 'rollup', 'bridge',
  'smart contract', 'DAO', 'governance', 'airdrop', 'tokenomics', 'whitepaper',
  'bull run', 'bear market', 'altcoin', 'memecoin', 'DOGE', 'Pepe', 'Uniswap',
  'MetaMask', 'cold wallet', 'seed phrase', 'gas fees', 'USDT', 'USDC', 'stablecoin',
]

export const buildWhisperPrompt = (customTerms: string[] = []) => {
  const all = [...AI_TERMS, ...CRYPTO_TERMS, ...customTerms]
  return `The following specialized terms may appear: ${all.join(', ')}.`
}
