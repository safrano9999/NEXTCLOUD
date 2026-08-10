from __future__ import annotations

import os
from pathlib import Path
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
GENERATOR = ROOT / "image/runtime/usr/lib/systemd/system-generators/nextcloud-timer-generator"


class NextcloudTimerGeneratorTests(unittest.TestCase):
    def test_generates_boot_syncs_and_recurring_timers(self) -> None:
        environment = {
            "PATH": os.environ.get("PATH", ""),
            "NEXTCLOUD_TIMER": "15min",
            "NEXTCLOUD_TIMER_03": "1h",
            "NEXTCLOUD_TIMER_4": "off",
        }
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary)
            subprocess.run([str(GENERATOR), str(output)], check=True, env=environment)

            timer = (output / "nextcloud-sync@1.timer").read_text(encoding="utf-8")
            self.assertIn("After=persistainer.service", timer)
            self.assertNotIn("OnBootSec=", timer)
            self.assertNotIn("nextcloud-initial-sync.target", timer)
            self.assertIn("OnUnitInactiveSec=15min", timer)
            self.assertIn("Unit=nextcloud-sync@1.service", timer)
            self.assertIn(
                "OnUnitInactiveSec=1h",
                (output / "nextcloud-sync@3.timer").read_text(encoding="utf-8"),
            )

            for index in (1, 3):
                self.assertTrue(
                    (output / f"timers.target.wants/nextcloud-sync@{index}.timer")
                    .is_symlink()
                )
                service_link = (
                    output / f"multi-user.target.wants/nextcloud-sync@{index}.service"
                )
                self.assertTrue(service_link.is_symlink())
                self.assertEqual(
                    os.readlink(service_link),
                    "/etc/systemd/system/nextcloud-sync@.service",
                )

            self.assertFalse((output / "nextcloud-sync@4.timer").exists())
            self.assertFalse((output / "nextcloud-initial-sync.target").exists())
            self.assertFalse((output / "citadel-scan.service.d").exists())
            self.assertFalse(
                (output / "openclaw-ephemeral-schedule.service.d").exists()
            )

            service = (
                ROOT
                / "image/runtime/etc/systemd/system/nextcloud-sync@.service"
            ).read_text(encoding="utf-8")
            self.assertIn("Requires=persistainer.service", service)
            self.assertIn(
                "Before=citadel-scan.service openclaw-ephemeral-schedule.service",
                service,
            )
            self.assertIn("TimeoutStartSec=infinity", service)


if __name__ == "__main__":
    unittest.main()
