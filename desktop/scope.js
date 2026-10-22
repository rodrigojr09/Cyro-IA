// Prévia local: apenas metadados; a análise começa somente no botão de salvar.
window.jarvisScope = (() => {
  let owner,
    include = new Set(),
    exclude = new Set(),
    current = '.',
    nextOffset = null,
    rows = [],
    saving = false,
    onSaved;
  const el = (id) => document.getElementById(id);
  const beneath = (path, parent) =>
    parent === '.' ||
    path.toLowerCase() === parent.toLowerCase() ||
    path.toLowerCase().startsWith(parent.toLowerCase() + '/');
  function selected(path) {
    const matches = [
      ...[...include].map((rule) => ({ rule, yes: true })),
      ...[...exclude].map((rule) => ({ rule, yes: false })),
    ]
      .filter((item) => beneath(path, item.rule))
      .sort((a, b) => b.rule.length - a.rule.length);
    return matches[0]?.yes || false;
  }
  function refresh() {
    for (const row of rows) {
      row.checkbox.checked = selected(row.path) && !row.disabled;
      row.checkbox.indeterminate =
        !row.disabled &&
        [...include, ...exclude].some(
          (rule) =>
            rule !== row.path && beneath(rule, row.path) && selected(rule) !== selected(row.path),
        );
    }
    el('scope-summary').textContent =
      `${include.size} inclusão(ões), ${exclude.size} exclusão(ões). Máximo: 5 MB no total. Seleção local: zero tokens.`;
  }
  async function check(projectId, selection = null) {
    const data = await api('/projects/selection/size', {
      method: 'POST',
      body: JSON.stringify({ project_id: projectId, ...(selection || {}) }),
    });
    if (!Number.isFinite(data.selected_bytes) || !Number.isFinite(data.max_bytes))
      throw new Error('Não foi possível conferir o tamanho dos arquivos.');
    if (!data.within_limit || data.selected_bytes > data.max_bytes)
      throw new Error(
        `A seleção tem ${(data.selected_bytes / 1048576).toFixed(2)} MB e ultrapassa o limite de 5 MB. Remova arquivos antes de enviar.`,
      );
    return data;
  }
  function choose(path, checked) {
    for (const rules of [include, exclude])
      for (const rule of [...rules]) if (beneath(rule, path)) rules.delete(rule);
    if (checked) include.add(path);
    else exclude.add(path);
    refresh();
  }
  async function load(path = '.', append = false) {
    el('scope-error').textContent = 'Listando nomes e tamanhos...';
    const offset = append ? nextOffset : 0;
    const data = await api(
      '/projects/selection?project_id=' +
        encodeURIComponent(owner.id) +
        '&path=' +
        encodeURIComponent(path) +
        '&offset=' +
        (offset || 0),
    );
    if (!append) {
      current = path;
      rows = [];
      el('scope-list').replaceChildren();
    }
    nextOffset = data.next_offset;
    el('scope-location').textContent = owner.name + ' / ' + (path === '.' ? 'raiz' : path);
    for (const item of data.entries) {
      const row = document.createElement('div');
      row.className = 'scope-row';
      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.disabled = item.disabled;
      const name = document.createElement('span');
      name.textContent = item.name + (item.type === 'directory' ? '/' : '');
      label.appendChild(checkbox);
      label.appendChild(name);
      row.appendChild(label);
      if (item.disabled) {
        const reason = document.createElement('small');
        reason.textContent = item.reason;
        row.appendChild(reason);
      } else if (item.type === 'directory') {
        const open = document.createElement('button');
        open.textContent = 'Abrir';
        open.onclick = async () => {
          try {
            await load(item.path);
          } catch (error) {
            el('scope-error').textContent = error.message;
          }
        };
        row.appendChild(open);
      }
      checkbox.onchange = () => choose(item.path, checkbox.checked);
      rows.push({ path: item.path, checkbox, disabled: item.disabled });
      el('scope-list').appendChild(row);
    }
    el('scope-more').hidden = nextOffset === null;
    el('scope-up').disabled = current === '.';
    el('scope-error').textContent = data.truncated
      ? 'Listagem parcial. Abra subpastas ou carregue a próxima página.'
      : '';
    refresh();
  }
  async function open(project, callback) {
    if (saving) return;
    owner = project;
    onSaved = callback;
    el('scope-dialog').showModal();
    el('scope-save').disabled = true;
    try {
      const data = await api('/projects/selection?project_id=' + encodeURIComponent(owner.id));
      include = new Set(data.selection.confirmed ? data.selection.include : ['.']);
      exclude = new Set(data.selection.confirmed ? data.selection.exclude : []);
      el('scope-save').onclick = async () => {
        if (saving) return;
        saving = true;
        el('scope-save').disabled = true;
        try {
          const size = await check(owner.id, { include: [...include], exclude: [...exclude] });
          el('scope-summary').textContent =
            `${(size.selected_bytes / 1048576).toFixed(2)} MB de 5 MB. Seleção local: zero tokens.`;
          const result = await api('/projects/selection/save', {
            method: 'POST',
            body: JSON.stringify({
              project_id: owner.id,
              include: [...include],
              exclude: [...exclude],
            }),
          });
          el('scope-dialog').close();
          if (onSaved) await onSaved(result);
        } catch (error) {
          el('scope-error').textContent = error.message;
        } finally {
          saving = false;
          el('scope-save').disabled = false;
        }
      };
      el('scope-all').onclick = () => choose(current, true);
      el('scope-none').onclick = () => choose(current, false);
      el('scope-cancel').onclick = () => {
        if (!saving) el('scope-dialog').close();
      };
      el('scope-up').onclick = async () => {
        try {
          await load(current.includes('/') ? current.slice(0, current.lastIndexOf('/')) : '.');
        } catch (error) {
          el('scope-error').textContent = error.message;
        }
      };
      el('scope-more').onclick = async () => {
        try {
          await load(current, true);
        } catch (error) {
          el('scope-error').textContent = error.message;
        }
      };
      await load('.');
      el('scope-save').disabled = false;
    } catch (error) {
      el('scope-error').textContent = error.message;
      el('scope-cancel').onclick = () => el('scope-dialog').close();
    }
  }
  return { open, check };
})();
