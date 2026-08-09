from __future__ import annotations

import os
from pathlib import Path
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
GENERATOR = ROOT / "image/runtime/usr/lib/systemd/system-generators/nextcloud-timer-generator"


class NextcloudTimerGeneratorTests(unittest.TestCase):
    def test_orders_dynamic_instances_after_persistainer(self) -> None:
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
            self.assertIn("Wants=nextcloud-initial-sync.target", timer)

            initial = (output / "nextcloud-initial-sync.target").read_text(
                encoding="utf-8"
            )
            self.assertIn(
                "Wants=nextcloud-sync@1.service nextcloud-sync@3.service",
                initial,
            )
            self.assertIn(
                "After=persistainer.service nextcloud-sync@1.service "
                "nextcloud-sync@3.service",
                initial,
            )
            self.assertTrue(
                (output / "multi-user.target.wants/nextcloud-initial-sync.target")
                .is_symlink()
            )
            for dependent in (
                "citadel-scan.service",
                "openclaw-ephemeral-schedule.service",
            ):
                dropin = output / f"{dependent}.d/50-nextcloud-instances.conf"
                self.assertIn(
                    "After=nextcloud-initial-sync.target",
                    dropin.read_text(encoding="utf-8"),
                )

            self.assertFalse((output / "nextcloud-sync@4.timer").exists())

            service = (
                ROOT
                / "image/runtime/etc/systemd/system/nextcloud-sync@.service"
            ).read_text(encoding="utf-8")
            self.assertIn("Requires=persistainer.service", service)
            self.assertIn("TimeoutStartSec=infinity", service)


if __name__ == "__main__":
    unittest.main()
