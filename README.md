# JSON Formatter

Formatador e comparador de **JSON** e **XML** no navegador. Sem build, sem dependências de runtime — abra o `index.html` ou sirva a pasta.

[![CI](https://github.com/mtv-0/json-formatter/actions/workflows/ci.yml/badge.svg)](https://github.com/mtv-0/json-formatter/actions/workflows/ci.yml)

## O que faz

- **Format** e **Minify** de JSON e XML, inclusive fragmentos de XML sem raiz única
- **Tree** para navegar a estrutura
- **Diff** lado a lado nos editores A e B, com highlight no estilo Git; cards por campo no modal Detalhes
- **Histórico** local das últimas comparações e formatações
- Highlight, fold de blocos e atalhos de teclado

## Como usar

Sirva a pasta e abra no navegador (módulos ES não funcionam em `file://`):

```bash
npm start
```

Ou qualquer servidor estático apontando para a raiz do repositório.

| Atalho | Ação |
| --- | --- |
| `Ctrl+Enter` | Format (ou Compare no Diff) |
| `Ctrl+M` | Minify |
| `Ctrl+T` | Tree |
| `Ctrl+D` | Liga / desliga Diff |
| `Ctrl+Shift+Enter` | Compare |
| `Ctrl+H` | Histórico |
| `?` | Ajuda |

No Mac, use `⌘` no lugar de Ctrl.

## Estrutura

```
src/
  app.js              # liga UI, atalhos e ações
  core/               # parse de JSON/XML — sem DOM de página
  format/             # highlight e árvore em texto
  diff/               # diff semântico + hunks estilo Git
  history/            # persistência no localStorage
  ui/                 # renderização no navegador
  styles/             # CSS por área (layout, editor, diff, …)
test/                 # testes unitários (node:test)
```

A lógica de parse, diff e histórico não depende do DOM da página, então pode ser testada no Node.

## Desenvolvimento

```bash
npm test
```

Requer Node 20+. O CI do GitHub Actions roda a mesma suíte em todo push/PR.

## Licença

MIT — veja [LICENSE](LICENSE).
