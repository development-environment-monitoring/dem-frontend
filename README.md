# DEM Frontend

Frontend em React + Vite para o projeto DEM.

## Requisitos

- Node.js 20+ recomendado
- npm

## Como rodar localmente

1. Acesse a pasta do projeto:
   ```bash
   cd dem-frontend
   ```
2. Instale as dependências:
   ```bash
   npm install
   ```
3. Inicie o modo de desenvolvimento:
   ```bash
   npm run dev
   ```
4. Abra no navegador a URL exibida pelo Vite.

## Scripts disponíveis

- `npm run dev`: inicia o servidor de desenvolvimento
- `npm run build`: gera a versão de produção em `dist/`
- `npm run preview`: serve a build localmente para validação

## Variáveis de ambiente

### `VITE_API_BASE_URL`

Define a URL base da API consumida pelo frontend.

- **Valor padrão no código:** `http://127.0.0.1:3026`
- **Valor padrão no Docker build:** `http://localhost:3026`
- O frontend adiciona automaticamente o prefixo `/api` nas requisições.

Exemplo:

```bash
VITE_API_BASE_URL=http://localhost:3026 npm run dev
```

Ou em um arquivo `.env`:

```env
VITE_API_BASE_URL=http://localhost:3026
```

## Docker

O projeto também possui `Dockerfile` para build da imagem e uso com Nginx.

A variável de build suportada é:

- `VITE_API_BASE_URL`

Exemplo:

```bash
docker build --build-arg VITE_API_BASE_URL=http://localhost:3026 -t dem-frontend .
```

## Observações

- O frontend usa `sessionStorage` para manter o token de autenticação.
- A porta de desenvolvimento configurada no Vite é `3027`.
