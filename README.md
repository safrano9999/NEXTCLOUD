# NEXTCLOUD

Deterministic OpenClaw plugin for Nextcloud file synchronization and calendar
access. It replaces the separate CALENDAR plugin for Nextcloud accounts.

Commands:

```text
/nextcloud
/nextcloud sync
/nextcloud sync 2
/nextcloud calendar
```

Enter this to trigger the calendar webhook from inside a container:

```bash
curl -sS -X POST -H "Authorization: Bearer ${OPENCLAW_GATEWAY_TOKEN}" "http://127.0.0.1:${OPENCLAW_GATEWAY_PORT:-18789}/plugins/nextcloud/run"
```

Configuration is kept in one repeatable `env.example` group. Each
`NEXTCLOUD_SYNC_FOLDERS` value is CSV; every entry maps
`LOCAL_PATH|REMOTE_PATH`. Account 2 uses `_02`, account 3 uses `_03`, and so
on. The generated defaults are `/named_volumes/NEXTCLOUD|/`,
`/named_volumes/NEXTCLOUD_02|/`, and so on. These paths become named-volume
mounts in generated Compose and Quadlet files; every configured local path is
created idempotently even when it is not a volume. `NEXTCLOUD_TIMER=0` disables
its automatic timer while manual sync remains available.

Release artifacts:

```text
nextcloud-fedora64-plugin-latest.zip
nextcloud-debian64-plugin-latest.zip
```
