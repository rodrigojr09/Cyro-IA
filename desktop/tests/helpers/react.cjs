const path = require('node:path');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const React = require('react');
const { act } = React;
const root = path.resolve(__dirname, '../..');
const output = path.resolve(root, '../build/v6/react-test-components-' + process.pid + '.cjs');
require('esbuild').buildSync({
  absWorkingDir: root,
  stdin: {
    contents: `export {MemoryPanel} from './scripts/memory/MemoryPanel'; export {EVWorkspace} from './scripts/workspace/EVWorkspace'; export {Settings,SettingsSectionBoundary} from './scripts/ui/Settings'; export {Editor} from '@tiptap/core'; export {extensions,toDocument,editorBlocks,connectEditor} from './scripts/writer/editor'; export {WriterPreview} from './scripts/writer/WriterPreview'; export {App} from './scripts/app/App'; export {Login} from './scripts/session/Login'; export {QuickApp} from './scripts/quick/QuickApp'; export {Clipboard,ClipboardSettings} from './scripts/clipboard/Clipboard'; export {ScopeDialog,isSelected} from './scripts/workspace/ScopeDialog'; export {AttachmentList,useAttachments} from './scripts/attachment/components'; export {Markdown} from './scripts/ui/components'; export {Integrations,SpotifySettings} from './scripts/integrations/Integrations'; export {createWorkspace} from './scripts/workspace/store'; export {createWriter} from './scripts/writer/store';`,
    resolveDir: root,
    loader: 'jsx',
  },
  outfile: output,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  jsx: 'automatic',
  external: ['react', 'react-dom', 'react-dom/client'],
});
let components;
function environment() {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'https://desktop.example.test',
  });
  Object.assign(global, {
    window: dom.window,
    document: dom.window.document,
    DOMParser: dom.window.DOMParser,
    FormData: dom.window.FormData,
    localStorage: dom.window.localStorage,
    HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node,
    Element: dom.window.Element,
    getComputedStyle: dom.window.getComputedStyle,
    cancelAnimationFrame: clearTimeout,
    MutationObserver: dom.window.MutationObserver,
    requestAnimationFrame: (callback) => setTimeout(callback, 0),
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  dom.window.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  dom.window.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  dom.window.HTMLElement.prototype.scrollIntoView = function () {};
  global.Audio = class {
    async play() {}
    pause() {}
  };
  global.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
  const { createRoot } = require('react-dom/client');
  components ||= require(output);
  const renderer = createRoot(document.getElementById('root'));
  return {
    dom,
    ...components,
    async mount(Component, props = {}) {
      await act(async () => renderer.render(React.createElement(Component, props)));
    },
    async dispose() {
      await act(async () => renderer.unmount());
      dom.window.close();
    },
  };
}
async function click(target) {
  if (typeof target === 'string') target = document.querySelector(target);
  if (!target) throw Error('Missing test target');
  await act(async () => target.click());
}
async function input(target, value) {
  if (typeof target === 'string') target = document.querySelector(target);
  const type =
    target.tagName === 'TEXTAREA'
      ? window.HTMLTextAreaElement
      : target.tagName === 'SELECT'
        ? window.HTMLSelectElement
        : window.HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(type.prototype, 'value').set.call(target, value);
    target.dispatchEvent(new window.Event('input', { bubbles: true }));
    target.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
}
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setImmediate(resolve));
  });
}
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
module.exports = { environment, click, input, settle, deferred, act, React };
