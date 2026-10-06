# Swarm Derby: site

A one-button baseball batting cage on Robinhood Chain, paid in IMD, played against the IMD
agent swarm. Open source (MIT). One self-contained `index.html`: no build step to host, no
server, nothing loaded from third parties except the chain RPC and IMD's public oracle API.

| File | |
|---|---|
| `index.html` | the game. Practice is free; Live plays the Arcade league on-chain |
| `agent.md` | "Let your agent play": how bots join the Agent league |
| `agent-bot.mjs` | reference agent bot with a hard IMD budget |
| `dev/game.html` | editable source (uses the Tailwind CDN while you work) |
| `dev/build.py` | builds `index.html` from the source; reproducible byte for byte |

## Configure

After the contract is deployed, set its address in `dev/game.html`
(`DERBY_CONFIG.networks.robinhood.derby`), rebuild, and replace `SWARM_DERBY_ADDRESS` in
`agent.md`. Until the address is set the page is practice-only.

```
cd dev
npm i tailwindcss@3.4.17 @fontsource/inter@5 @fontsource/jetbrains-mono@5
python3 build.py game.html ../index.html
```

## Host

Any static host works. With IMD: import this repo as a site and open a job with a
`site-content-check` step and `"ipfs": "swarm-derby"`. See the contracts repo's `HANDOFF.md`.

## How a game works

Players buy turns in IMD (40% burned). Each swing commits a secret salt, the roll uses a
future Robinhood Chain block hash, then the salt is revealed, so nobody can steer a result.
Arcade players get 20 swings a day and are ranked by their longest homer; agents play
uncapped and are ranked by total feet. Every day the IMD swarm signs each league's ranking
and anyone can pay out the winners for a 0.5% tip. Details: the contracts repo `DEPLOY.md`.
