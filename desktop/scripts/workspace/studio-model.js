const extensions = {
  python: 'py',
  py: 'py',
  javascript: 'js',
  js: 'js',
  node: 'js',
  html: 'html',
  htm: 'html',
  css: 'css',
  json: 'json',
  markdown: 'md',
  md: 'md',
  bash: 'sh',
  sh: 'sh',
  shell: 'sh',
  typescript: 'ts',
  ts: 'ts',
};
function languageFor(name) {
  const ext = String(name).split('.').pop().toLowerCase();
  return (
    {
      py: 'python',
      js: 'javascript',
      cjs: 'javascript',
      html: 'xml',
      htm: 'xml',
      css: 'css',
      json: 'json',
      md: 'markdown',
      sh: 'bash',
      ts: 'typescript',
    }[ext] || 'plaintext'
  );
}
function filenameFor(language, stem = 'cyro') {
  return stem + '.' + (extensions[String(language).toLowerCase()] || 'txt');
}
function safeFilename(name) {
  let value =
    String(name)
      .replace(/[^a-zA-Z0-9_.-]/g, '_')
      .replace(/\.\./g, '_')
      .replace(/^\.+/, '')
      .replace(/\.+$/, '')
      .slice(0, 95) || 'arquivo.txt';
  if (/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(value)) value = 'arquivo-' + value;
  return value;
}
function uniqueFilename(files, name, content, reuse = true) {
  const base = safeFilename(name),
    dot = base.lastIndexOf('.');
  let current = base,
    count = 1;
  while (files.some((f) => f.name === current && (!reuse || f.content !== content))) {
    count++;
    current =
      (dot > 0 ? base.slice(0, dot) : base) + '-' + count + (dot > 0 ? base.slice(dot) : '');
  }
  return current;
}
function csvFor(table) {
  return [table.columns, ...table.rows]
    .map((row) =>
      row
        .map((cell) => {
          let value = String(cell ?? '');
          if (typeof cell === 'string' && /^(?:\s*[=+@-]|[\t\r])/.test(value)) value = "'" + value;
          return '"' + value.replaceAll('"', '""') + '"';
        })
        .join(','),
    )
    .join('\r\n');
}
function executionLabel(item) {
  return item.result
    ? item.result.timedOut
      ? 'Tempo excedido'
      : item.result.exitCode === 0
        ? 'Concluído'
        : 'Com erro'
    : 'Aguardando autorização';
}
module.exports = { languageFor, filenameFor, safeFilename, uniqueFilename, csvFor, executionLabel };
