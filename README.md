# MBF Cost Dashboard

Painel de gestão de custos por conta/cliente da AWS. Consome a **AWS Cost Explorer API**,
resolve os nomes das contas via **AWS Organizations** e aplica uma **margem configurável por
conta**, servindo como base para cobrança de clientes.

Roda na conta de gestão (MBF) e enxerga o custo de todas as contas da organização.

## Arquitetura

- **Runtime:** Node.js 22 (Lambda)
- **Infra:** AWS SAM (HttpApi + Lambda)
- **Fontes de dados:** Cost Explorer (`GetCostAndUsage`) + Organizations (`ListAccounts`)
- **Sem dependências de framework web** — handler HTTP nativo

```
src/
  handler.js       # roteamento, auth por token, monta o payload
  costService.js   # Cost Explorer + Organizations
  margin.js        # cálculo de margem/lucro (testável, sem AWS)
  dashboard.js     # renderização do dashboard HTML
test/
  margin.test.js   # testes unitários da lógica de margem
template.yaml      # stack SAM
samconfig.toml     # parâmetros de deploy
```

## Endpoints

| Rota          | Auth        | Descrição                                  |
|---------------|-------------|--------------------------------------------|
| `GET /health` | pública     | Health check                               |
| `GET /api/costs` | token    | Custos (mês atual + anterior) em JSON      |
| `GET /`       | token       | Dashboard HTML                             |

Autenticação: header `x-access-token: <TOKEN>` ou query `?token=<TOKEN>`.

## Configuração

Parâmetros do `template.yaml` (definidos no `samconfig.toml`):

- `AccessToken` — token de acesso ao painel.
- `MarginMap` — JSON `{ "<accountId>": <multiplicador>, "default": 1.0 }`.
  Ex: `{"532404260870":1.5,"default":1.0}` cobra 1,5× o custo da conta 532404260870.

> **Atenção:** ao passar `MarginMap` em `sam deploy --parameter-overrides` via shell,
> o JSON pode ser cortado. Use a lista `parameter_overrides` no `samconfig.toml`
> (já configurado) para preservar as aspas.

## Deploy

```bash
npm install
sam build
sam deploy   # usa os parâmetros do samconfig.toml
```

## Testes

```bash
npm test     # node --test
```

## Observações

- Cost Explorer leva ~24h para processar custos de contas recém-criadas e do dia corrente.
- Valores em USD (métrica `UnblendedCost`).
