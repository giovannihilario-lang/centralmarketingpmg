# API local do PMG Connect

O serviço local existe para rotas que dependem do SQL Server acessível na rede PMG e para a persistência local compartilhada de Campanhas.

## Rotas

Os arquivos de `local-api/` são registrados pelo `server.js` em `/api/<nome>`. Eles têm prioridade sobre rotas homônimas de `api/` no servidor local.

Todas as rotas de `local-api/` exigem, por padrão, um **Bearer token válido do Supabase Auth**. A exceção é a camada `api/`, que decide autenticação individualmente conforme o endpoint.

A proteção pode ser desligada somente para diagnóstico com:

```env
PMG_LOCAL_API_REQUIRE_AUTH=false
```

Não use essa opção em operação normal.

## Origem e rede privada

O servidor aceita a própria origem, localhost, a origem Vercel prevista no projeto e os valores extras de:

```env
PMG_ALLOWED_ORIGINS=https://exemplo.interno
```

A resposta também inclui os cabeçalhos necessários para acesso a rede privada pelo navegador.

## Campanhas

As definições do Campaign Studio são sincronizadas entre o IndexedDB e:

```text
data/campanhas-studio-v5.json
```

Isso evita perda por limpeza do cache do navegador. O arquivo pertence à instalação do serviço local; para compartilhamento entre vários computadores, o Node deve estar centralizado em uma máquina/servidor acessível a todos.
