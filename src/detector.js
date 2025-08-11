import fs from "fs";

const CONFIG_PATHS = [
  "configs/env.dev.json",
  "configs/env.staging.json",
  "configs/env.prod.json",
];

const RULES_PATH = "rules.json";

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const typeOf = (v) => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v);

function loadAll() {
  const envs = {};
  for (const p of CONFIG_PATHS) {
    if (!fs.existsSync(p)) {
      console.error(`❌ Missing: ${p}`);
      process.exit(2);
    }
    const name = p.match(/env\.(\w+)\.json$/)[1];
    envs[name] = readJson(p);
  }
  const rules = fs.existsSync(RULES_PATH)
    ? readJson(RULES_PATH)
    : { mustMatchAcross: [], requiredKeys: [], forbiddenKeys: [] };
  return { envs, rules };
}

function compareEnvs(envs, rules) {
  const names = Object.keys(envs);
  const allKeys = new Set();
  names.forEach(n => Object.keys(envs[n]).forEach(k => allKeys.add(k)));

  const issues = { critical: [], warnings: [] };

  for (const req of (rules.requiredKeys || [])) {
    for (const n of names) {
      if (!(req in envs[n])) issues.critical.push(`[Missing] ${req} is missing in ${n}`);
    }
  }

  for (const forb of (rules.forbiddenKeys || [])) {
    for (const n of names) {
      if (forb in envs[n]) issues.warnings.push(`[Forbidden] ${forb} exists in ${n}`);
    }
  }

  for (const key of allKeys) {
    const present = names.filter(n => key in envs[n]);
    if (present.length !== names.length) {
      const missing = names.filter(n => !(key in envs[n]));
      issues.critical.push(`[Mismatch] ${key} missing in: ${missing.join(", ")}`);
      continue;
    }
    const types = names.map(n => typeOf(envs[n][key]));
    const uniqueTypes = [...new Set(types)];
    if (uniqueTypes.length > 1) {
      issues.critical.push(
        `[Type Drift] ${key} types differ: ${names.map((n,i)=>`${n}:${types[i]}`).join(" | ")}`
      );
    }
  }

  for (const key of (rules.mustMatchAcross || [])) {
    const values = names.map(n => envs[n][key]);
    const uniqueVals = [...new Set(values.map(v => JSON.stringify(v)))];
    if (uniqueVals.length > 1) {
      issues.warnings.push(
        `[Value Drift] ${key} should match across envs but differs: ${names.map((n,i)=>`${n}:${values[i]}`).join(" | ")}`
      );
    }
  }

  return issues;
}

function printReport(issues) {
  const lines = [];
  lines.push("# Shadow Config Detector Report\n");
  if (!issues.critical.length && !issues.warnings.length) {
    lines.push("✅ No issues found.\n");
  } else {
    if (issues.critical.length) {
      lines.push("## ❌ Critical\n");
      for (const c of issues.critical) lines.push(`- ${c}`);
      lines.push("");
    }
    if (issues.warnings.length) {
      lines.push("## ⚠ Warnings\n");
      for (const w of issues.warnings) lines.push(`- ${w}`);
      lines.push("");
    }
  }
  const out = lines.join("\n");
  fs.mkdirSync("reports", { recursive: true });
  fs.writeFileSync("reports/config-report.md", out);
  console.log(out);
}

const { envs, rules } = loadAll();
const issues = compareEnvs(envs, rules);
printReport(issues);
if (issues.critical.length) process.exit(1);
