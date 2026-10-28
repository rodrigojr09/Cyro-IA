import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createWorkspace } from '../workspace/store';
import { createWriter } from '../writer/store';
import { WriterPreview, WriterDivider } from '../writer/WriterPreview';
import { WriterLibrary } from '../writer/WriterLibrary';
import { ScopeDialog } from '../workspace/ScopeDialog';
import { Settings } from '../ui/Settings';
import { Dialog, Markdown } from '../ui/components';
import { api, post, publicError } from '../shared/bridge';
import { useSpeaker, useDictation } from '../voice/hooks';
import { usePreferences } from '../ui/preferences';
import { useAttachments } from '../attachment/components';
import { Sidebar } from '../workspace/Sidebar';
import { Welcome } from '../workspace/Welcome';
import { Conversation } from '../chat/Conversation';
import { Composer } from '../chat/Composer';
import { Icon } from '../ui/Icon';

export function App({ workspace: providedWorkspace, writer: providedWriter }) {
  const [workspace] = useState(() => providedWorkspace || createWorkspace()),
    [writer] = useState(() => providedWriter || createWriter());
  const state = useSyncExternalStore(workspace.subscribe, workspace.get),
    writerState = useSyncExternalStore(writer.subscribe, writer.get);
  const [preferences, setPreferences] = usePreferences(state.settings),
    speaker = useSpeaker(preferences.voice),
    attachments = useAttachments();
  const [input, setInput] = useState(''),
    [submitting, setSubmitting] = useState(false),
    [search, setSearch] = useState(''),
    [expanded, setExpanded] = useState(new Set()),
    [settings, setSettings] = useState(false),
    [scope, setScope] = useState(null),
    [manage, setManage] = useState(false),
    [projectSettings, setProjectSettings] = useState(false),
    [showPreview, setShowPreview] = useState(true),
    [documentExpanded, setDocumentExpanded] = useState(false),
    [knowledge, setKnowledge] = useState(null),
    [menu, setMenu] = useState(null),
    [library, setLibrary] = useState(null),
    [openRequest, setOpenRequest] = useState(0),
    [ask, setAsk] = useState(null),
    [draftSettings, setDraftSettings] = useState({}),
    [note, setNote] = useState('');
  const inputRef = useRef(null),
    askResolve = useRef(null),
    pendingOpen = useRef(null),
    sending = useRef(false);
  const isWriter = !!state.chat?.writer_document_id;
  const busy = state.busy || state.loading || writerState.busy || writerState.loading;
  const canSend =
    !submitting &&
    workspace.canSend() &&
    !writerState.busy &&
    !writerState.loading &&
    (!isWriter || !!writerState.document) &&
    !attachments.choosing;
  const status = state.error || (isWriter ? writerState.error || writerState.status : state.status);
  const rows = isWriter ? writerState.messages : state.messages.slice(-state.visible);
  const run = async (fn) => {
    try {
      return await fn();
    } catch (error) {
      workspace.set({ error: publicError(error) });
      return undefined;
    }
  };
  run.ask = (title, value = '', description = '') =>
    new Promise((resolve) => {
      askResolve.current = resolve;
      setAsk({ title, value, description });
    });
  const closeAsk = (value) => {
    setAsk(null);
    askResolve.current?.(value);
    askResolve.current = null;
  };
  async function navigate(projectId = '', chatId = null) {
    if (busy) return;
    speaker.stop();
    await writer.leave();
    attachments.clear();
    setInput('');
    setMenu(null);
    await workspace.view(projectId, chatId);
  }
  async function createChat(projectId = state.project?.id || '') {
    if (busy) return;
    await writer.leave();
    speaker.stop();
    attachments.clear();
    setInput('');
    await workspace.newChat(projectId);
    setMenu(null);
  }
  async function send(text = input, expectedContext = null) {
    const context = state.chat?.id || 'draft:' + (state.project?.id || 'general');
    if (sending.current || !canSend || (expectedContext && expectedContext !== context))
      return false;
    if (expectedContext && attachments.files.length) return false;
    const question = text.trim() || (attachments.files.length ? 'Analise os anexos.' : '');
    if (!question || question.length > 6000) return false;
    sending.current = true;
    setSubmitting(true);
    speaker.stop();
    if (!expectedContext) setInput('');
    try {
      const result = await (isWriter
        ? writer.send(question)
        : workspace.send(question, attachments.files));
      if (!result) {
        if (!expectedContext) setInput((value) => value || text);
        return false;
      }
      attachments.clear();
      if (preferences.voice)
        try {
          await speaker.speak(result.speech_text || result.reply);
        } catch {
          workspace.set({ status: 'Áudio indisponível. A resposta continua disponível.' });
        }
      return true;
    } catch (error) {
      workspace.set({ error: publicError(error) });
      if (!expectedContext) setInput((value) => value || text);
      return false;
    } finally {
      sending.current = false;
      setSubmitting(false);
      inputRef.current?.focus();
    }
  }
  const dictation = useDictation(
    (text) => setInput((value) => value + (value ? ' ' : '') + text),
    (status) => workspace.set({ status, error: '' }),
  );
  useEffect(() => {
    void workspace.initialize().catch(() => {});
    const timer = setInterval(() => void workspace.refresh(false).catch(() => {}), 2000);
    const refresh = () => void workspace.refresh().catch(() => {});
    const queueOpen = () => setOpenRequest((value) => value + 1);
    const onOpen = window.jarvisWindow.onOpenChat?.((id) => {
      pendingOpen.current = id;
      queueOpen();
    });
    document.addEventListener('close', queueOpen, true);
    const unsubscribe = window.jarvisWindow.onWorkspaceChanged?.(refresh);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
      if (typeof unsubscribe === 'function') unsubscribe();
      if (typeof onOpen === 'function') onOpen();
      document.removeEventListener('close', queueOpen, true);
      workspace.dispose();
      writer.dispose();
    };
  }, [workspace, writer]);
  useEffect(() => {
    if (
      !pendingOpen.current ||
      !state.ready ||
      busy ||
      submitting ||
      writerState.saving ||
      document.querySelector('dialog[open]')
    )
      return;
    const id = pendingOpen.current;
    pendingOpen.current = null;
    void run(async () => {
      await writer.leave();
      speaker.stop();
      attachments.clear();
      setInput('');
      await workspace.openById(id);
    });
  }, [openRequest, state.ready, busy, submitting, writerState.saving]);
  useEffect(() => {
    if (state.project) setExpanded((value) => new Set([...value, state.project.id]));
  }, [state.project?.id]);
  useEffect(() => {
    if (isWriter && state.project)
      void writer
        .load(state.project, state.chat)
        .catch((error) => workspace.set({ error: error.message }));
  }, [state.chat?.id]);
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = Math.min(180, inputRef.current.scrollHeight) + 'px';
    }
  }, [input]);
  function openManage() {
    const chat = workspace.get().chat;
    if (!chat) return;
    setDraftSettings({ title: chat.title, instructions: chat.instructions || '' });
    setManage(true);
  }
  async function newWriter(project, chooseFile = false) {
    await writer.leave();
    let chat;
    if (chooseFile) {
      const result = await window.jarvisWriter.chooseFile({
        project_id: project.id,
        create: false,
      });
      if (result.cancelled) return;
      chat = result.chat;
    } else {
      const title = await run.ask(
        'Novo chat Cyro IA Writer',
        '',
        'Escolha o nome do arquivo. O texto fica no banco local do projeto.',
      );
      if (!title) return;
      const node = await writer.command(
        'create',
        {
          title: title.replace(/\.(docx|txt|md)$/i, '') + '.docx',
          kind: 'document',
          parentId: null,
        },
        project.id,
      );
      chat = await writer.command('bind_chat', { id: node.id }, project.id);
    }
    await workspace.catalog(project.id, chat.id);
    setMenu(null);
  }
  return (
    <div
      className="app-layout"
      onClick={(event) => {
        if (menu && !event.target.closest('.context-menu,.project-create-menu')) setMenu(null);
      }}
    >
      <Sidebar
        state={state}
        busy={busy}
        search={search}
        onSearch={setSearch}
        expanded={expanded}
        onToggle={(id) =>
          setExpanded((value) => {
            const result = new Set(value);
            result.has(id) ? result.delete(id) : result.add(id);
            return result;
          })
        }
        onView={(...args) => run(() => navigate(...args))}
        onNewChat={(id) => run(() => createChat(id))}
        onCreateMenu={(item, event) => {
          event.stopPropagation();
          setMenu({ kind: 'create', item, x: event.clientX, y: event.clientY });
        }}
        onChatMenu={(item, event) =>
          setMenu({ kind: 'chat', item, x: event.clientX, y: event.clientY })
        }
        onAddProject={() =>
          run(async () => {
            const result = await window.jarvisWindow.authorizeFolder();
            if (result.canceled) return;
            if (!result.ok) throw Error(result.data?.detail);
            await workspace.catalog(result.data.id, null);
            setScope(workspace.get().project);
          })
        }
        onLogout={() =>
          run(async () => {
            await writer.leave();
            speaker.stop();
            await window.jarvisAuth.logout();
          })
        }
        onSettings={() => setSettings(true)}
      />
      <main className="main-panel">
        <header className="topbar">
          <button
            id="sidebar-toggle"
            aria-label="Alternar barra lateral"
            aria-expanded={!preferences.collapsed}
            onClick={() => setPreferences({ collapsed: !preferences.collapsed })}
          >
            <Icon name="panel-left" />
          </button>
          <div className="breadcrumbs">
            <button
              id="project-name"
              disabled={busy || !state.ready}
              onClick={() => {
                if (state.project) {
                  setDraftSettings({
                    name: state.project.name,
                    instructions: state.project.instructions || '',
                  });
                  setProjectSettings(true);
                }
              }}
            >
              {state.project?.name || 'Conversas gerais'}
            </button>
            <h1 id="conversation-name" data-chat-id={state.chat?.id}>
              {state.chat?.title || (state.project ? 'Visão geral do projeto' : 'Nova conversa')}
            </h1>
          </div>
          <div className="top-actions">
            {isWriter && (
              <>
                <button id="writer-toggle-files" onClick={() => setLibrary(state.project)}>
                  Arquivos
                </button>
                <button
                  id="writer-toggle-preview"
                  aria-expanded={showPreview}
                  onClick={() => setShowPreview((value) => !value)}
                >
                  Documento
                </button>
              </>
            )}
            <button
              id="voice-toggle"
              aria-pressed={preferences.voice}
              onClick={() => setPreferences({ voice: !preferences.voice })}
            >
              <Icon name="volume" />
              <span>{preferences.voice ? 'Voz ativa' : 'Voz desativada'}</span>
            </button>
            <button
              id="voice-stop"
              hidden={!speaker.active}
              aria-label="Parar áudio"
              onClick={speaker.stop}
            >
              ■
            </button>
            <button
              id="manage-open"
              aria-label="Configurações da conversa"
              disabled={!state.chat || busy}
              onClick={openManage}
            >
              <Icon name="ellipsis" />
            </button>
          </div>
        </header>
        <div id="project-banner" hidden={!state.project}>
          <span id="memory-state">{state.project?.progress || state.project?.state}</span>
          <button id="select-sources" disabled={busy} onClick={() => setScope(state.project)}>
            Arquivos do projeto
          </button>
          <button id="project-writer" disabled={busy} onClick={() => setLibrary(state.project)}>
            Documentos Writer
          </button>
          <button
            id="refresh-memory"
            disabled={busy || !state.project?.scope_confirmed}
            onClick={() =>
              run(async () => {
                await post('/projects/refresh', { project_id: state.project.id });
                await workspace.refresh();
              })
            }
          >
            Atualizar memória
          </button>
          <button
            id="accept-partial"
            hidden={state.project?.state !== 'partial'}
            disabled={busy}
            onClick={() =>
              run(async () => {
                await post('/projects/accept-partial', { project_id: state.project.id });
                await workspace.catalog();
              })
            }
          >
            Aceitar análise parcial
          </button>
        </div>
        <div
          className={
            'chat-document-layout' +
            (isWriter && showPreview ? ' has-writer-document' : '') +
            (documentExpanded ? ' document-expanded' : '')
          }
        >
          <div className="writer-standard-chat">
            <Conversation
              state={state}
              writerState={writerState}
              isWriter={isWriter}
              rows={rows}
              writer={writer}
              onRun={run}
              onRetry={() => void workspace.initialize().catch(() => {})}
            >
              <Welcome
                hidden={rows.length > 0 || isWriter || !state.ready}
                displayName={state.settings.displayName}
                onProject={() => window.document.getElementById('add-project').click()}
                onContinue={() => setPreferences({ collapsed: false })}
                onPrompt={setInput}
              />
            </Conversation>
            <Composer
              state={state}
              writerState={writerState}
              isWriter={isWriter}
              settings={settings}
              library={library}
              busy={busy}
              canSend={canSend}
              input={input}
              inputRef={inputRef}
              onInput={setInput}
              onSend={send}
              attachments={attachments}
              dictation={dictation}
              onDictation={() => run(dictation.toggle)}
              onCancel={() => run(() => (isWriter ? writer.cancel() : workspace.cancel()))}
              onClearSelection={() => writer.select([], '')}
              status={status}
            />
          </div>
          {isWriter && showPreview && <WriterDivider />}
          {isWriter && (
            <WriterPreview
              writer={writer}
              onRun={run}
              hidden={!showPreview}
              onExpand={setDocumentExpanded}
            />
          )}
        </div>
      </main>

      {menu && (
        <div
          className={menu.kind === 'create' ? 'project-create-menu' : 'context-menu'}
          role="menu"
          style={{
            position: 'fixed',
            left: Math.min(menu.x, window.innerWidth - 220),
            top: Math.min(menu.y, window.innerHeight - 200),
          }}
        >
          {menu.kind === 'create' ? (
            <>
              <button role="menuitem" onClick={() => run(() => createChat(menu.item.id))}>
                Chat do projeto
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  setLibrary(menu.item);
                  setMenu(null);
                }}
              >
                Cyro Writer
              </button>
              <button role="menuitem" onClick={() => run(() => newWriter(menu.item, true))}>
                Abrir arquivo no Writer
              </button>
            </>
          ) : (
            <>
              <button
                role="menuitem"
                onClick={() =>
                  run(async () => {
                    await navigate(menu.item.project_id || '', menu.item.id);
                    openManage();
                  })
                }
              >
                Editar conversa
              </button>
              <button
                role="menuitem"
                disabled={!!menu.item.slot}
                onClick={() =>
                  run(async () => {
                    const result = await window.jarvisWindow.manageChat(menu.item.id, 'archive');
                    if (result?.ok === false) throw Error(result.data?.detail);
                    setMenu(null);
                    await workspace.catalog(state.project?.id || '', null);
                  })
                }
              >
                Arquivar
              </button>
              <button
                role="menuitem"
                disabled={!!menu.item.slot}
                onClick={() =>
                  run(async () => {
                    const result = await window.jarvisWindow.manageChat(menu.item.id, 'delete');
                    if (result?.ok === false) throw Error(result.data?.detail);
                    setMenu(null);
                    await workspace.catalog(state.project?.id || '', null);
                  })
                }
              >
                Excluir
              </button>
            </>
          )}
        </div>
      )}
      <WriterLibrary
        project={library}
        writer={writer}
        onClose={() => setLibrary(null)}
        onSelect={(chat) => workspace.catalog(library.id, chat.id)}
        onCreate={() =>
          run(async () => {
            await newWriter(library);
            setLibrary(null);
          })
        }
        onOpenFile={() =>
          run(async () => {
            await newWriter(library, true);
            setLibrary(null);
          })
        }
        onRun={run}
      />
      <Settings
        open={settings}
        onClose={() => setSettings(false)}
        workspace={workspace}
        state={state}
        preferences={preferences}
        onPreferences={setPreferences}
        onRun={run}
        onView={navigate}
      />
      <ScopeDialog
        project={scope}
        onClose={() => setScope(null)}
        onSaved={() => workspace.catalog()}
      />
      <Dialog
        id="manage-dialog"
        title="Configurações da conversa"
        open={manage}
        onClose={() => setManage(false)}
      >
        <label>
          Título
          <input
            id="chat-title"
            value={draftSettings.title || ''}
            maxLength={120}
            onChange={(event) => setDraftSettings({ ...draftSettings, title: event.target.value })}
          />
        </label>
        <label>
          Instruções da conversa
          <textarea
            id="chat-instructions"
            value={draftSettings.instructions || ''}
            maxLength={4000}
            onChange={(event) =>
              setDraftSettings({ ...draftSettings, instructions: event.target.value })
            }
          />
        </label>
        <button
          id="rename-chat"
          onClick={() =>
            run(async () => {
              await post('/chats/settings', {
                chat_id: state.chat.id,
                title: draftSettings.title,
                instructions: draftSettings.instructions,
              });
              setManage(false);
              await workspace.catalog();
            })
          }
        >
          Salvar conversa
        </button>
        <button
          id="older-messages"
          disabled={isWriter}
          onClick={() =>
            run(async () => {
              await workspace.older();
              setManage(false);
            })
          }
        >
          Mensagens anteriores
        </button>
        <button
          id="archive-chat"
          disabled={!!state.chat?.slot}
          onClick={() =>
            run(async () => {
              await window.jarvisWindow.manageChat(
                state.chat.id,
                state.chat.archived ? 'restore' : 'archive',
              );
              setManage(false);
              await workspace.catalog(state.project?.id || '', null);
            })
          }
        >
          {state.chat?.archived ? 'Restaurar' : 'Arquivar'}
        </button>
        <button
          id="clear-chat"
          disabled={isWriter || busy}
          onClick={() =>
            run(async () => {
              const id = state.chat.id;
              const result = await window.jarvisWindow.manageChat(id, 'clear');
              if (result?.canceled) return;
              if (result?.ok === false)
                throw Error(result.data?.detail || 'Não foi possível limpar a conversa.');
              setManage(false);
              await workspace.openById(id);
            })
          }
        >
          Limpar mensagens
        </button>
        <button
          id="delete-chat"
          disabled={!!state.chat?.slot}
          onClick={() =>
            run(async () => {
              const result = await window.jarvisWindow.manageChat(state.chat.id, 'delete');
              if (result?.ok === false) throw Error(result.data?.detail);
              if (result?.canceled) return;
              setManage(false);
              await workspace.catalog(state.project?.id || '', null);
            })
          }
        >
          Excluir
        </button>
      </Dialog>
      <Dialog
        id="project-settings-dialog"
        title="Configurações do projeto"
        open={projectSettings}
        onClose={() => setProjectSettings(false)}
      >
        <label>
          Nome
          <input
            id="project-settings-name"
            value={draftSettings.name || ''}
            onChange={(event) => setDraftSettings({ ...draftSettings, name: event.target.value })}
          />
        </label>
        <label>
          Instruções
          <textarea
            id="project-instructions"
            value={draftSettings.instructions || ''}
            maxLength={4000}
            onChange={(event) =>
              setDraftSettings({ ...draftSettings, instructions: event.target.value })
            }
          />
        </label>
        <button
          id="save-project-settings"
          onClick={() =>
            run(async () => {
              await post('/projects/settings', {
                project_id: state.project.id,
                name: draftSettings.name,
                instructions: draftSettings.instructions,
              });
              setProjectSettings(false);
              await workspace.catalog();
            })
          }
        >
          Salvar projeto
        </button>
        <button
          id="project-select-sources"
          onClick={() => {
            setProjectSettings(false);
            setScope(state.project);
          }}
        >
          Arquivos do projeto
        </button>
        <button
          id="show-knowledge"
          onClick={() =>
            run(async () => {
              const result = await api(
                '/projects/knowledge?project_id=' + encodeURIComponent(state.project.id),
              );
              setKnowledge(result.content);
              setProjectSettings(false);
            })
          }
        >
          Ver memória
        </button>
        <label>
          Anotação
          <textarea
            id="project-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
        <button
          id="save-note"
          onClick={() =>
            run(async () => {
              await post('/projects/note', {
                project_id: state.project.id,
                kind: 'note',
                content: note,
              });
              setNote('');
              workspace.set({ status: 'Anotação salva' });
            })
          }
        >
          Salvar anotação
        </button>
        <button
          id="remove-project"
          onClick={() =>
            run(async () => {
              const result = await window.jarvisWindow.removeProject(state.project.id);
              if (result?.canceled) return;
              if (result?.ok === false) throw Error(result.data?.detail);
              setProjectSettings(false);
              await workspace.catalog('', null);
            })
          }
        >
          Remover projeto
        </button>
      </Dialog>
      <Dialog
        id="knowledge-dialog"
        title="Memória do projeto"
        open={knowledge !== null}
        onClose={() => setKnowledge(null)}
      >
        <Markdown text={knowledge || ''} />
      </Dialog>
      <Dialog
        id="writer-name-dialog"
        title={ask?.title || ''}
        open={!!ask}
        onClose={() => closeAsk(null)}
      >
        <p>{ask?.description}</p>
        <label>
          Nome
          <input
            id="writer-name"
            maxLength={120}
            value={ask?.value || ''}
            onChange={(event) => setAsk({ ...ask, value: event.target.value })}
          />
        </label>
        <button id="writer-name-cancel" onClick={() => closeAsk(null)}>
          Cancelar
        </button>
        <button id="writer-name-save" onClick={() => closeAsk(ask.value.trim())}>
          Confirmar
        </button>
      </Dialog>
    </div>
  );
}
