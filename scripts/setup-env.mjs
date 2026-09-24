#!/usr/bin/env node
// Creates .env from .env.example with fresh random secrets and Supabase API keys
// (HS256 JWTs signed with JWT_SECRET).
// Usage: node scripts/setup-env.mjs [--force] [--out <file>]   (default file: .env)
import { createHmac, randomBytes } from "node:crypto"
import { existsSync, readFileSync, writeFileSync } from "node:fs"

const force = process.argv.includes("--force")
const outIndex = process.argv.indexOf("--out")
const out = outIndex > 0 ? process.argv[outIndex + 1] : ".env"
if (existsSync(out) && !force) {
  console.error(`${out} already exists. Re-run with --force to overwrite it (this rotates every secret).`)
  process.exit(1)
}

// Hex keeps secrets safe inside URLs and shell/compose interpolation.
const secret = (bytes) => randomBytes(bytes).toString("hex")
const b64url = (v) => Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString("base64url")

function jwt(payload, key) {
  const head = b64url({ alg: "HS256", typ: "JWT" })
  const body = b64url(payload)
  const sig = createHmac("sha256", key).update(`${head}.${body}`).digest("base64url")
  return `${head}.${body}.${sig}`
}

const JWT_SECRET = secret(32)
const iat = Math.floor(Date.now() / 1000)
const exp = iat + 10 * 365 * 24 * 3600

const values = {
  POSTGRES_PASSWORD: secret(24),
  JWT_SECRET,
  ANON_KEY: jwt({ role: "anon", iss: "supabase", iat, exp }, JWT_SECRET),
  SERVICE_ROLE_KEY: jwt({ role: "service_role", iss: "supabase", iat, exp }, JWT_SECRET),
  DASHBOARD_PASSWORD: secret(12),
  PG_META_CRYPTO_KEY: secret(32),
  VOTER_SALT: secret(24),
  ADMIN_PASSWORD: secret(9),
  BACKUP_ENCRYPTION_KEY: secret(32),
}

let env = readFileSync(".env.example", "utf8")
for (const [k, v] of Object.entries(values)) {
  env = env.replace(new RegExp(`^${k}=.*$`, "m"), `${k}=${v}`)
}
// Resolve ${VAR} references so the file works for tools that don't expand variables.
env = env.replace(/\$\{(\w+)\}/g, (m, k) => values[k] ?? m)

writeFileSync(out, env, { mode: 0o600 })
console.log(`Wrote ${out} with fresh secrets.\n`)
console.log(`  First admin:     ${/^ADMIN_EMAIL=(.*)$/m.exec(env)[1]} / ${values.ADMIN_PASSWORD}`)
console.log(`  Studio login:    supabase / ${values.DASHBOARD_PASSWORD}  (http://localhost:8000)`)
console.log(`\nEdit ADMIN_EMAIL, SITE_URL and the domains in ${out} before deploying.`)
