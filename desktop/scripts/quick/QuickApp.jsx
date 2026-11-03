import React, { useEffect, useRef, useState } from 'react';
import { Clipboard } from '../clipboard/Clipboard';
import { preferenceStorage, ignoreOwnSelection } from '../shared/bridge';
const ignore = (promise) => void promise?.catch(() => {});
export function QuickApp({ panel = new URLSearchParams(location.search).get('panel') }) {
  const [state, setState] = useState(null),
    [draft, setDraft] = useState(() => {
      try {
        return preferenceStorage().getItem('jarvis.quick.draft') || '';
      } catch {
        return '';
      }
    }),
    [useProject, setUseProject] = useState(false),
    [submitting, setSubmitting] = useState(false);
  const question = useRef(null),
    answer = useRef(null),
    drag = useRef(null),
    audio = useRef(null),
    sending = useRef(false),
    latest = useRef(null);
  latest.current = state;
  const stop = () => {
    audio.current?.pause();
    audio.current = null;
  };
  useEffect(() => {
    let active = true;
    const receive = (value) => {
      if (active) setState(value);
    };
    const off = window.quick.onState(receive),
      focus = () => {
        question.current?.focus();
        ignore(window.quick.state().then(receive));
      },
      offFocus = window.quick.onFocus(focus),
      offAudio = window.quick.onStopAudio(stop);
    ignore(window.quick.state().then(receive));
    window.addEventListener('focus', focus);
    const keydown = (event) => {
      if (event.key === 'Escape')
        ignore(panel === 'response' ? window.quick.hide() : window.quick.collapse());
    };
    document.addEventListener('keydown', keydown);
    return () => {
      active = false;
      for (const dispose of [off, offFocus, offAudio]) if (typeof dispose === 'function') dispose();
      window.removeEventListener('focus', focus);
      document.removeEventListener('keydown', keydown);
      stop();
    };
  }, [panel]);
  useEffect(() => {
    if (state)
      document.documentElement.style.setProperty('--quick-opacity', String(state.config.opacity));
    if (!state?.project) setUseProject(false);
    if (state?.error && !state.answer && state.question)
      setDraft((value) => value || state.question);
  }, [state]);
  useEffect(() => {
    try {
      if (draft) preferenceStorage().setItem('jarvis.quick.draft', draft);
      else preferenceStorage().removeItem('jarvis.quick.draft');
    } catch {}
  }, [draft]);
  useEffect(() => {
    if (panel !== 'response') return;
    let timer;
    const selection = () =>
      ignore(window.quick.pause('selection', !!window.getSelection()?.toString()));
    const copy = (event) => {
      ignoreOwnSelection(event);
      ignore(window.quick.pause('copy', true));
      clearTimeout(timer);
      timer = setTimeout(() => ignore(window.quick.pause('copy', false)), 2000);
    };
    document.addEventListener('selectionchange', selection);
    document.addEventListener('copy', copy);
    const off = window.quick.onAudio(async (payload) => {
      stop();
      const item = new Audio('data:audio/mp3;base64,' + payload.data);
      audio.current = item;
      item.onended = () => ignore(window.quick.audioEnded(payload.epoch));
      item.onerror = () => ignore(window.quick.audioFailed(payload.epoch));
      try {
        await item.play();
      } catch {
        ignore(window.quick.audioFailed(payload.epoch));
      }
    });
    return () => {
      clearTimeout(timer);
      if (typeof off === 'function') off();
      document.removeEventListener('selectionchange', selection);
      document.removeEventListener('copy', copy);
      stop();
    };
  }, [panel]);
  useEffect(() => {
    if (panel !== 'response' || !answer.current) return;
    const content = answer.current;
    const response = content.closest('#response');
    const header = response.querySelector('header');
    const footer = response.querySelector('.tools');
    let frame, lastHeight;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const css = getComputedStyle(response);
        const px = (value) => parseFloat(value) || 0;
        const chrome =
          header.getBoundingClientRect().height +
          footer.getBoundingClientRect().height +
          px(css.paddingTop) +
          px(css.paddingBottom) +
          px(css.borderTopWidth) +
          px(css.borderBottomWidth) +
          2 * px(css.rowGap);
        const height = Math.max(
          90,
          Math.min(400, Math.ceil(content.getBoundingClientRect().height + chrome)),
        );
        if (height !== lastHeight) {
          lastHeight = height;
          ignore(window.quick.resize(height));
        }
      });
    };
    const observer = window.ResizeObserver ? new window.ResizeObserver(measure) : null;
    for (const node of [content, header, footer]) observer?.observe(node);
    window.addEventListener('resize', measure);
    measure();
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [panel, state?.answer, state?.error, state?.busy]);
  useEffect(() => {
    document.body.classList.toggle('clipboard-composer', panel === 'composer');
    return () => document.body.classList.remove('clipboard-composer');
  }, [panel]);
  async function submit(text = draft, clipboard = false) {
    if (
      sending.current ||
      !state ||
      state.busy ||
      state.ready === false ||
      !text.trim() ||
      text.length > 6000
    )
      return false;
    sending.current = true;
    setSubmitting(true);
    if (!clipboard) setDraft('');
    try {
      const result = await window.quick.send(text.trim(), useProject);
      if (!result.ok && !clipboard) setDraft((value) => value || text);
      return result.ok === true;
    } catch {
      if (!clipboard) setDraft((value) => value || text);
      return false;
    } finally {
      sending.current = false;
      setSubmitting(false);
    }
  }
  const hover = {
    onMouseEnter: () => ignore(window.quick.pause('hover', true)),
    onMouseLeave: () => ignore(window.quick.pause('hover', false)),
  };
  if (panel === 'orb')
    return (
      <button
        id="orb"
        title="Cyro IA Quick Chat · arraste para mover"
        aria-label="Abrir Quick Chat"
        {...hover}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          drag.current = {
            x: event.screenX,
            y: event.screenY,
            originX: window.screenX,
            originY: window.screenY,
            moved: false,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const point = drag.current;
          if (!point) return;
          const dx = event.screenX - point.x,
            dy = event.screenY - point.y;
          point.moved ||= Math.abs(dx) + Math.abs(dy) > 4;
          if (point.moved) ignore(window.quick.move(point.originX + dx, point.originY + dy, false));
        }}
        onPointerUp={(event) => {
          const point = drag.current;
          drag.current = null;
          if (!point) return;
          if (point.moved)
            ignore(
              window.quick.move(
                point.originX + event.screenX - point.x,
                point.originY + event.screenY - point.y,
                true,
              ),
            );
          else ignore(window.quick.toggle());
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        C<span />
        <Clipboard orb />
      </button>
    );
  if (panel === 'composer')
    return (
      <section id="composer" {...hover}>
        <div className="caption">
          <strong>
            Cyro IA <span>QUICK CHAT</span>
          </strong>
          <div className="caption-actions">
            <button
              id="quick-voice-toggle"
              aria-label="Alternar voz do Quick Chat"
              aria-pressed={!!state?.config.voice}
              onClick={() => ignore(window.quick.voice(!state?.config.voice))}
            >
              {!state?.masterVoice
                ? 'Voz global desligada'
                : state?.config.voice
                  ? 'Voz ativa'
                  : 'Voz desligada'}
            </button>
            <button
              id="collapse"
              aria-label="Recolher"
              onClick={() => ignore(window.quick.collapse())}
            >
              Esc
            </button>
          </div>
        </div>
        <Clipboard
          quick
          baseHeight={state?.ready === false ? 200 : 150}
          canClaim={!!state && state.ready !== false && !state.busy && !submitting}
          onUseText={(text) => {
            const next = (draft ? draft + '\n' : '') + '(' + text + ')\n';
            if (next.length > 6000) return false;
            setDraft(next);
            question.current?.focus();
            return true;
          }}
        />
        <textarea
          id="question"
          ref={question}
          rows={2}
          maxLength={6000}
          placeholder="Pergunte ao Cyro..."
          aria-label="Pergunta rápida"
          aria-describedby="quick-startup-status"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void submit();
            }
          }}
        />
        <p id="quick-startup-status" role="status" hidden={state?.ready !== false}>
          Carregando histórico e informações. Você já pode preparar a próxima mensagem.
        </p>
        <div className="tools">
          <label hidden={!state?.project}>
            <input
              id="use-project"
              type="checkbox"
              checked={useProject}
              disabled={state?.busy || !state?.project}
              onChange={(event) => setUseProject(event.target.checked)}
            />
            <span id="project-label">
              {state?.project ? 'Usar ' + state.project.name : 'Nenhum projeto ativo'}
            </span>
          </label>
          <button
            id="send"
            aria-label="Enviar"
            disabled={!state || state.busy || state.ready === false || submitting}
            onClick={() => void submit()}
          >
            ↑
          </button>
        </div>
      </section>
    );
  if (panel !== 'response') return <p role="alert">Painel indisponível.</p>;
  const value = state || {};
  return (
    <section
      id="response"
      className={(value.busy ? 'busy ' : '') + (value.error && !value.answer ? 'error' : '')}
      {...hover}
    >
      <header>
        <strong>Cyro IA</strong>
        <span id="remaining">
          {value.busy
            ? 'Em andamento'
            : value.pinned
              ? 'Fixada'
              : value.voicing
                ? 'Áudio ativo'
                : value.hovered
                  ? 'Pausado'
                  : (value.remaining || 0) + 's'}
        </span>
        <button
          id="pin"
          title="Fixar resposta"
          aria-pressed={!!value.pinned}
          onClick={() => ignore(window.quick.pin(!value.pinned))}
        >
          {value.pinned ? 'Desafixar' : 'Fixar'}
        </button>
        <button
          id="close-response"
          aria-label="Fechar resposta"
          onClick={() => ignore(window.quick.hide())}
        >
          ×
        </button>
      </header>
      <article id="answer" tabIndex={0}>
        <div ref={answer} className="quick-answer-content">
          {value.busy ? 'Preparando uma resposta curta...' : value.answer || value.error}
        </div>
      </article>
      <div className="tools">
        <span id="result-status" role="status" title={value.error || ''}>
          {value.voicing
            ? 'Preparando ou reproduzindo voz'
            : value.error
              ? value.answer
                ? 'Voz indisponível'
                : 'Falha na resposta'
              : value.usedProject
                ? 'Contexto: ' + value.usedProject
                : 'Conversa rápida'}
        </span>
        <button
          id="listen"
          disabled={value.busy || !value.answer || !value.masterVoice}
          onClick={async () => {
            await window.quick.voice(true);
            ignore(window.quick.speak());
          }}
        >
          Ouvir
        </button>
        <button id="stop-audio" hidden={!value.voicing} onClick={() => ignore(window.quick.stop())}>
          Parar voz
        </button>
        <button
          id="copy"
          disabled={value.busy || !value.answer}
          onClick={() => ignore(window.quick.copy())}
        >
          Copiar
        </button>
        <button id="open-main" onClick={() => ignore(window.quick.openMain())}>
          Abrir conversa ↗
        </button>
      </div>
    </section>
  );
}
