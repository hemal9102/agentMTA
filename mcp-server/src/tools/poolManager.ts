/**
 * IP Fleet & Sharding Pool Manager
 * D:\projects\MTAengine\mcp-server\src\tools\poolManager.ts
 */

import { promises as fs } from 'fs';
import path from 'path';

const POOLS_CONFIG_PATH = path.resolve('D:/projects/MTAengine/kumo/policy/dynamic_pools.json');

export interface SourceConfig {
  source_address: string;
  ehlo_domain: string;
  category: 'platinum_transactional' | 'fully_warmed_up' | 'warming_up' | 'quarantine';
  max_daily: number;
  weight?: number;
  allow_overflow?: number;
  is_primary?: number;
}

export async function readPoolsConfig() {
  try {
    const raw = await fs.readFile(POOLS_CONFIG_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (err: any) {
    throw new Error(`Failed to read dynamic_pools.json: ${err.message}`);
  }
}

export async function writePoolsConfig(data: any) {
  try {
    data.updated_at = new Date().toISOString();
    await fs.writeFile(POOLS_CONFIG_PATH, JSON.stringify(data, null, 4), 'utf-8');
    return true;
  } catch (err: any) {
    throw new Error(`Failed to write dynamic_pools.json: ${err.message}`);
  }
}

export async function getFleetStatus() {
  const config = await readPoolsConfig();
  const sources = config.sources || {};
  const pools = config.pools || {};

  const summary = {
    total_sources: Object.keys(sources).length,
    total_pools: Object.keys(pools).length,
    tiers: {
      platinum_transactional: [] as string[],
      fully_warmed_up: [] as string[],
      warming_up: [] as string[],
      quarantine: [] as string[],
    },
    sources,
    pools,
  };

  for (const [name, src] of Object.entries<any>(sources)) {
    const cat = src.category || 'warming_up';
    if ((summary.tiers as any)[cat]) {
      (summary.tiers as any)[cat].push(`${name} (${src.source_address})`);
    }
  }

  return summary;
}

export async function registerSource(name: string, source: SourceConfig, targetPools: string[]) {
  const config = await readPoolsConfig();
  if (!config.sources) config.sources = {};
  if (!config.pools) config.pools = {};

  config.sources[name] = {
    source_address: source.source_address,
    ehlo_domain: source.ehlo_domain,
    category: source.category,
    max_daily: source.max_daily || 2000,
    allow_overflow: source.allow_overflow ?? 1,
    is_primary: source.is_primary ?? 0,
  };

  const weight = source.weight ?? 50;
  for (const poolName of targetPools) {
    if (!config.pools[poolName]) {
      config.pools[poolName] = [];
    }
    // Remove if already exists
    config.pools[poolName] = config.pools[poolName].filter((e: any) => e.name !== name);
    // Add entry
    config.pools[poolName].push({
      name,
      weight,
      category: source.category,
      max_daily: source.max_daily || 2000,
    });
  }

  await writePoolsConfig(config);
  return { status: 'registered', source_name: name, target_pools: targetPools };
}

export async function setSourceTier(sourceName: string, newTier: 'platinum_transactional' | 'fully_warmed_up' | 'warming_up' | 'quarantine') {
  const config = await readPoolsConfig();
  if (!config.sources || !config.sources[sourceName]) {
    throw new Error(`Source "${sourceName}" does not exist in dynamic_pools.json`);
  }

  config.sources[sourceName].category = newTier;

  // If quarantine, set weight to 0 across all pools
  if (newTier === 'quarantine') {
    for (const poolName of Object.keys(config.pools || {})) {
      for (const entry of config.pools[poolName]) {
        if (entry.name === sourceName) {
          entry.weight = 0;
          entry.category = 'quarantine';
        }
      }
    }
  }

  await writePoolsConfig(config);
  return { status: 'updated', source_name: sourceName, new_tier: newTier };
}
