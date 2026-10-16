# Billetera compartida + Guardián

Una billetera compartida que no guarda dinero, protegida por un guardián que cualquier app de Open Payments puede usar.

- Plan completo: [docs/plan-v6.md](docs/plan-v6.md)
- Cómo trabajar con la IA: [docs/guia-trabajo-con-ia.md](docs/guia-trabajo-con-ia.md)
- Reglas para agentes de IA: [AGENTS.md](AGENTS.md)

## Arrancar

```bash
git clone <este-repo> hackathon
git clone https://github.com/interledger/open-payments-snippets open-payments-snippets
cd hackathon
npm install
cp .env.example .env   # y llena tus valores
git checkout -b <tu-rama>   # r1-miembros · r2-pagos · r3-motor · r4-web · r5-guardian
```

`open-payments-snippets` va en una carpeta **hermana** (al lado de este repo), no adentro.

## Ramas

`r1-miembros`, `r2-pagos`, `r3-motor`, `r4-web`, `r5-guardian`. Cada uno sube su rama; R3 fusiona a `main` cada hora.
