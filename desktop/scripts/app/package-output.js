// Windows CMD AutoRun may print a code-page banner before npm's JSON.
// Parse only the package-manager response; never alter machine configuration.
function parsePackageOutput(output) {
  const clean = output.replace(/^\uFEFF/, '').trim();
  try {
    return JSON.parse(clean);
  } catch {
    /* Prefix banners are handled below. */
  }
  const start = clean.indexOf('{');
  if (start < 0) throw Error('O npm não retornou uma árvore de dependências JSON.');
  return JSON.parse(clean.slice(start));
}
module.exports = { parsePackageOutput };
