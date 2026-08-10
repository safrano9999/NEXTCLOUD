# NEXTCLOUD

> **Type:** standalone synchronization/calendar tools with an optional
> OpenClaw plugin.
>
> Source checkout supports bare-metal CLI use with a separately installed
> `nextcloudcmd`. Release ZIPs are platform-specific OpenClaw plugin packages,
> not generic bare-metal installers.

[![OpenClaw plugin](https://github.com/safrano9999/NEXTCLOUD/actions/workflows/openclaw-plugin-release.yml/badge.svg)](https://github.com/safrano9999/NEXTCLOUD/actions/workflows/openclaw-plugin-release.yml)

NEXTCLOUD provides deterministic file synchronization through `nextcloudcmd`
and calendar access through CalDAV or exported iCalendar feeds. The OpenClaw
plugin adds commands, a tool, an authenticated webhook, recurring syncs, and
optional channel delivery.

## Features

- Multiple Nextcloud accounts with deterministic numeric suffixes.
- One or more local-to-remote folder mappings per account.
- CalDAV discovery and public iCalendar export support.
- Expansion of recurring calendar events.
- Independent file-sync and calendar switches.
- Per-account sync intervals.
- OpenClaw tool `nextcloud_run`.
- OpenClaw slash command `/nextcloud`.
- Authenticated calendar webhook at `POST /plugins/nextcloud/run`.
- Optional outbound delivery through an OpenClaw channel adapter.
- Bundled `nextcloudcmd` runtimes for Fedora 44 and Debian 12 plugin installs.

## Supported deployment modes

| Mode | Status | What is provided |
|---|---|---|
| Bare metal | **Supported** | Python sync and calendar CLIs; `nextcloudcmd` must be installed separately |
| OpenClaw | **Supported** | Optional Fedora 44 or Debian 12 release ZIP with a bundled `nextcloudcmd` runtime |
| Hermes | **Not provided** | This repository contains no Hermes plugin, hook, or manifest |

The files under `image/runtime/` provide the rootfs overlay for image-style
deployments at `/opt/safrano9999/NEXTCLOUD`. Generic bare-metal use does not
require them.

## Releases

The [latest release](https://github.com/safrano9999/NEXTCLOUD/releases/latest)
contains two x86-64 OpenClaw packages:

- **Fedora 44:**
  [`nextcloud-fedora64-plugin-latest.zip`](https://github.com/safrano9999/NEXTCLOUD/releases/download/latest/nextcloud-fedora64-plugin-latest.zip)
  · [SHA-256](https://github.com/safrano9999/NEXTCLOUD/releases/download/latest/nextcloud-fedora64-plugin-latest.zip.sha256)
- **Debian 12:**
  [`nextcloud-debian64-plugin-latest.zip`](https://github.com/safrano9999/NEXTCLOUD/releases/download/latest/nextcloud-debian64-plugin-latest.zip)
  · [SHA-256](https://github.com/safrano9999/NEXTCLOUD/releases/download/latest/nextcloud-debian64-plugin-latest.zip.sha256)

The Fedora package pins the CLI source to **33.0.7** on Fedora 44. The Debian
package pins the Bookworm CLI package to **3.7.3-1+deb12u2** on Debian 12.
These are the exact combinations validated by the release build. Select the
archive that matches the OpenClaw runtime's operating-system family.

Both ZIPs are assembled and validated as **OpenClaw plugin packages**. For
bare-metal use, clone the source and provide `nextcloudcmd` through the host
operating system.

## Bare-metal installation

Clone the source and install its Python dependencies:

```bash
git clone https://github.com/safrano9999/NEXTCLOUD.git
cd NEXTCLOUD
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
cp env.example .env
chmod 600 .env
```

Install `nextcloudcmd` for the host operating system. The sync script checks,
in order:

1. the `NEXTCLOUDCMD` environment variable;
2. `runtime/opt/nextcloudcmd/bin/nextcloudcmd`;
3. `/opt/nextcloudcmd/bin/nextcloudcmd`;
4. `nextcloudcmd` on `PATH`.

Inspect configured accounts:

```bash
.venv/bin/python nextcloud_sync.py --status
```

Initialize local directories and synchronize all configured accounts:

```bash
.venv/bin/python nextcloud_sync.py --init
.venv/bin/python nextcloud_sync.py
```

Synchronize only account 2:

```bash
.venv/bin/python nextcloud_sync.py --account 2
```

Fetch and format upcoming calendar events:

```bash
mkdir -p LOGS
.venv/bin/python calendar_fetch.py \
  --calenv ./.env \
  --logdir ./LOGS \
  --account-prefix NEXTCLOUD \
  --timezone Europe/Vienna \
  --days 7
```

## OpenClaw installation

Choose exactly one runtime archive.

### Fedora 44

```bash
curl -fL \
  -o nextcloud-fedora64-plugin-latest.zip \
  https://github.com/safrano9999/NEXTCLOUD/releases/download/latest/nextcloud-fedora64-plugin-latest.zip
curl -fL \
  -o nextcloud-fedora64-plugin-latest.zip.sha256 \
  https://github.com/safrano9999/NEXTCLOUD/releases/download/latest/nextcloud-fedora64-plugin-latest.zip.sha256
sha256sum -c nextcloud-fedora64-plugin-latest.zip.sha256
openclaw plugins install ./nextcloud-fedora64-plugin-latest.zip \
  --force \
  --dangerously-force-unsafe-install
openclaw gateway restart
```

### Debian 12

```bash
curl -fL \
  -o nextcloud-debian64-plugin-latest.zip \
  https://github.com/safrano9999/NEXTCLOUD/releases/download/latest/nextcloud-debian64-plugin-latest.zip
curl -fL \
  -o nextcloud-debian64-plugin-latest.zip.sha256 \
  https://github.com/safrano9999/NEXTCLOUD/releases/download/latest/nextcloud-debian64-plugin-latest.zip.sha256
sha256sum -c nextcloud-debian64-plugin-latest.zip.sha256
openclaw plugins install ./nextcloud-debian64-plugin-latest.zip \
  --force \
  --dangerously-force-unsafe-install
openclaw gateway restart
```

The plugin creates its Python virtual environment on first use unless
`autoSetupPython` is disabled.

Available commands:

```text
/nextcloud
/nextcloud status
/nextcloud sync
/nextcloud sync 2
/nextcloud calendar
```

`/nextcloud sync` returns the calendar view followed by the file-sync result.
The webhook runs the calendar operation only:

```bash
curl -fsS -X POST \
  -H "Authorization: Bearer ${OPENCLAW_GATEWAY_TOKEN}" \
  "http://127.0.0.1:${OPENCLAW_GATEWAY_PORT:-18789}/plugins/nextcloud/run"
```

## Account configuration

Use an app password rather than the interactive Nextcloud login password:

```dotenv
NEXTCLOUD_URL=https://cloud.example.net
NEXTCLOUD_USER=alice
NEXTCLOUD_PW=replace-with-app-password
NEXTCLOUD_SYNC_FOLDERS=/srv/nextcloud|/
NEXTCLOUD_TIMER=15m
NEXTCLOUD_CALENDAR=1
```

Additional accounts use two-digit suffixes:

```dotenv
NEXTCLOUD_URL_02=https://cloud.example.net
NEXTCLOUD_USER_02=bob
NEXTCLOUD_PW_02=replace-with-app-password
NEXTCLOUD_SYNC_FOLDERS_02=/srv/nextcloud-bob|/
NEXTCLOUD_TIMER_02=30m
NEXTCLOUD_CALENDAR_02=1
```

`NEXTCLOUD_SYNC_FOLDERS` is a CSV list of `LOCAL_PATH|REMOTE_PATH` entries:

```dotenv
NEXTCLOUD_SYNC_FOLDERS=/srv/documents|/Documents,/srv/photos|/Photos
```

Rules:

- Local paths must be absolute.
- Both sides of every `LOCAL_PATH|REMOTE_PATH` pair must be present.
- A blank `NEXTCLOUD_SYNC_FOLDERS` disables file synchronization.
- `NEXTCLOUD_CALENDAR=1` enables CalDAV calendar discovery for that account.
- `NEXTCLOUD_TIMER=0` disables recurring file synchronization while manual
  sync remains available.

For OpenClaw, inject these values into the gateway environment or keep a
protected `.env` beside the installed plugin. The plugin's `envFile` option is
also passed to the calendar reader; process-level variables are the most
predictable choice for both file sync and timer setup.

## OpenClaw configuration

Plugin settings belong under `plugins.entries.nextcloud.config`:

```json
{
  "plugins": {
    "entries": {
      "nextcloud": {
        "enabled": true,
        "config": {
          "timezone": "Europe/Vienna",
          "autoSetupPython": true,
          "webhook": {
            "enabled": true,
            "path": "/plugins/nextcloud/run"
          },
          "delivery": {
            "channel": "telegram",
            "target": "123456789"
          }
        }
      }
    }
  }
}
```

| Setting | Default | Purpose |
|---|---|---|
| `configPath` | packaged `config.json` | Alternate plugin JSON configuration |
| `pythonPath` | automatic | Explicit Python interpreter |
| `envFile` | `.env` | Credential/calendar environment file |
| `logDir` | `LOGS` | Calendar run-log directory |
| `certPath` | `certs/cert.pem` | CA certificate used for calendar TLS verification |
| `timezone` | `Europe/Vienna` | Calendar display and query timezone |
| `emptyMessage` | localized default | Message returned when no events exist |
| `autoSetupPython` | `true` | Create the plugin-local virtual environment |
| `webhook.enabled` | `true` | Register the calendar webhook |
| `webhook.path` | `/plugins/nextcloud/run` | Gateway route |
| `delivery.channel` | `telegram` | OpenClaw outbound adapter |
| `delivery.target` | unset | Recipient; delivery is disabled when absent |
| `delivery.accountId` | unset | Optional channel account |

## Timers and systemd

Inside OpenClaw, the plugin starts in-process fallback timers from injected
`NEXTCLOUD_TIMER` variables. It waits two minutes before the first scheduled
sync and prevents overlapping syncs for the same account.

Image deployments consume the repository-owned runtime overlay directly:

```text
image/runtime/etc/systemd/system/nextcloud-sync@.service
image/runtime/usr/lib/systemd/system-generators/nextcloud-timer-generator
```

The service intentionally expects the application at
`/opt/safrano9999/NEXTCLOUD`. The generator reads
`NEXTCLOUD_TIMER` and `NEXTCLOUD_TIMER_XX` from its systemd generator environment
and creates one recurring `nextcloud-sync@N.timer` for every enabled account.
It also links the same `nextcloud-sync@N.service` into the boot transaction, so
the identical one-shot runs once during startup and again whenever its timer
elapses. The timer is armed before the initial one-shot and schedules its next
run from that service's completion; no separate initial-sync target is used.
Adapt the unit and environment explicitly for another bare-metal layout.

## Security and storage

- Store Nextcloud credentials as app passwords in a mode-`0600` `.env` file or
  a protected service environment.
- Do not commit `.env`, certificates, logs, synchronized files, virtual
  environments, or release archives; the repository ignores these paths.
- Every configured sync maps a remote path into a local absolute directory.
  Review mappings before the first run to avoid writing into the wrong tree.
- The calendar client verifies TLS only when `certPath` names an existing CA
  file. Without one, the current implementation disables certificate
  verification for calendar requests.
- The OpenClaw webhook uses gateway authentication. Keep its bearer token
  private and avoid exposing the gateway directly.
- Calendar output and synchronized files can contain untrusted remote content.

## Development and checks

Run the source checks:

```bash
npm run check
```

This validates `index.js` and compiles the Python entry points. Tagged release
builds additionally:

- build and execute both platform `nextcloudcmd` runtimes;
- verify their runtime-library closure;
- package each runtime with the OpenClaw plugin;
- test both ZIP archives and SHA-256 files;
- publish the four files to the tagged release and the `latest` alias.
