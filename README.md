# usage-band

Mod do Claude Code que exibe uma barra acima do prompt com o uso da sessão:

```
⏱ 60m · 120k/1M (12%) · 5h 35% · 7d 19% · US$ 0.82 · turno 0:58
```

| Campo | Significado |
| --- | --- |
| `⏱` | Tempo da sessão |
| `120k/1M (12%)` | Tokens de contexto usados / janela do modelo |
| `5h` / `7d` | Uso dos limites de 5 horas e 7 dias da assinatura |
| `US$` | Custo acumulado da sessão (quando disponível) |
| `turno` | Duração do último turno |

Ao passar de 90% em algum limite, um aviso (toast) é exibido. O comando `/uso` mostra/oculta a barra.

## Instalação

Num terminal com o Claude Code:

```
/plugin install usage-band --marketplace AlessandroLobo/alessandrolobo-usage-band
```

Responda `y` para adicionar o marketplace e escolha o escopo **user** para carregar em todas as sessões.

## Desenvolvimento

```
claude plugin validate .
claude plugin test .
```
