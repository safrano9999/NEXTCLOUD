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

Configuration is kept in one repeatable `env.example` group. Each
`NEXTCLOUD_SYNC_FOLDERS` value is CSV; every entry maps
`REMOTE_PATH|LOCAL_PATH`. Account 2 uses `_02`, account 3 uses `_03`, and so
on. `NEXTCLOUD_TIMER=0` disables its automatic systemd timer while manual sync
remains available.

Release artifacts:

```text
nextcloud-fedora64-plugin-latest.zip
nextcloud-debian64-plugin-latest.zip
```
