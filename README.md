# HackChat

Live chat + hacking-terminal simulator. Deploy on Render as a Node web service.

## Deploy on Render (FREE plan ready)
1. Push this folder to GitHub.
2. Render → New → Web Service → connect repo. Plan: Free.
3. Build: `npm install`, Start: `npm start`. Node 18+.
4. No disk / no env vars needed — `render.yaml` is free-compatible.

How it survives free-tier sleep: server pays catch-up mining on wake
(capped), each device keeps a full account backup in localStorage and
silently re-registers (same host/port/balance/hacks) if the server was
wiped, and chat caches the last messages on device. Browsers open also
ping `/api/ping` every 5 min while someone is online.
Optional: add a free UptimeRobot monitor on `https://YOUR.onrender.com/api/ping`
to reduce sleep.

## The last 1%: permanent tamper-proof DB (optional, free)
Code already supports it — I chose **MongoDB** over Supabase because your
data is plain JSON documents (users/messages/bans): one connection string,
no SQL tables to create.

- Do nothing: site runs in fallback mode (device-backup self-heal). Works.
- For bulletproof mode: create a free Atlas M0 cluster once (~4 min):
  1. mongodb.com → free account → Create → M0 Free → any region.
  2. Database Access → add user + password. Network Access → Allow `0.0.0.0/0`.
  3. Cluster → Connect → Drivers → copy the `mongodb+srv://...` string.
  4. Render → your service → Environment → add `MONGODB_URI` = that string → Save (auto-redeploys).
Server auto-detects it on boot (`MongoDB: loaded N users...` in logs) and
persists every change there. Balances/hacks then come from the server, not
from device restore, so they can't be edited via localStorage and bans
survive wipes.

## Run locally
```
npm install
npm start
```
Open http://localhost:3000

## Game manual (v0.2)

### Getting online — you start OFFLINE
The terminal is gated. A red banner at the top always tells you what you need.

1. `internet` (or click **NET**) → pick a network in the deck → `CONNECT`.
   - `HackChat-Free-Wifi` and `Guest-Portal` are open.
   - The other three are locked. Crack them with `netcrack` (see below), or
     try `studeNT42!` / `admin!secure` / `library!access`.
2. `vpn` (or click **VPN**) → `CONNECT FREE VPN`. Free tunnel lasts **60 seconds**
   then auto-closes and can be reconnected any time.
3. `install mullvad` → opens the Mullvad deck. `Buy Mullvad VPN` costs **10000$**
   and is **permanent** — then the **MUL** button appears in the top bar and you
   can route through 10 countries (US, CA, DE, NL, GB, CH, JP, SG, SE, AU).

Only `help`, `clear`, `whoami`, `version`, `net`, `internet`, `vpn`, `mullvad`
work without internet. Everything else needs the grid; `install`, `bruce`, `nos`,
`nmap`, `scan`, `crack`, `open`, `db`, `netcrack`, `transfer` and `leak`
additionally need an **active VPN**.

### Chat (left)
Live messages + photos, typing indicator, notification sound toggle. Click a
sender (or their avatar) to open their profile **inside the chat tab**: rank,
rank-progress bar, hack count, balance, mining rate, host. On your own profile
you can rename yourself, set an avatar by URL or upload, wipe the local account,
and open your own `host:port`.

### Terminal (right)
| command | what it does |
|---|---|
| `help` | full command list |
| `clear` | clear the screen |
| `whoami` | name, host, balance, rank |
| `history` | last 25 commands (also `↑`/`↓` in the input) |
| `version` | version banner |
| `users` | every user on the grid |
| `store` / `balance` | balance, hacks, rank, income, progress |
| `rank [host]` | rank lookup for a host |
| `top` / `leaderboard` | top 20 by balance |
| `stats` | server stats (users, online, messages, storage) |
| `uptime` | server uptime |
| `color [0-9]` | terminal colour: 0 green, 1 white, 2 cyan, 3 magenta, 4 yellow, 5 red, 6 blue, 7 orange, 8 purple, 9 gray |
| `internet` / `net` | network deck |
| `vpn` | VPN deck |
| `mullvad` | Mullvad deck |
| `ping [host]` | ping a host |
| `netcrack` | crack a locked WiFi password |
| `install [pkg]` | `bruce`, `nos`, `mullvad` |
| `bruce` | password engine (1 start / 2 quit → port → timed crack) |
| `nos` / `nmap` / `scan` | port scanner (1 scan / 2 quit → host → 4-6 ports, 1 open) |
| `open [path]` | open a remote core: `[host]/[port]/core/[name]` |
| `db open` | admin control deck |
| `neofetch` | system info card |
| `fortune` | random fortune |
| `echo [text]` | echo text |
| `encrypt [text]` / `decrypt [b64]` | base64 encode / decode |
| `matrix` | toggle matrix rain |
| `theme` / `theme light` | toggle dark / light |
| `notify` | test a desktop notification |
| `afk` | toggle away mode |
| `sudo [cmd]` | try to escalate (good luck) |
| `wipe` | wipe the local account |
| `lsusers`, `bal`, `crack` | aliases |

### Hacking flow
`nos` → scan a victim host → copy the **OPEN** port → `bruce` → paste the port →
watch the ETA countdown → password revealed → `1` copies the `open ...` path →
`open ...` → enter the password → `1` balance → `1` transfer / `2` leak.
Invalid host or port reports *"does not exist"*.

### Password strength → crack time
letters only = 10s, `+symbol` = 30s, `+number` = +30s (so letters+symbols+numbers
= 60s). The ETA is shown live while cracking.

### Mining & ranks
You earn every 10s **only while the browser tab is open** — hide the tab and
mining stops immediately. Ranks: 1+ bronze (10$), 3+ silver (18$), 5+ gold
(28$), 7+ elite (38$), 10+ legend (50$/10s).

### Admin
`db open` in the terminal. Floating white/blue deck lists ALL users, set
balance, ban (banned device gets a fresh account on next open, old
progress/name/pic gone). Admin password lives server-side only.
