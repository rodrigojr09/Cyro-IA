# Plano técnico do JARVIS Writer

## Base e incompatibilidades verificadas

Projetos e memórias são locais, com catálogo e um SQLite por projeto; chats gerais estão no Cloud. O Electron usa preload isolado e IPC validado; FastAPI usa token local. OpenAI só é acessada pelo proxy autenticado Cloud. O proxy não aceita response_format: a resposta editorial será JSON validado por Pydantic antes de qualquer operação, sem ampliar o acesso a ferramentas. A API Clipboard do Electron 44 é assíncrona e permanece separada do Writer.

## Etapas

1. Persistência: tabelas Writer no banco já isolado do projeto, documentos em blocos com IDs estáveis, versões e revisões transacionais. Tetos explícitos, sem remoção silenciosa de histórico.
2. Inteligência: classificador e propostas estruturadas pelo cliente Cloud existente, contexto seletivo e consentimento visível. Adições automáticas apenas com validação conservadora local; alterações estruturais e substituições sempre propostas.
3. Interface: árvore, editor estruturado independente da IA, assistente recolhível, comparação, cancelamento breve, aprovar/rejeitar/ajustar, histórico, desfazer e restauração.
4. Integração: projeto ativo, memória existente e configurações por projeto; IPC dedicado só para a janela principal autenticada. Nenhum caminho do modelo é executado.
5. Exportação: python-docx para Word real, Markdown/TXT adicionais; diálogo de destino no Electron e gravação atômica. Exportar nunca altera o documento.
6. Validação: testes transacionais e de conflitos/isolamento; contratos IA inválidos e indisponibilidade; DOCX OOXML e renderização quando disponível; interface e IPC no Electron real. Dados sintéticos não comprovam OpenAI paga, implantação ou Windows limpo.

Edições manuais confirmadas são commits SQLite com synchronous FULL. Alterações ainda em trânsito são sinalizadas como pendentes; nenhuma alegação de recuperação de teclas não confirmadas em falhas abruptas. Backup/ permanece intocado, sem importações ou participação no runtime. A versão global permanece 5.0.0, sem release, tag ou push.
