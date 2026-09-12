# AMD V620 fixture snapshot

This fixture records a non-simultaneous sample from a dual-GPU Linux host at
2026-09-04T03:57:10Z. The source files were read through a read-only SSH
session from `/sys/class/drm/card1/device` and
`/sys/class/drm/card2/device`.

The two DRM device links resolved to PCI devices `0000:17:00.0` and
`0000:23:00.0`, respectively. The fixture keeps the card and device names,
the `uevent` PCI slot value, and the file names and text units used by the
collector. The checked-in tree uses directories for device contents so it is
portable across filesystems. Discovery tests separately exercise the relative
`device -> ../../../0000:17:00.0` and `device -> ../../../0000:23:00.0`
link behavior captured from the source host.

No hwmon fan nodes were present on either recorded card.

Commands used, all read-only:

* `readlink /sys/class/drm/card*/device`
* `readlink /sys/class/drm/card*/device/driver`
* `sed -n '1,80p'` for each named sysfs and hwmon value file
* `amd-smi list --json`
* `amd-smi process --json`
* `amd-smi metric --json`

The optional amd-smi files contain only the fields needed by the enrichment
parser. Process arguments, environment, usernames, and credentials were not
captured. The recorded process name is the basename `llama-server`.

Core collection uses sysfs and hwmon only. The amd-smi files are optional
enrichment fixtures and are not required for device discovery or core fields.

The `compat` tree is a synthetic cross-generation compatibility fixture. It
models a card whose kernel interface has `power1_input` but no
`power1_average`, and whose device has no `unique_id`. Its PCI slot and metric
values are intentionally non-production examples.
