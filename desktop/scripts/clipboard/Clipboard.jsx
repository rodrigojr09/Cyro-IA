import React, { useEffect, useRef, useState } from 'react';
import { ignoreOwnSelection } from '../shared/bridge';
import { AttachmentCard } from '../attachment/components';
export function Clipboard({
  context,
  canClaim = true,
  onUseText,
  onAttachImage,
  quick = false,
  orb = false,
  baseHeight = 150,
}) {
  useEffect(() => {
    if (orb) return;
    document.addEventListener('copy', ignoreOwnSelection);
    return () => document.removeEventListener('copy', ignoreOwnSelection);
  }, [orb]);
  const bridge = window.jarvisClipboard;
  const [snapshot, setSnapshot] = useState(null),
    [owned, setOwned] = useState(null),
    [sending, setSending] = useState(false);
  const latest = useRef({ context, canClaim, owned, sending }),
    requesting = useRef(false),
    ownedContext = useRef(null),
    area = useRef(null),
    audio = useRef(null);
  latest.current = { context, canClaim, owned, sending };
  const clear = () => {
    setOwned(null);
  };
  const claim = async (value) => {
    const current = latest.current;
    if (
      !bridge ||
      orb ||
      requesting.current ||
      current.sending ||
      !current.canClaim ||
      (!quick && !current.context) ||
      !value?.pending
    )
      return;
    if (current.owned && !quick && ownedContext.current !== current.context) return;
    requesting.current = true;
    try {
      const result = await bridge.claim(current.owned?.id);
      if (result.ok) {
        ownedContext.current = latest.current.context;
        setOwned(result.notification);
      }
    } finally {
      requesting.current = false;
    }
  };
  useEffect(() => {
    if (!bridge) return;
    let active = true,
      value = null;
    const receive = (next) => {
      if (!active) return;
      value = next;
      setSnapshot(next);
      if (
        latest.current.owned &&
        next.owned?.[quick ? 'quick' : 'main'] !== latest.current.owned.id
      )
        clear();
      void claim(next).catch(() => {});
    };
    const unsubscribe = bridge.onState(receive);
    void bridge
      .state()
      .then(receive)
      .catch(() => {});
    const focus = () => {
      let tries = 0;
      const run = () => {
        void claim(value).catch(() => {});
        if (active && ++tries < 5) timer = setTimeout(run, 100);
      };
      run();
    };
    let timer;
    window.addEventListener('focus', focus);
    window.addEventListener('focusin', focus);
    document.addEventListener('visibilitychange', focus);
    const sound =
      orb || quick
        ? null
        : bridge.onSound?.(({ source, volume }) => {
            audio.current?.pause();
            audio.current = new Audio(source);
            audio.current.volume = volume;
            void audio.current.play().catch(() => {});
          });
    return () => {
      active = false;
      clearTimeout(timer);
      if (typeof unsubscribe === 'function') unsubscribe();
      if (typeof sound === 'function') sound();
      window.removeEventListener('focus', focus);
      window.removeEventListener('focusin', focus);
      document.removeEventListener('visibilitychange', focus);
      audio.current?.pause();
      if (latest.current.owned) void bridge.dismiss(latest.current.owned.id).catch(() => {});
    };
  }, [bridge, orb, quick]);
  useEffect(() => {
    if (canClaim) void claim(snapshot).catch(() => {});
  }, [context, canClaim, snapshot]);
  useEffect(() => {
    if (quick && area.current)
      void window.quick
        .resizeInput(
          Math.max(
            baseHeight,
            Math.min(480, baseHeight + Math.ceil(area.current.getBoundingClientRect().height) + 20),
          ),
        )
        .catch(() => {});
  }, [quick, owned, baseHeight]);
  if (orb) return <i id="clipboard-dot" hidden={!snapshot?.pending} aria-hidden="true" />;
  const same = quick || ownedContext.current === context;
  return (
    <section className="clipboard-area" ref={area} hidden={!owned && !snapshot?.pending}>
      <button
        id="clipboard-pending"
        hidden={!snapshot?.pending || !!owned}
        onClick={() => void claim(snapshot)}
      >
        Ver conteúdo copiado
      </button>
      {owned && same && (
        <div id="clipboard-card" aria-label="Sugestão de anexo">
          <AttachmentCard
            key={owned.id}
            file={{
              id: owned.id,
              name: owned.contentType === 'image' ? 'Imagem copiada (prévia)' : 'Texto copiado',
              kind: owned.contentType,
              size:
                owned.contentType === 'image'
                  ? Math.floor((owned.imageData.split(',')[1].length * 3) / 4)
                  : new TextEncoder().encode(owned.text || '').length,
            }}
            heading={
              <span id="clipboard-label">
                {
                  {
                    text: 'Texto copiado',
                    code: 'Código copiado',
                    link: 'Link copiado',
                    image: 'Imagem copiada',
                  }[owned.contentType]
                }
              </span>
            }
            onRemove={async () => {
              if (sending) return;
              await bridge.dismiss(owned.id);
              clear();
            }}
            removeId="clipboard-ignore"
            imageId="clipboard-image"
            previewSource={owned.contentType === 'image' ? owned.imageData : null}
            suggestion
            text={owned.contentType === 'image' ? undefined : owned.text || ''}
            busy={sending}
            onUse={async () => {
              if (sending || (!quick && ownedContext.current !== context)) return;
              setSending(true);
              try {
                const result =
                  owned.contentType === 'image'
                    ? await onAttachImage?.(owned.imageData)
                    : await onUseText?.(owned.text || '');
                if (result !== true)
                  throw Error(
                    owned.contentType === 'image' && !onAttachImage
                      ? 'Use a imagem no chat principal.'
                      : 'Não foi possível usar o conteúdo. Confira o limite de 5 anexos e tente novamente.',
                  );
                await bridge.dismiss(owned.id);
                clear();
              } finally {
                setSending(false);
              }
            }}
            privacy="Prévia local. O conteúdo pode conter dados sensíveis. Nada é enviado automaticamente."
          />
        </div>
      )}
    </section>
  );
}
export function ClipboardSettings() {
  const bridge = window.jarvisClipboard;
  const [settings, setSettings] = useState(null),
    [status, setStatus] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void bridge
      ?.state()
      .then((value) => active && setSettings(value.settings))
      .catch((error) => active && setStatus(error.message));
    return () => {
      active = false;
    };
  }, [bridge]);
  async function update(change) {
    setBusy(true);
    try {
      const result = await bridge.configure(change);
      setSettings(result.settings);
      setStatus(result.settings.enabled ? 'Preferências salvas.' : 'Monitoramento desativado.');
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <h3>Área de transferência</h3>
      <p>
        Com sua autorização, o Cyro verifica textos, códigos, links e imagens localmente. Nada é
        enviado automaticamente. Cópias ficam apenas em memória por até 10 minutos. Revise antes de
        enviar; filtros preventivos não garantem a detecção de credenciais.
      </p>
      {settings && (
        <>
          <label>
            <input
              id="clipboard-consent"
              type="checkbox"
              checked={settings.enabled}
              onChange={(event) => setSettings({ ...settings, enabled: event.target.checked })}
            />
            Autorizo o monitoramento local da área de transferência
          </label>
          <label>
            <input
              id="clipboard-sound-setting"
              type="checkbox"
              checked={settings.sound}
              onChange={(event) => setSettings({ ...settings, sound: event.target.checked })}
            />
            Som de notificação (respeita a voz global)
          </label>
          <label>
            Volume (%)
            <input
              id="clipboard-volume"
              type="number"
              min={0}
              max={100}
              value={Math.round(settings.volume * 100)}
              onChange={(event) =>
                setSettings({ ...settings, volume: Number(event.target.value) / 100 })
              }
            />
          </label>
          <button id="clipboard-save" disabled={busy} onClick={() => update(settings)}>
            Salvar preferências
          </button>
          <button
            id="clipboard-pause"
            disabled={busy}
            onClick={() => update({ paused: !settings.paused })}
          >
            {settings.paused ? 'Retomar' : 'Pausar'}
          </button>
          <button id="clipboard-disable" disabled={busy} onClick={() => update({ enabled: false })}>
            Desativar e limpar
          </button>
          <button
            id="clipboard-discard"
            disabled={busy}
            onClick={() => void bridge.discard().catch((error) => setStatus(error.message))}
          >
            Descartar cópia pendente
          </button>
        </>
      )}
      <p id="clipboard-settings-status" role="status">
        {status}
      </p>
    </section>
  );
}
