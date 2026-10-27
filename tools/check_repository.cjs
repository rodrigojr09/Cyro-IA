// Read-only repository checks: version consistency, documentation links and tracked files.
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const version = read("VERSION").trim();
const errors = [];
for (const file of [
  "package.json",
  "cloud/package.json",
  "desktop/package.json",
  "packages/shared/package.json",
]) {
  if (JSON.parse(read(file)).version !== version)
    errors.push(`Versão divergente: ${file}`);
}
for (const file of ["package-lock.json", "desktop/package-lock.json"]) {
  const lock = JSON.parse(read(file));
  if (lock.version !== version || lock.packages[""].version !== version)
    errors.push(`Lock com versão divergente: ${file}`);
}
const tracked = execFileSync("git", ["ls-files", "-z"], {
  cwd: root,
  encoding: "utf8",
})
  .split("\0")
  .filter(Boolean);
for (const file of tracked) {
  if (
    /^Backup\//i.test(file) ||
    /(^|\/)\.env($|\.(?!example$))|\.(sqlite3?|db|pfx|p12|key)$/i.test(file)
  )
    errors.push(`Arquivo privado no índice: ${file}`);
}
const files = execFileSync(
  "git",
  [
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "-z",
    "--",
    "*.md",
  ],
  { cwd: root, encoding: "utf8" },
).split("\0");
let documents = 0;
for (const file of new Set(files)) {
  if (
    !file ||
    file.startsWith("Backup/") ||
    !fs.existsSync(path.join(root, file))
  )
    continue;
  documents++;
  const text = read(file).replace(/```[\s\S]*?```/g, "");
  for (const match of text.matchAll(/\[[^\]\n]*\]\(([^\s)]+)\)/g)) {
    const href = match[1];
    if (/^(?:[a-z][a-z\d+.-]*:|#|\/)/i.test(href)) continue;
    const target = path.resolve(
      root,
      path.dirname(file),
      decodeURIComponent(href.split("#")[0]),
    );
    if (!target.startsWith(root + path.sep) || !fs.existsSync(target))
      errors.push(`Link local inválido: ${file} → ${href}`);
  }
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    `Repositório v${version}: versões, ${documents} documentos e índice sem caminhos privados proibidos: OK.`,
  );
