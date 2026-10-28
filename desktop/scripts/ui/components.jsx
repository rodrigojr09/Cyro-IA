import React, { useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/common';

const tags = [
  'p',
  'br',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'strong',
  'em',
  'del',
  'blockquote',
  'hr',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'pre',
  'code',
  'a',
];
export function Markdown({ text = '' }) {
  const nodes = useMemo(() => {
    const html = DOMPurify.sanitize(marked.parse(String(text), { gfm: true, breaks: true }), {
      ALLOWED_TAGS: tags,
      ALLOWED_ATTR: ['href', 'title', 'class'],
      ALLOW_DATA_ATTR: false,
    });
    const document = new DOMParser().parseFromString(html, 'text/html');
    const convert = (node, key) => {
      if (node.nodeType === 3) return node.textContent;
      const tag = node.tagName?.toLowerCase();
      if (!tags.includes(tag)) return null;
      const children = [...node.childNodes]
        .filter(
          (item) =>
            !['table', 'thead', 'tbody', 'tr'].includes(tag) ||
            item.nodeType !== 3 ||
            item.textContent.trim(),
        )
        .map((item, index) => convert(item, index));
      if (tag === 'br' || tag === 'hr') return React.createElement(tag, { key });
      if (tag === 'a') {
        const href = node.getAttribute('href');
        return (
          <a
            key={key}
            href={/^https?:\/\//i.test(href || '') ? href : undefined}
            onClick={(event) => {
              event.preventDefault();
              if (/^https?:\/\//i.test(href || ''))
                void window.jarvisWindow.openLink(href).catch(() => {});
            }}
          >
            {children}
          </a>
        );
      }
      if (tag === 'pre')
        return (
          <Code
            key={key}
            text={node.textContent || ''}
            language={node.querySelector('code')?.className.match(/language-([\w+-]+)/)?.[1] || ''}
          />
        );
      return React.createElement(tag, { key }, children);
    };
    return [...document.body.childNodes].map(convert);
  }, [text]);
  return <div className="markdown">{nodes}</div>;
}
function Code({ text, language }) {
  const [label, setLabel] = React.useState('Copiar código');
  const highlighted = useMemo(
    () =>
      DOMPurify.sanitize(
        (language && hljs.getLanguage(language)
          ? hljs.highlight(text, { language })
          : hljs.highlightAuto(text)
        ).value,
        {
          ALLOWED_TAGS: ['span'],
          ALLOWED_ATTR: ['class'],
        },
      ),
    [text, language],
  );
  return (
    <div className="code-block">
      <div className="code-header">
        <span>{language || 'código'}</span>
        <button
          type="button"
          onClick={async () => {
            try {
              await window.jarvisWindow.copyCode(text);
              setLabel('Copiado');
            } catch {
              setLabel('Falha ao copiar');
            }
          }}
        >
          {label}
        </button>
      </div>
      <pre>
        <code dangerouslySetInnerHTML={{ __html: highlighted }} />
      </pre>
    </div>
  );
}
export function Dialog({ id, title, open, onClose, children, className = '' }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (open && !ref.current.open) ref.current.showModal();
    else if (!open && ref.current.open) ref.current.close();
  }, [open]);
  return (
    <dialog
      id={id}
      ref={ref}
      className={className}
      aria-labelledby={id + '-heading'}
      onCancel={(event) => {
        event.preventDefault();
        onClose?.();
      }}
    >
      <div className="dialog-header">
        <h2 id={id + '-heading'}>{title}</h2>
        <button type="button" aria-label="Fechar" onClick={onClose}>
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function useSubscription(subscribe, callback) {
  const latest = React.useRef(callback);
  latest.current = callback;
  React.useEffect(() => {
    const dispose = subscribe?.((...args) => latest.current(...args));
    return () => {
      if (typeof dispose === 'function') dispose();
    };
  }, [subscribe]);
}
export function Status({ children, error }) {
  return (
    <p role="status" className={error ? 'error' : ''}>
      {children}
    </p>
  );
}
