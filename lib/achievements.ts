/**
 * Achievements system.
 *
 * Achievements are defined here as static records. New ones can be added at any time.
 * When an achievement is unlocked for a player it is stored in the DB so it is only
 * awarded once per player.
 */

import { query, initSchema } from './db.js';

// ── Achievement definitions ──────────────────────────────────────────────────

export type AchievementDef = {
  id: string;          // unique slug  e.g. "spy_viper"
  name: string;        // display name e.g. "Viper captured as a spy"
  description: string;
  icon?: string;       // optional emoji / asset key
};

/** All known achievements. Add more here as the game grows. */
export const ACHIEVEMENTS: AchievementDef[] = [
  // One per agent in the roster (lib/roster.js) — triggered when that agent
  // is correctly identified as the spy
  { id: 'spy_atlas',    name: 'Atlas Toppled',      description: 'Caught Atlas as the spy.' },
  { id: 'spy_falcon',   name: 'Falcon Downed',      description: 'Caught Falcon as the spy.' },
  { id: 'spy_vega',     name: 'Vega Eclipsed',      description: 'Caught Vega as the spy.' },
  { id: 'spy_titan',    name: 'Titan Felled',       description: 'Caught Titan as the spy.' },
  { id: 'spy_blaze',    name: 'Blaze Doused',       description: 'Caught Blaze as the spy.' },
  { id: 'spy_halo',     name: 'Halo Dimmed',        description: 'Caught Halo as the spy.' },
  { id: 'spy_razor',    name: 'Razor Dulled',       description: 'Caught Razor as the spy.' },
  { id: 'spy_sentinel', name: 'Sentinel Stood Down', description: 'Caught Sentinel as the spy.' },
  { id: 'spy_viper',    name: 'Viper Exposed',      description: 'Caught Viper as the spy.' },
  { id: 'spy_raven',    name: 'Raven Caged',        description: 'Caught Raven as the spy.' },
  { id: 'spy_bishop',   name: 'Bishop Checked',     description: 'Caught Bishop as the spy.' },
  { id: 'spy_echo',     name: 'Echo Silenced',      description: 'Caught Echo as the spy.' },
  { id: 'spy_hydra',    name: 'Hydra Beheaded',     description: 'Caught Hydra as the spy.' },
  { id: 'spy_nova',     name: 'Nova Neutralised',   description: 'Caught Nova as the spy.' },
  { id: 'spy_cipher',   name: 'Cipher Cracked',     description: 'Caught Cipher as the spy.' },
  { id: 'spy_pulse',    name: 'Pulse Flatlined',    description: 'Caught Pulse as the spy.' },
  { id: 'spy_archer',   name: 'Archer Disarmed',    description: 'Caught Archer as the spy.' },
  { id: 'spy_orion',    name: 'Orion Grounded',     description: 'Caught Orion as the spy.' },
  { id: 'spy_kraken',   name: 'Kraken Sunk',        description: 'Caught Kraken as the spy.' },
  { id: 'spy_wolf',     name: 'Wolf Collared',      description: 'Caught Wolf as the spy.' },
  { id: 'spy_talon',    name: 'Talon Clipped',      description: 'Caught Talon as the spy.' },
  { id: 'spy_zenith',   name: 'Zenith Lowered',     description: 'Caught Zenith as the spy.' },
  { id: 'spy_frost',    name: 'Frost Thawed',       description: 'Caught Frost as the spy.' },
  { id: 'spy_nomad',    name: 'Nomad Cornered',     description: 'Caught Nomad as the spy.' },
  { id: 'spy_ghost',    name: 'Ghost Busted',       description: 'Caught Ghost as the spy.' },
  { id: 'spy_cobra',    name: 'Cobra Defanged',     description: 'Caught Cobra as the spy.' },
  { id: 'spy_phantom',  name: 'Phantom Unmasked',   description: 'Caught Phantom as the spy.' },
  { id: 'spy_shade',    name: 'Shade Illuminated',  description: 'Caught Shade as the spy.' },
  { id: 'spy_striker',  name: 'Striker Benched',    description: 'Caught Striker as the spy.' },
  { id: 'spy_loki',     name: 'Loki Outfoxed',      description: 'Caught Loki as the spy.' },
  { id: 'spy_dagger',   name: 'Dagger Sheathed',    description: 'Caught Dagger as the spy.' },
  { id: 'spy_vector',   name: 'Vector Nullified',   description: 'Caught Vector as the spy.' },
];

export function getAchievementDef(id: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find(a => a.id === id);
}

/** Returns the achievement id for catching a specific spy by name, or null if none defined. */
export function achievementForSpy(spyName: string): string | null {
  const slug = `spy_${spyName.toLowerCase().replace(/\s+/g, '_')}`;
  return ACHIEVEMENTS.find(a => a.id === slug) ? slug : null;
}

// ── DB helpers ───────────────────────────────────────────────────────────────

function hasDb() {
  return !!process.env.POSTGRES_URL;
}

/**
 * Award an achievement to a player (idempotent — safe to call multiple times).
 * Returns the achievement def if it was newly unlocked, or null if already had it.
 */
export async function awardAchievement(
  shieldedAddress: string,
  achievementId: string,
): Promise<AchievementDef | null> {
  if (!shieldedAddress) return null;
  const def = getAchievementDef(achievementId);
  if (!def) return null;

  if (hasDb()) {
    await initSchema();
    const result = await query(
      `INSERT INTO player_achievements (shielded_address, achievement_id, unlocked_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (shielded_address, achievement_id) DO NOTHING
       RETURNING achievement_id`,
      [shieldedAddress, achievementId],
    );
    return result.rows.length > 0 ? def : null;
  } else {
    // In-memory fallback
    const key = `${shieldedAddress}::${achievementId}`;
    if (memAchievements.has(key)) return null;
    memAchievements.add(key);
    return def;
  }
}

/**
 * Get all achievements unlocked by a player, with full def details.
 */
export async function getPlayerAchievements(shieldedAddress: string): Promise<Array<AchievementDef & { unlocked_at: string }>> {
  if (hasDb()) {
    await initSchema();
    const result = await query(
      `SELECT achievement_id, unlocked_at FROM player_achievements WHERE shielded_address = $1 ORDER BY unlocked_at ASC`,
      [shieldedAddress],
    );
    return result.rows.flatMap((row: { achievement_id: string; unlocked_at: string }) => {
      const def = getAchievementDef(row.achievement_id);
      return def ? [{ ...def, unlocked_at: row.unlocked_at }] : [];
    });
  } else {
    return [...memAchievements]
      .filter(k => k.startsWith(shieldedAddress + '::'))
      .flatMap(k => {
        const id = k.slice(shieldedAddress.length + 2);
        const def = getAchievementDef(id);
        return def ? [{ ...def, unlocked_at: new Date().toISOString() }] : [];
      });
  }
}

/**
 * Get all players and their achievements (admin / leaderboard view).
 */
export async function getAllPlayerAchievements(): Promise<Array<{
  shielded_address: string;
  achievements: Array<AchievementDef & { unlocked_at: string }>;
}>> {
  if (hasDb()) {
    await initSchema();
    const result = await query(
      `SELECT shielded_address, achievement_id, unlocked_at
       FROM player_achievements
       ORDER BY shielded_address, unlocked_at ASC`,
    );
    const byPlayer = new Map<string, Array<AchievementDef & { unlocked_at: string }>>();
    for (const row of result.rows as Array<{ shielded_address: string; achievement_id: string; unlocked_at: string }>) {
      const def = getAchievementDef(row.achievement_id);
      if (!def) continue;
      if (!byPlayer.has(row.shielded_address)) byPlayer.set(row.shielded_address, []);
      byPlayer.get(row.shielded_address)!.push({ ...def, unlocked_at: row.unlocked_at });
    }
    return [...byPlayer.entries()].map(([shielded_address, achievements]) => ({ shielded_address, achievements }));
  } else {
    const byPlayer = new Map<string, Array<AchievementDef & { unlocked_at: string }>>();
    for (const key of memAchievements) {
      const [addr, id] = key.split('::');
      const def = getAchievementDef(id);
      if (!def) continue;
      if (!byPlayer.has(addr)) byPlayer.set(addr, []);
      byPlayer.get(addr)!.push({ ...def, unlocked_at: new Date().toISOString() });
    }
    return [...byPlayer.entries()].map(([shielded_address, achievements]) => ({ shielded_address, achievements }));
  }
}

// In-memory fallback store (used when POSTGRES_URL is not set)
const memAchievements = new Set<string>();
