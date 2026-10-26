/** Local product catalog only. Statuses are data, never inferred from UI actions. */
export type IntegrationStatus =
  'coming_soon' | 'available' | 'connected' | 'disconnected' | 'error';
export type IntegrationFilter = 'all' | 'connected' | 'available' | 'coming_soon';

export interface IntegrationDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: string;
  readonly icon: string;
  readonly status: IntegrationStatus;
  readonly capabilities: readonly string[];
}

export const integrationStatusLabels: Readonly<Record<IntegrationStatus, string>> = Object.freeze({
  coming_soon: 'Em breve',
  available: 'Disponível',
  connected: 'Conectada',
  disconnected: 'Desconectada',
  error: 'Erro',
});

const definitions: IntegrationDefinition[] = [
  {
    id: 'spotify',
    name: 'Spotify',
    category: 'Música e entretenimento',
    icon: 'music-2',
    description: 'Controle suas músicas e reprodução diretamente pelo JARVIS.',
    status: 'disconnected',
    capabilities: [
      'Controlar a reprodução de músicas.',
      'Consultar a faixa em reprodução.',
      'Selecionar dispositivos e ajustar volume compatível.',
    ],
  },
  {
    id: 'discord',
    name: 'Discord',
    category: 'Comunicação',
    icon: 'messages-square',
    description: 'Amplie as possibilidades de comunicação com seus servidores e canais.',
    status: 'coming_soon',
    capabilities: [
      'Consultar servidores e canais autorizados.',
      'Acompanhar conversas selecionadas.',
      'Preparar mensagens para revisão.',
    ],
  },
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    category: 'Produtividade',
    icon: 'calendar-days',
    description: 'Consulte e organize seus compromissos com auxílio do JARVIS.',
    status: 'coming_soon',
    capabilities: [
      'Consultar a agenda.',
      'Preparar novos compromissos.',
      'Revisar alterações antes de salvar.',
    ],
  },
  {
    id: 'github',
    name: 'GitHub',
    category: 'Desenvolvimento',
    icon: 'git-branch',
    description: 'Conecte seus repositórios e acompanhe seus projetos de programação.',
    status: 'coming_soon',
    capabilities: [
      'Consultar repositórios autorizados.',
      'Acompanhar issues e pull requests.',
      'Resumir mudanças de um projeto.',
    ],
  },
  {
    id: 'notion',
    name: 'Notion',
    category: 'Organização',
    icon: 'notebook-pen',
    description: 'Trabalhe com suas páginas e informações organizadas no Notion.',
    status: 'coming_soon',
    capabilities: [
      'Consultar páginas autorizadas.',
      'Buscar informações organizadas.',
      'Preparar atualizações para revisão.',
    ],
  },
  {
    id: 'google-drive',
    name: 'Google Drive',
    category: 'Arquivos',
    icon: 'hard-drive',
    description: 'Prepare a integração dos seus arquivos e documentos com o JARVIS.',
    status: 'coming_soon',
    capabilities: [
      'Localizar arquivos autorizados.',
      'Consultar informações dos documentos.',
      'Selecionar conteúdo para trabalhar no JARVIS.',
    ],
  },
];

export const integrationCatalog: readonly IntegrationDefinition[] = Object.freeze(
  definitions.map((definition) =>
    Object.freeze({ ...definition, capabilities: Object.freeze([...definition.capabilities]) }),
  ),
);

function normalized(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
}

export function filterIntegrations(
  catalog: readonly IntegrationDefinition[],
  query: string,
  filter: IntegrationFilter,
): readonly IntegrationDefinition[] {
  const terms = normalized(query).split(/\s+/).filter(Boolean);
  return catalog.filter((integration) => {
    const matchesStatus =
      filter === 'all' ||
      (filter === 'available'
        ? integration.status === 'available' || integration.status === 'disconnected'
        : integration.status === filter);
    const searchable = normalized(
      `${integration.name} ${integration.category} ${integration.description}`,
    );
    return matchesStatus && terms.every((term) => searchable.includes(term));
  });
}
