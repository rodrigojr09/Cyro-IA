import React, { useEffect, useRef, useState } from 'react';
import { ClipboardSettings } from '../clipboard/Clipboard';
import { Integrations } from '../integrations/Integrations';
import { Storage } from '../storage/Storage';
import { Computer } from '../computer/Computer';
export function Settings({
  open,
  onClose,
  workspace,
  state,
  preferences,
  onPreferences,
  onRun,
  onView,
}) {
  const page = useRef(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    const siblings = [...page.current.parentElement.children]
      .filter((node) => node !== page.current)
      .map((node) => [node, node.hasAttribute('inert')]);
    siblings.forEach(([node]) => node.setAttribute('inert', ''));
    page.current.focus();
    return () => {
      siblings.forEach(([node, wasInert]) => {
        if (!wasInert) node.removeAttribute('inert');
      });
      if (previous?.isConnected) previous.focus();
    };
  }, [open]);
  const [category, setCategory] = useState('Aparência'),
    [quick, setQuick] = useState(null),
    [status, setStatus] = useState('');
  const perform = async (fn) => {
    try {
      return await fn();
    } catch (error) {
      setStatus(error.message);
    }
  };
  const categories = [
    'Aparência',
    'Voz',
    'Armazenamento',
    'Chats arquivados',
    'Quick Chat',
    'Área de transferência',
    'Integrações',
    'Computador',
    'Conta',
    'Sobre',
  ];
  useEffect(() => {
    if (!open) return;
    setStatus('');
    if (category === 'Armazenamento')
      void workspace.storage().catch((error) => setStatus(error.message));
    if (category === 'Quick Chat')
      void window.jarvisWindow
        .quickSettings()
        .then(setQuick)
        .catch((error) => setStatus(error.message));
  }, [open, category]);
  return (
    <section
      id="settings-dialog"
      ref={page}
      hidden={!open}
      tabIndex={-1}
      aria-labelledby="settings-heading"
      className={'settings-page' + (category === 'Integrações' ? ' settings-integrations' : '')}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <header className="dialog-header settings-page-header">
        <div>
          <p>CYRO IA</p>
          <h1 id="settings-heading">Configurações</h1>
        </div>
        <button type="button" onClick={onClose}>
          Voltar ao chat
        </button>
      </header>
      {open && (
        <div className="settings-layout">
          <nav id="settings-tabs" aria-label="Categorias de configurações">
            {categories.map((name) => (
              <button
                className={name === category ? 'active' : ''}
                aria-current={name === category ? 'page' : undefined}
                key={name}
                onClick={() => setCategory(name)}
              >
                {name}
              </button>
            ))}
          </nav>
          <div id="settings-content">
            <SettingsSectionBoundary key={category}>
              {category === 'Aparência' && (
                <>
                  <h3>Aparência</h3>
                  <label>
                    Tema
                    <select
                      id="setting-theme"
                      value={preferences.theme}
                      onChange={(event) => onPreferences({ theme: event.target.value })}
                    >
                      <option value="dark">Cyro Dark</option>
                      <option value="light">Claro</option>
                    </select>
                  </label>
                  <label>
                    <input
                      id="setting-large"
                      type="checkbox"
                      checked={preferences.largeText}
                      onChange={(event) => onPreferences({ largeText: event.target.checked })}
                    />
                    Texto maior
                  </label>
                  <button
                    id="setting-sidebar"
                    onClick={() => onPreferences({ collapsed: !preferences.collapsed })}
                  >
                    Recolher ou expandir barra lateral
                  </button>
                </>
              )}
              {category === 'Voz' && (
                <>
                  <h3>Voz</h3>
                  <label>
                    <input
                      id="setting-voice"
                      type="checkbox"
                      checked={preferences.voice}
                      onChange={(event) => onPreferences({ voice: event.target.checked })}
                    />
                    Ler respostas em voz alta
                  </label>
                  <p>
                    A voz usa o serviço Cloud quando você envia uma mensagem. A entrada pelo
                    microfone depende de autorização.
                  </p>
                </>
              )}
              {category === 'Armazenamento' && (
                <Storage
                  snapshot={state.storage}
                  busy={state.busy || state.loading}
                  onClear={(scope) =>
                    perform(async () => {
                      const result = await window.jarvisWindow.clearStorage(scope);
                      if (result.canceled) return;
                      if (!result.ok) throw Error(result.data?.detail);
                      await workspace.storage();
                      await workspace.catalog('', null);
                      onClose();
                    })
                  }
                />
              )}
              {category === 'Chats arquivados' && (
                <>
                  <h3>Chats arquivados</h3>
                  <div id="archived-list">
                    {state.chats
                      .filter((item) => item.archived)
                      .map((item) => (
                        <div className="archived-chat-row" key={item.id}>
                          <span>{item.title}</span>
                          <button
                            disabled={state.busy}
                            onClick={() =>
                              perform(async () => {
                                const result = await window.jarvisWindow.manageChat(
                                  item.id,
                                  'restore',
                                );
                                if (result?.ok === false) throw Error(result.data?.detail);
                                await workspace.catalog();
                              })
                            }
                          >
                            Restaurar
                          </button>
                        </div>
                      ))}
                    {!state.chats.some((item) => item.archived) && (
                      <p>Nenhuma conversa arquivada.</p>
                    )}
                  </div>
                </>
              )}
              {category === 'Quick Chat' && quick && (
                <>
                  <h3>Quick Chat</h3>
                  <p>O ícone permanece disponível sobre as janelas. Use Escape para recolher.</p>
                  {[
                    ['opacity', 'Opacidade dos painéis (%)', 40, 95],
                    ['wpm', 'Palavras por minuto', 80, 600],
                    ['minSeconds', 'Tempo mínimo (segundos)', 3, 60],
                    ['maxSeconds', 'Tempo máximo (segundos)', 3, 120],
                  ].map(([key, label, min, max]) => (
                    <label key={key}>
                      {label}
                      <input
                        id={
                          {
                            opacity: 'quick-opacity',
                            wpm: 'quick-wpm',
                            minSeconds: 'quick-min',
                            maxSeconds: 'quick-max',
                          }[key]
                        }
                        type="number"
                        min={min}
                        max={max}
                        value={key === 'opacity' ? Math.round(quick[key] * 100) : quick[key]}
                        onChange={(event) =>
                          setQuick({
                            ...quick,
                            [key]: Number(event.target.value) / (key === 'opacity' ? 100 : 1),
                          })
                        }
                      />
                    </label>
                  ))}
                  <label>
                    <input
                      id="quick-voice"
                      type="checkbox"
                      checked={quick.voice}
                      onChange={(event) => setQuick({ ...quick, voice: event.target.checked })}
                    />
                    Respostas faladas (respeita a voz global)
                  </label>
                  <button
                    id="quick-save"
                    onClick={() =>
                      perform(async () => {
                        await window.jarvisWindow.configureQuick({
                          opacity: quick.opacity,
                          wpm: quick.wpm,
                          minSeconds: quick.minSeconds,
                          maxSeconds: quick.maxSeconds,
                          voice: quick.voice,
                          closeToTray: false,
                        });
                        onClose();
                      })
                    }
                  >
                    Salvar preferências
                  </button>
                </>
              )}
              {category === 'Área de transferência' && <ClipboardSettings />}
              {category === 'Integrações' && <Integrations />}
              {category === 'Computador' && <Computer />}
              {category === 'Conta' && (
                <>
                  <h3>Conta e acesso</h3>
                  <p>
                    Acesso, modelos e limites são gerenciados no painel administrativo. Use Sair da
                    conta para trocar de usuário.
                  </p>
                  <button onClick={() => perform(() => window.jarvisAuth.logout())}>
                    Sair da conta
                  </button>
                </>
              )}
              {category === 'Sobre' && (
                <>
                  <h3>Sobre o Cyro IA</h3>
                  <p>Versão 6.1.1</p>
                  <p>
                    Desenvolvido por <strong>Rodrigo Junior</strong>.
                  </p>
                  <p>Contato: rodrigo.macia019@gmail.com</p>
                  <button
                    id="about-github"
                    onClick={() =>
                      perform(() => window.jarvisWindow.openLink('https://github.com/rodrigojr09'))
                    }
                  >
                    GitHub: rodrigojr09
                  </button>
                  <p>© 2026 Rodrigo Junior.</p>
                </>
              )}
              <p id="settings-status" role="status">
                {status}
              </p>
            </SettingsSectionBoundary>
          </div>
        </div>
      )}
    </section>
  );
}

export class SettingsSectionBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <section role="alert">
          <p>Não foi possível abrir esta seção. Tente novamente ou escolha outra categoria.</p>
          <button id="settings-retry-section" onClick={() => this.setState({ failed: false })}>
            Tentar novamente
          </button>
        </section>
      );
    return this.props.children;
  }
}
