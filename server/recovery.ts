import { loadArena, saveArena, rows, type Env } from "./store";
import { readLive } from "./live";
import { stateFromFeed } from "../src/tournament/liveState";
import { project, updateResult } from "../src/tournament/engine";
import { newMatchId } from "../src/arena/model";
import { allDuels } from "./duelStore";
export async function recoveryPlan(env: Env, id: string, newAttempt: boolean) {
  const record = await loadArena(env),
    config = structuredClone(record.config);
  let live: Awaited<ReturnType<typeof readLive>> = [];
  try {
    live = await readLive(env);
  } catch {
    /* A replay also repairs a broken feed. */
  }
  const effective = stateFromFeed(
    live,
    config.state,
    config.teams,
    config.overrides,
  ).state;
  const before = project(effective, config.teams);
  if (!before.byId[id]) throw new Error("Maç bulunamadı.");
  const transition = updateResult(effective, id, undefined, config.teams),
    after = project(transition.state, config.teams);
  const affected = before.matches
    .filter(
      (m) =>
        m.id !== id &&
        (m.a !== after.byId[m.id]?.a || m.b !== after.byId[m.id]?.b),
    )
    .map((m) => m.id);
  const history = await rows<{ external_id: string }>(
    env,
    "SELECT DISTINCT external_id FROM matchzy_maps",
  );
  let privateIds: string[] = [];
  try {
    privateIds = (await allDuels(env)).map((d) => d.externalId);
  } catch (error) {
    if (!(error instanceof Error && /no such table/i.test(error.message)))
      throw error;
  }
  const used = [
    ...history.map((r) => r.external_id),
    ...privateIds,
    ...Object.values(config.schedule).map((s) => s.externalId),
  ];
  for (const matchId of [...affected, ...(newAttempt ? [id] : [])]) {
    const externalId = newMatchId(used);
    used.push(externalId);
    config.schedule[matchId] = {
      ...config.schedule[matchId],
      externalId,
      maps: [],
      a: undefined,
      b: undefined,
    };
  }
  config.state = transition.state;
  config.overrides = config.overrides.filter(
    (matchId) => matchId !== id && !affected.includes(matchId),
  );
  return { record, config, affected };
}
export async function applyRecovery(
  env: Env,
  plan: Awaited<ReturnType<typeof recoveryPlan>>,
) {
  if (env.DB?.batch) {
    const statements = [
      env.DB.prepare(
        "INSERT INTO arena_restore_guard(id) SELECT CASE WHEN EXISTS(SELECT 1 FROM arena_config WHERE id=1 AND revision=?) THEN 1 ELSE 0 END",
      ).bind(plan.record.revision),
      env.DB.prepare(
        "UPDATE arena_config SET config=?,revision=revision+1 WHERE id=1",
      ).bind(JSON.stringify(plan.config)),
    ];
    for (const id of plan.affected) {
      statements.push(
        env.DB.prepare("DELETE FROM match_veto WHERE match_id=?").bind(id),
        env.DB.prepare("DELETE FROM match_ready WHERE match_id=?").bind(id),
      );
    }
    statements.push(env.DB.prepare("DELETE FROM arena_restore_guard"));
    try {
      await env.DB.batch(statements);
    } catch (error) {
      if (
        error instanceof Error &&
        /CHECK constraint|UNIQUE constraint.*arena_restore_guard/i.test(
          error.message,
        )
      )
        throw new Error("CONFLICT");
      throw error;
    }
    return;
  }
  await saveArena(env, plan.config, plan.record.revision);
  for (const id of plan.affected) {
    await env
      .DB!.prepare("DELETE FROM match_veto WHERE match_id=?")
      .bind(id)
      .run();
    await env
      .DB!.prepare("DELETE FROM match_ready WHERE match_id=?")
      .bind(id)
      .run();
  }
  // Old runtime and stats rows are retained as attempt history, never rebound.
}
