import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";

const args = ["exec", "-i", "supabase_db_gAmErS_badminton", "psql", "-U", "postgres", "-d", "postgres", "-XqAt", "-v", "ON_ERROR_STOP=1"];
const user = randomUUID();
const auth = `set request.jwt.claim.sub = '${user}'; set role authenticated;`;
const sql = (command) => execFileSync("docker", args, { input: auth + command, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
const a = randomUUID();
const b = randomUUID();
const created = [];
const session = () => { const id = sql(`select public.start_session(array['${a}','${b}']::uuid[]);`); created.push(id); return id; };
const insert = (id, gameId) => `insert into public.games(id,session_id,side_a_player_1,side_b_player_1,score_a,score_b) values('${gameId}','${id}','${a}','${b}',11,9);`;
const end = (id) => `update public.sessions set ended_at=now(),created_by=auth.uid() where id='${id}';`;

async function hold(command) {
  const child = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });
  const exit = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`Transaction exited ${code}`)));
  });
  await new Promise((resolve, reject) => {
    child.stdout.on("data", (data) => { if (data.toString().includes("locked")) resolve(); });
    child.stderr.on("data", (data) => reject(new Error(data.toString())));
    child.stdin.write(`${auth} begin; ${command}\n\\echo locked\n`);
  });
  return async () => { child.stdin.end("commit;\n"); await exit; };
}

try {
  sql(`insert into public.players(id,display_name) values('${a}','${user.slice(0, 8)} A'),('${b}','${user.slice(0, 8)} B');`);
  const first = session();
  const releaseInsert = await hold(insert(first, randomUUID()));
  try {
    assert.throws(() => sql(`set lock_timeout='250ms'; ${end(first)}`), /lock timeout/);
  } finally { await releaseInsert(); }
  sql(end(first));

  const second = session();
  const releaseEnd = await hold(end(second));
  try {
    assert.throws(() => sql(`set lock_timeout='250ms'; ${insert(second, randomUUID())}`), /lock timeout/);
  } finally { await releaseEnd(); }
  assert.throws(() => sql(insert(second, randomUUID())), /Session has ended/);
  console.log("Both insert/end lock orderings passed.");
} finally {
  sql(`delete from public.players where id in ('${a}','${b}');`);
  if (created.length) sql(`delete from public.sessions where id in (${created.map((id) => `'${id}'`).join(",")});`);
}
