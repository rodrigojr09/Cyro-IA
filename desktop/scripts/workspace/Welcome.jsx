import React from 'react';
import { Icon } from '../ui/Icon';
export function Welcome({ hidden, displayName, onProject, onContinue, onPrompt }) {
  return (
    <section id="welcome" hidden={hidden}>
      <h2>{displayName ? 'Olá, ' + displayName + '. Como posso ajudar?' : 'Como posso ajudar?'}</h2>
      <p>
        Um espaço para trabalhar, estudar e explorar ideias
        <br />e continuar de onde você parou.
      </p>
      <div className="suggestions">
        {[
          [
            'suggest-project',
            'folder-search',
            'Abrir um Espaço Virtual',
            'Documentos fiscais, planilhas e sua operação',
            onProject,
          ],
          [
            'suggest-continue',
            'history',
            'Continuar uma conversa',
            'Retome um assunto na barra lateral',
            onContinue,
          ],
          [
            'suggest-email',
            'mail',
            'Escrever um e-mail',
            'Encontre as palavras para seu objetivo',
            () => onPrompt('Ajude-me a escrever um e-mail sobre '),
          ],
          [
            'suggest-idea',
            'idea',
            'Explorar uma ideia',
            'Transforme uma possibilidade em plano',
            () => onPrompt('Quero explorar a seguinte ideia: '),
          ],
          [
            'suggest-study',
            'book',
            'Estudar um assunto',
            'Explicações, exercícios e planos de estudo',
            () => onPrompt('Ajude-me a estudar '),
          ],
          [
            'suggest-summary',
            'text',
            'Resumir um texto',
            'Cole o conteúdo que deseja resumir',
            () => onPrompt('Resuma o seguinte texto: '),
          ],
        ].map(([id, icon, title, description, onClick]) => (
          <button id={id} key={id} onClick={onClick}>
            <Icon name={icon} />
            <strong>{title}</strong>
            <span>{description}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
