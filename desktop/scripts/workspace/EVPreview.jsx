import React, { useMemo } from 'react';
import DOMPurify from 'dompurify';
import { Markdown } from '../ui/components';
export function safePreviewHTML(content) {
  const cleaned = DOMPurify.sanitize(content, {
    WHOLE_DOCUMENT: true,
    ADD_TAGS: ['style'],
    FORBID_TAGS: [
      'script',
      'iframe',
      'object',
      'embed',
      'form',
      'input',
      'button',
      'base',
      'meta',
      'link',
      'svg',
      'math',
      'video',
      'audio',
    ],
    FORBID_ATTR: ['srcdoc', 'action', 'formaction'],
    ALLOWED_URI_REGEXP: /^(?:data:image\/(?:png|jpeg|gif|webp);base64,|#)/i,
  });
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'"><style>body{margin:0;padding:24px;font:14px/1.6 system-ui;color:#172033;background:#fff;overflow-wrap:anywhere}table{border-collapse:collapse;max-width:100%}td,th{padding:8px;border:1px solid #ddd}img{max-width:100%}pre{white-space:pre-wrap}</style></head><body>${cleaned}</body></html>`;
}
export function EVPreview({ preview }) {
  const html = useMemo(
    () => (preview?.format === 'html' ? safePreviewHTML(preview.content) : ''),
    [preview?.format, preview?.content],
  );
  if (!preview)
    return (
      <div className="ev-studio-empty">
        <strong>Seu resultado aparece aqui</strong>
        <p>Execute um código do chat ou um arquivo da lateral.</p>
      </div>
    );
  if (preview.format === 'html')
    return (
      <iframe
        className="ev-html-preview"
        title="Preview visual do EV"
        sandbox=""
        referrerPolicy="no-referrer"
        srcDoc={html}
      />
    );
  if (preview.format === 'markdown')
    return (
      <div className="ev-markdown-preview">
        <Markdown text={preview.content} />
      </div>
    );
  let value = preview.content;
  if (preview.format === 'json') {
    try {
      value = JSON.stringify(JSON.parse(value), null, 2);
    } catch {}
  }
  return (
    <pre
      className={'ev-result-text ' + (preview.format === 'json' ? 'is-json' : '')}
      aria-label="Resultado do preview"
    >
      {value || 'A execução terminou sem saída de texto.'}
    </pre>
  );
}
