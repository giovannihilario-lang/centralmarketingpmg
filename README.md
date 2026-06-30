# Portal de Marketing — PMG Atacadista

Site interno do departamento de marketing da PMG, hospedado no Vercel.

## Estrutura do projeto

```
pmg-marketing/
├── api/
│   ├── produtos.js      ← proxy para a API de produtos da PMG
│   └── img-proxy.js     ← proxy para imagens dos produtos
├── public/
│   ├── index.html       ← portal principal (home)
│   └── ferramentas/
│       └── catalogo.html ← gerador de catálogo em PDF
└── vercel.json          ← configuração de rotas
```

## Como publicar no Vercel

### 1. Instale a CLI do Vercel (uma vez só)
```bash
npm install -g vercel
```

### 2. Faça login
```bash
vercel login
```

### 3. Dentro da pasta do projeto, publique
```bash
cd pmg-marketing
vercel --prod
```

O Vercel detecta automaticamente os arquivos em `/api` como serverless functions e os arquivos em `/public` como estáticos.

---

## Variáveis de ambiente obrigatórias

Configure no painel do Vercel em **Settings → Environment Variables**:

| Variável       | Descrição                                      | Exemplo                                   |
|----------------|------------------------------------------------|-------------------------------------------|
| `PMG_API_URL`  | URL completa do endpoint de produtos da API    | `http://192.168.1.10:8080/api/produtos`   |
| `PMG_API_KEY`  | Token de autenticação (se a API exigir)        | `meu-token-secreto` (opcional)            |

> ⚠️ A API interna da PMG precisa ser acessível pela internet (ou via VPN/tunnel) para o Vercel conseguir alcançá-la. Se ela só roda na rede local, use o **Vercel Tunnel** ou exponha via **ngrok / Cloudflare Tunnel**.

---

## Adicionando novas ferramentas

Para adicionar uma nova ferramenta ao portal:

1. Crie o arquivo HTML em `public/ferramentas/nome-da-ferramenta.html`
2. Adicione o link no menu lateral em `public/index.html`
3. Se precisar de dados da API, crie a serverless function correspondente em `api/`

---

## Próximos passos planejados

- [ ] Dashboards de desempenho
- [ ] Envio de materiais por e-mail
- [ ] Banco de materiais (artes, logos, templates)
- [ ] Histórico de envios de catálogos
