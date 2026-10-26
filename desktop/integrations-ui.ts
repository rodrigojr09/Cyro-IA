import {
  integrationCatalog,
  integrationStatusLabels,
  filterIntegrations,
} from './integration-catalog';
import type { IntegrationDefinition, IntegrationFilter } from './integration-catalog';

/** No networking, storage, authentication or IPC: this view renders catalog data only. */
export function mountIntegrations(
  container: HTMLElement,
  refreshIcons: () => void,
  catalog: readonly IntegrationDefinition[] = integrationCatalog,
): void {
  container.innerHTML = `<section class="integrations-page" aria-labelledby="integrations-heading">
    <header class="integrations-heading"><span class="integrations-eyebrow">APLICATIVOS E SERVIÇOS</span><h3 id="integrations-heading">Integrações</h3><p>Conecte seus aplicativos e serviços favoritos ao JARVIS para ampliar suas possibilidades.</p></header>
    <div id="integrations-catalog-view">
      <label class="integrations-search-label" for="integrations-search">Pesquisar integrações</label>
      <div class="integrations-search"><i data-lucide="search" aria-hidden="true"></i><input id="integrations-search" type="search" placeholder="Buscar por nome, categoria ou descrição" autocomplete="off"></div>
      <div id="integrations-filters" class="integrations-filters" role="group" aria-label="Filtrar integrações"></div>
      <p id="integrations-connection-note" class="integrations-connection-note"></p>
      <p id="integrations-count" class="integrations-count" role="status" aria-live="polite" aria-atomic="true"></p>
      <div id="integrations-grid" class="integrations-grid"></div>
      <p id="integrations-empty" class="integrations-empty" hidden></p>
    </div>
    <section id="integration-details" class="integration-details" aria-labelledby="integration-details-name" hidden>
      <button id="integration-details-back" type="button"><i data-lucide="arrow-left" aria-hidden="true"></i>Voltar ao catálogo</button>
      <div id="integration-details-content"></div>
    </section>
  </section>`;
  const get = <T extends HTMLElement = HTMLElement>(id: string): T =>
    container.querySelector<T>('#' + id)!;
  const grid = get('integrations-grid'),
    empty = get('integrations-empty');
  const search = get<HTMLInputElement>('integrations-search');
  const filters = get('integrations-filters');
  const catalogView = get('integrations-catalog-view'),
    details = get('integration-details');
  const hasConnected = catalog.some((integration) => integration.status === 'connected');
  get('integrations-connection-note').textContent = hasConnected
    ? ''
    : 'Você ainda não possui integrações conectadas.';
  get('integrations-connection-note').hidden = hasConnected;
  let filter: IntegrationFilter = 'all';
  let selectedCard: HTMLButtonElement | null = null;

  function icon(name: string): HTMLElement {
    const node = document.createElement('i');
    node.dataset.lucide = name;
    node.setAttribute('aria-hidden', 'true');
    return node;
  }
  function text(tag: string, value: string, className = ''): HTMLElement {
    const node = document.createElement(tag);
    node.textContent = value;
    node.className = className;
    return node;
  }
  function showDetails(integration: IntegrationDefinition, card: HTMLButtonElement): void {
    selectedCard = card;
    const content = get('integration-details-content');
    content.replaceChildren();
    const mark = text('div', '', 'integration-service-icon');
    mark.append(icon(integration.icon));
    const heading = text('h4', integration.name);
    heading.id = 'integration-details-name';
    heading.tabIndex = -1;
    const list = document.createElement('ul');
    for (const capability of integration.capabilities) list.append(text('li', capability));
    content.append(
      mark,
      heading,
      text('p', integration.category, 'integration-category'),
      text('span', integrationStatusLabels[integration.status], 'integration-status'),
      text('p', integration.description),
      text('h5', 'Recursos planejados'),
      list,
    );
    if (integration.status === 'coming_soon')
      content.append(
        text(
          'p',
          'Esta integração ainda não está disponível. Estamos preparando o suporte para uma versão futura do JARVIS.',
          'integration-unavailable',
        ),
      );
    catalogView.hidden = true;
    details.hidden = false;
    refreshIcons();
    heading.focus();
  }
  function render(): void {
    grid.replaceChildren();
    get('integrations-connection-note').hidden = hasConnected || filter === 'connected';
    const matches = filterIntegrations(catalog, search.value, filter);
    for (const integration of matches) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'integration-card';
      card.dataset.integrationId = integration.id;
      card.setAttribute(
        'aria-label',
        `Ver detalhes de ${integration.name}. ${integrationStatusLabels[integration.status]}.`,
      );
      const top = text('span', '', 'integration-card-top');
      const mark = text('span', '', 'integration-service-icon');
      mark.append(icon(integration.icon));
      top.append(
        mark,
        text('span', integrationStatusLabels[integration.status], 'integration-status'),
      );
      const action = text('span', 'Ver detalhes', 'integration-card-action');
      action.append(icon('chevron-right'));
      card.append(
        top,
        text('strong', integration.name),
        text('span', integration.description, 'integration-description'),
        text('span', integration.category, 'integration-category'),
        action,
      );
      card.onclick = () => showDetails(integration, card);
      grid.append(card);
    }
    get('integrations-count').textContent =
      `${matches.length} ${matches.length === 1 ? 'integração' : 'integrações'}`;
    empty.hidden = matches.length > 0;
    empty.textContent =
      filter === 'connected' && !hasConnected
        ? 'Você ainda não possui integrações conectadas.'
        : filter === 'available' && !search.value.trim()
          ? 'Nenhuma integração disponível no momento.'
          : 'Nenhuma integração encontrada.';
    for (const button of filters.querySelectorAll<HTMLButtonElement>('button'))
      button.setAttribute('aria-pressed', String(button.dataset.filter === filter));
    refreshIcons();
  }
  const options: readonly [IntegrationFilter, string][] = [
    ['all', 'Todas'],
    ['connected', 'Conectadas'],
    ['available', 'Disponíveis'],
    ['coming_soon', 'Em breve'],
  ];
  for (const [value, label] of options) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.dataset.filter = value;
    button.onclick = () => {
      filter = value;
      render();
    };
    filters.append(button);
  }
  search.oninput = render;
  get('integration-details-back').onclick = () => {
    details.hidden = true;
    catalogView.hidden = false;
    if (selectedCard?.isConnected) selectedCard.focus();
    else search.focus();
  };
  render();
}
