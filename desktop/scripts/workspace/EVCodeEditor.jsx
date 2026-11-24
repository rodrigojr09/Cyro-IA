import React, { useDeferredValue, useMemo, useRef } from 'react';
import hljs from 'highlight.js/lib/common';
import DOMPurify from 'dompurify';
import { languageFor } from './studio-model';
export function EVCodeEditor({ name, value, onChange, onSave, readOnly = false }) {
  const escapeTab = useRef(false);
  const deferred = useDeferredValue(value),
    area = useRef(null),
    paint = useRef(null),
    numbers = useRef(null);
  const language = languageFor(name);
  const html = useMemo(
    () =>
      DOMPurify.sanitize(
        (hljs.getLanguage(language)
          ? hljs.highlight(deferred || ' ', { language })
          : {
              value: (deferred || ' ')
                .replaceAll('&', '&amp;')
                .replaceAll('<', '&lt;')
                .replaceAll('>', '&gt;'),
            }
        ).value,
        { ALLOWED_TAGS: ['span'], ALLOWED_ATTR: ['class'] },
      ),
    [deferred, language],
  );
  const updateSelection = (text, start, end) => {
    onChange(text);
    requestAnimationFrame(() => {
      area.current?.setSelectionRange(start, end);
    });
  };
  return (
    <div className="ev-code-editor">
      <div className="ev-code-lines" ref={numbers} aria-hidden="true">
        {Array.from({ length: value.split('\n').length }, (_, i) => (
          <span key={i}>{i + 1}</span>
        ))}
      </div>
      <div className="ev-code-canvas">
        <pre ref={paint} aria-hidden="true">
          <code dangerouslySetInnerHTML={{ __html: html + '\n' }} />
        </pre>
        <textarea
          ref={area}
          aria-label="Editor de código"
          spellCheck={false}
          readOnly={readOnly}
          value={value}
          wrap="off"
          onChange={(e) => onChange(e.target.value)}
          onScroll={(e) => {
            paint.current.scrollTop = e.target.scrollTop;
            paint.current.scrollLeft = e.target.scrollLeft;
            numbers.current.scrollTop = e.target.scrollTop;
          }}
          onKeyDown={(e) => {
            if (readOnly) {
              if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') e.preventDefault();
              return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
              e.preventDefault();
              onSave();
            }
            if (e.key === 'Escape') {
              escapeTab.current = true;
              return;
            }
            if (e.key === 'Tab' && escapeTab.current) {
              escapeTab.current = false;
              return;
            }
            if (e.key === 'Tab') {
              e.preventDefault();
              const { selectionStart: a, selectionEnd: b } = e.target;
              updateSelection(value.slice(0, a) + '  ' + value.slice(b), a + 2, a + 2);
            }
          }}
        />
      </div>
    </div>
  );
}
