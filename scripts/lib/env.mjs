import { readFile } from "node:fs/promises";

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  const separator = trimmed.indexOf("=");
  if (separator < 1) return null;

  const key = trimmed.slice(0, separator).trim();
  let value = trimmed.slice(separator + 1).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return null;

  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    value = value.slice(1, -1);
  }

  return [key, value];
}

/** Load a local .env without overriding variables already exported by the shell. */
export async function loadLocalEnv(path = ".env", environment = process.env) {
  let contents;
  try {
    contents = await readFile(path, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") return;
    throw error;
  }

  for (const line of contents.split(/\r?\n/u)) {
    const entry = parseEnvLine(line);
    if (entry && environment[entry[0]] === undefined) {
      environment[entry[0]] = entry[1];
    }
  }
}
