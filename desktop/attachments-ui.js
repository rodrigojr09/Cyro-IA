window.jarvisAttachments = (() => {
  const el = (id) => document.getElementById(id);
  let pending = [],
    busy = false,
    choosing = false,
    epoch = 0;
  function report(message) {
    el('attachment-error').textContent = message || '';
  }
  function card(file, removable = false) {
    const item = document.createElement('div');
    item.className = 'attachment-card';
    if (file.preview) {
      const image = document.createElement('img');
      image.src = file.preview;
      image.alt = 'Prévia de ' + file.name;
      item.appendChild(image);
    }
    const name = document.createElement('span');
    name.textContent =
      file.name +
      ' · ' +
      (file.size / 1048576).toFixed(2) +
      ' MB' +
      (file.partial ? ' · Leitura parcial' : '');
    item.appendChild(name);
    const action = document.createElement('button');
    action.type = 'button';
    action.textContent = removable ? 'Remover' : 'Salvar cópia';
    action.disabled = removable && busy;
    action.onclick = async () => {
      if (removable) {
        if (busy) return;
        pending = pending.filter((value) => value.id !== file.id);
        render();
        await window.jarvisWindow.discardAttachment(file.id).catch(() => {});
        return;
      }
      try {
        const result = await window.jarvisWindow.saveAttachment(file.id);
        if (!result.canceled && !result.ok)
          throw Error(result.data?.detail || 'Anexo indisponível neste computador.');
      } catch (error) {
        report(error.message);
      }
    };
    item.appendChild(action);
    if (!removable && file.kind === 'image') {
      const preview = document.createElement('button');
      preview.type = 'button';
      preview.textContent = 'Ver prévia';
      preview.onclick = async () => {
        try {
          const result = await window.jarvisWindow.attachmentInfo(file.id);
          if (!result.ok)
            throw Error(result.data?.detail || 'Imagem indisponível neste computador.');
          if (!item.querySelector?.('img') && result.data.preview) {
            const image = document.createElement('img');
            image.src = result.data.preview;
            image.alt = 'Prévia de ' + file.name;
            item.appendChild(image);
          }
        } catch (error) {
          report(error.message);
        }
      };
      item.appendChild(preview);
    }
    return item;
  }
  function render() {
    el('attachment-list').replaceChildren();
    for (const file of pending) el('attachment-list').appendChild(card(file, true));
    el('attach-files').disabled = busy || choosing || pending.length >= 5;
  }
  el('attach-files').onclick = async () => {
    if (busy || choosing || pending.length >= 5) return;
    choosing = true;
    render();
    report('');
    const selectionEpoch = epoch;
    try {
      const result = await window.jarvisWindow.chooseAttachments(5 - pending.length);
      if (result.canceled) return;
      if (!result.ok) throw Error(result.data?.detail || 'Não foi possível anexar os arquivos.');
      const files = result.data.files;
      if (selectionEpoch !== epoch) {
        for (const file of files || [])
          void window.jarvisWindow.discardAttachment(file.id).catch(() => {});
        return;
      }
      if (
        !Array.isArray(files) ||
        files.some((file) => file.size > 5242880) ||
        pending.length + files.length > 5
      )
        throw Error('Limite de 5 arquivos com até 5 MB cada.');
      pending.push(...files);
    } catch (error) {
      report(error.message);
    } finally {
      choosing = false;
      render();
    }
  };
  return {
    ids: () => pending.map((file) => file.id),
    has: () => pending.length > 0,
    loading: () => choosing,
    clear() {
      epoch++;
      const old = pending;
      pending = [];
      report('');
      render();
      for (const file of old) void window.jarvisWindow.discardAttachment(file.id).catch(() => {});
    },
    selected: () => pending.slice(),
    busy(value) {
      busy = value;
      render();
    },
    renderHistory(container, files, unavailable = false) {
      if (!files?.length && !unavailable) return;
      const list = document.createElement('div');
      list.className = 'attachment-list';
      for (const file of files || []) list.appendChild(card(file));
      if (unavailable) {
        const notice = document.createElement('p');
        notice.className = 'attachment-unavailable';
        notice.textContent = 'Salvo localmente em outro Computador';
        list.appendChild(notice);
      }
      container.appendChild(list);
    },
  };
})();
