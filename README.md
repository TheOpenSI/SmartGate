# SmartGate

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![python](https://img.shields.io/badge/Python-3.6-3776AB.svg?style=flat&logo=python&logoColor=white)](https://www.python.org)
[![AIIA](https://img.shields.io/badge/AIIA-2025-purple.svg)](https://youtu.be/FwYv-16JMjo?si=IlkEh4MlS5sk0w-t)


## Table of Contents

- [Features](#features)
- [How it works](#how-it-works)
- [SmartGate v3 test bench (2026)](#smartgate-v3-test-bench-2026)
  - [Hardware](#hardware)
  - [Wiring and pin map](#wiring-and-pin-map)
  - [Pinmux fix](#pinmux-fix-required-every-boot)
  - [Safety rules](#safety-rules)
- [Supported Hardware](#supported-hardware)
  - [Jetson Nano (JetPack 4.6)](#jetson-nano-jetpack-46)
  - [Jetson Orin Nano (JetPack 7.2)](#jetson-orin-nano-jetpack-72)
- [Configuration](#configuration)
- [Usage](#usage)
- [Test results](#test-results)
- [Supplementary documentation](#supplementary-documentation)
- [Limitations](#limitations)
- [Team](#team)
- [Contact](#contact)
- [Contributing](#contributing)
- [Web App README](src/web-app/README.md)

Utilizing real-time object detection for endangered animal species to determine the state of a hardware-configured gate. Supports both the original Jetson Nano and the Jetson Orin Nano, using TensorRT engine optimization.

> **2026 capstone release (v3).** This version was rebuilt by a University of Canberra capstone team as a verified, reproducible **test bench** on a Jetson Orin Nano, with a stepper-driven gate, Hall-effect end-position sensing and a 3D-printed modular bench. It is a foundation for further development, **not** a field-ready product. See [Limitations](#limitations), and [`CHANGE_REGISTER.docx`](CHANGE_REGISTER.docx) for every change made to the inherited system.

## Features

Features include:

- Real-time object detection to set the state of the physical gate. The rules are set within the `config/` folder. The `config.json` file contains the general rules to set the list of stimuli that triggers the specified state of the gate (more details in [Configuration](#configuration)).

- Utilizing TensorRT engine optimization to enhance inference performance. The optimized models are saved as `.engine` files within the `models/` folder. Models are obtained from the [Marsupial](https://github.com/carlosclaiton/marsupial) dataset.

- Web server dashboard to view a live feed fetched from the camera as well as manually control state of the door.

## How it works

```
 PIR sensor ──► Jetson Orin Nano ──► Camera frames (CSI) ──► YOLOv5 (TensorRT .engine)
                     ▲                                               │
                     │                                               ▼
 Hall sensors ◄── Gate (stepper) ◄── L298N driver ◄──── Rules in config/config.json
 (open / closed)                                          (OPEN / CLOSE)
```

1. **Idle.** The state machine (`src/main/gate_states.py`) waits for the PIR sensor on pin 15 to go high.
2. **Detect.** One frame is read from the CSI camera (`nvarguscamerasrc sensor-id=0`, 1280×720 scaled to 640×480, then resized to 600 px wide) and passed to the YOLOv5 TensorRT engine (`src/main/YoloDetTRT.py`, `models/marsupial_16s.engine`).
3. **Decide.** `src/main/ruleset_decider.py` matches the detected class names against the `rules` in `config/config.json`. An `OPEN` match opens the gate, a `CLOSE` match closes it, and if both are seen the gate closes. If nothing matches, the system goes back to idle and the gate stays where it is.
4. **Actuate.** `src/main/door_control.py` steps the motor on a background thread, through the L298N on header pins 29, 31, 16 and 18.
5. **Confirm.** Stepping stops when the matching Hall-effect sensor (pin 11 open, pin 13 close) triggers, when `stop_door()` is called, or after a safety cap of `MAX_STEPS` (240 steps, five revolutions), whichever comes first.
6. **Monitor.** The web dashboard in `src/web-app` (port `8000`, GitHub login) has a Dashboard page with detection charts and a log, and a Live Stream page with the camera feed, Open/Close/Stop, Auto/Manual and sensor readings. The Jetson's own built-in page (`src/main/http_server.py`, port `8080`) shows the camera stream and has open/close buttons.

On the Orin Nano everything runs inside the `smartgate` Docker container. At boot, `smartgate.service` runs the [pinmux fix](#pinmux-fix-required-every-boot), then starts `src/main/live_detection.py` in the container. On stop or shutdown, the signal handler runs `cleanup()`, which turns every GPIO pin off.

## SmartGate v3 test bench (2026)

### Hardware

| Component | Part | Notes |
|---|---|---|
| Compute | NVIDIA Jetson Orin Nano, JetPack 7.2 | Replaced the original Jetson Nano. Its carrier board needs the [pinmux fix](#pinmux-fix-required-every-boot), so treat it as non-OEM (see [Third-party carrier board notes](#third-party-carrier-board-notes-non-oem-hardware-only)) |
| Camera | Arducam 8MP V2.3 (IMX219), CSI | CAM1 port, IMX219-C overlay set in `jetson-io.py`; code uses `sensor-id=0` |
| Motion trigger | PIR sensor module | Pin 15 |
| Gate motor | YM2754 stepper, 5-wire unipolar, 7.5° per step (48 steps per revolution) | White common wire to GND |
| Motor driver | L298N dual H-bridge | ENA and ENB jumpers fitted, so both channels are always enabled |
| Position sensing | 2 × Hall-effect sensors | Pins 11 (open) and 13 (close), active-low |
| Cooling fan | Not wired | Still listed on pin 7 in `io_control.py`, which causes a harmless "channel 7 is set to input" warning |
| Motor supply | 6 × AA battery pack (about 6–7 V) | Kept separate from the Jetson supply |
| Bench | Open modular 3D-printed ABS bench | 400 × 300 mm base, 300 × 300 mm panel, Ø4.4 mm holes for M4 fasteners. CAD in [`docs/cad/`](docs/cad/) |

### Wiring and pin map

The full as-built record is the **Smart Gate v3 Electrical Wiring Diagram, REV 0.4** in [`docs/wiring/`](docs/wiring/). Pin numbers use BOARD (physical header) numbering, as set in `src/main/io_control.py`.

| Header pin | Signal | Connected to | Direction |
|---|---|---|---|
| 29 | IN1 | L298N IN1 → OUT1 (blue coil wire) | Output |
| 31 | IN2 | L298N IN2 → OUT2 (yellow) | Output |
| 16 | IN3 | L298N IN3 → OUT3 (purple) | Output |
| 18 | IN4 | L298N IN4 → OUT4 (orange) | Output |
| 7 | FAN | Not wired (listed in code only) | Output |
| 11 | OPEN | Hall sensor, gate open | Input |
| 13 | CLOSE | Hall sensor, gate closed | Input |
| 15 | PIR | PIR sensor output (pin roles inferred from wire colours) | Input |
| 2 (and 4) | 5 V | Both Hall sensors and PIR | Power |
| 6 (and 9) | GND | L298N, Hall sensors, PIR | Ground |
| CSI | Camera | Arducam IMX219 | — |

**Hall sensor logic.** The gate counts as fully open when `OPEN` reads 0 and `CLOSE` reads 1, and fully closed when `OPEN` reads 1 and `CLOSE` reads 0.

**Stepper settings** (top of `src/main/door_control.py`):

| Setting | Value | Meaning |
|---|---|---|
| `STEP_SEQUENCE` | Two-phases-on full step | Coil pattern, in the order `[IN1, IN2, IN3, IN4]` |
| `STEP_DELAY` | 0.25 s | 4 steps per second, the speed verified on the bench at about 7 V |
| `MAX_STEPS` | 240 | Safety cap of five revolutions per move. Set it to the real travel of the gate |
| `OPEN_DIRECTION` / `CLOSE_DIRECTION` | +1 / −1 | +1 turns the shaft anticlockwise, seen from the shaft end. Swap them if the gate moves the wrong way |

Bench-test the motor without the camera or web server using `src/main/stepper_test.py`. It opens for 4 seconds, then closes for 4 seconds.

**DC motor mode.** The code still supports the earlier DC motor. Set `MOTOR_MODE = 'dc'` in `src/main/io_control.py`, remove the L298N ENB jumper, and wire pin 12 to ENB. In this mode, pins 16 and 18 drive IN3 and IN4.

| Power domain | Source | Feeds |
|---|---|---|
| Compute | Jetson Orin Nano DC supply | Jetson, camera, 3.3 V logic |
| Motor | 6 × AA battery pack | L298N motor input, stepper |
| Sensor | Jetson 5 V header pin | Hall sensors (need about 4.5 V or more; output stays at a safe 3.34 V) |
| Ground | Common ground between Jetson (pin 6) and L298N GND | All logic signals |

### Pinmux fix (required every boot)

On this unit, the motor pins boot as inputs, so the motor will not move until four SoC pinmux registers are written. `setup/sgate_boot.sh` does this, and `smartgate.service` runs it as an `ExecStartPre` step before the container starts. The registers reset on every restart. See also [Third-party carrier board notes](#third-party-carrier-board-notes-non-oem-hardware-only).

| Register | Value written by `sgate_boot.sh` | Default if the fix is not applied |
|---|---|---|
| `0x243D020` | `0x5` | `0x55` |
| `0x243D010` | `0x5` | `0x55` |
| `0x2430068` | `0x8` | `0x58` |
| `0x2430070` | `0x8` | `0x58` |

Check it worked:

```bash
for r in 0x243D020 0x243D010 0x2430068 0x2430070; do sudo busybox devmem $r; done
```

You should see 5, 5, 8, 8 (printed as hex). The wiring doc maps these registers to header pins 16, 18, 29 and 31. If you read 55, 55, 58, 58, the fix has not taken effect and the motor will not move.

### Safety rules

- **Never** connect the L298N's 5 V output to the Jetson. It is a second power source and would back-feed the board.
- The battery pack has no switch. To isolate the motor supply, remove one cell.
- Connect the battery pack only **after** the Jetson is running.
- Before connecting a real gate, fit a fuse, a power switch and the Hall sensor resistors.

## Supported Hardware

SmartGate has two supported deployment targets. Pick the one matching your hardware, however the setup
steps are different enough (bare-metal vs. containerized, JetPack 4.6 vs. 7.2) that they're kept
in separate sections below rather than interleaved.

| Hardware | JetPack | Deployment | Python |
|---|---|---|---|
| Jetson Nano | 4.6 | Bare-metal *or* Docker | 3.6 |
| Jetson Orin Nano | 7.2 | Docker only | 3.12 |

The [Configuration](#configuration) and [Usage](#usage) sections below apply to both platforms
once setup is complete `config/config.json`'s format is identical either way.

<details>
<summary><strong>Jetson Orin Nano (JetPack 7.2)</strong></summary>

#### Jetson Orin Nano (JetPack 7.2)

The project runs entirely inside Docker on this target. There is no supported bare-metal install
path on the Orin Nano currently built. While the same project could be run bare-metal, docker is strongly reccommended for stability.

* Base OS: JetPack 7.2 (L4T r39.2), flashed and booting.
* Everything: PyTorch, TensorRT, OpenCV/GStreamer, `Jetson.GPIO`, and SmartGate itself runs
  inside a single Docker container built from the repo's `Dockerfile`.
* GPIO and camera devices are passed into the container at runtime (`--device`), not baked in.
* A small number of fixes are **host-only and intentionally not part of this repo** see
  [Third-party carrier board notes](#third-party-carrier-board-notes-non-oem-hardware-only) below.
  On a proper OEM Jetson Orin Nano dev kit carrier board, none of that section applies and the
  container should work out of the box.

##### Prerequisites (one-time, per physical unit)

1. **Flash JetPack 7.2** and confirm the board boots to a login prompt.
2. **Install Docker + NVIDIA Container Toolkit** if not already present, and confirm
   `sudo docker run --rm --runtime nvidia nvcr.io/nvidia/cuda:13.2.1-cudnn-devel-ubuntu24.04 nvidia-smi`
   (or equivalent) runs without a `cudacompat` panic. If you hit
   `panic: runtime error: slice bounds out of range ... cudacompat`, see
   [Troubleshooting](#troubleshooting).

   If you also plan to run the web-app (see [Web App](#web-app)), confirm Docker Compose
   is available: `docker compose version` (bundled with recent Docker installs) or
   `docker-compose --version` (standalone). Install with:
```sh
   sudo apt-get install docker-compose
```
   if neither is found.
3. **Configure the CSI camera** via `sudo /opt/nvidia/jetson-io/jetson-io.py` →
   *Configure Jetson 22pin CSI Connector* → select the IMX219 overlay matching your physically
   connected port (A/B/C check your wiring, not just the first option), then reboot. Confirm
   `/dev/video0` exists afterward (`ls /dev/video0`).
4. If running on a **non-OEM/third-party carrier board**, apply the host-only fixes in
   [Third-party carrier board notes](#third-party-carrier-board-notes-non-oem-hardware-only)
   before continuing. Skip this step entirely on a genuine Jetson Orin Nano dev kit carrier board.

##### Build

```bash
git clone https://github.com/martin213214/SmartGate-2026.git SmartGate
cd SmartGate
sudo docker build -t smartgate:latest .
```

Use `sudo docker build --no-cache -t smartgate:latest .` instead for a truly clean first build, or
after changing base images/dependencies. Day-to-day rebuilds after code-only changes reuse cached
layers and are much faster without it.

##### Generate the TensorRT engine

The `.engine` file is hardware- and TensorRT-version-specific, so it's generated on-device, not
committed to git (add `models/*.engine` and `models/*.onnx` to `.gitignore` if not already
present). Place your `.pt` weights file in `models/` (matching the filename referenced in
`config/config.json`), then:

```bash
make run
# now inside the container:
bash setup/convert_models.sh
exit
```

The `models/` folder is volume-mounted into the container (see `Makefile`), so the resulting
`.engine` file lands back on the host and survives after the container exits.

This step converts the `.pt` weights to ONNX (via a cloned YOLOv5 v6.2, since that's what the
original model was trained/exported against) and then to a TensorRT engine (via `trtexec`). Because
the container's toolchain (Python 3.12, torch 2.13, TensorRT 10.16) is much newer than what YOLOv5
v6.2 was ever tested against, `convert_models.sh` handles a number of version-skew issues
automatically building the export dependencies into an isolated virtual environment to avoid
clashing with the system's apt-managed packages, keeping `numpy` pinned below 2.x, patching around
a `pkg_resources` removal in newer `setuptools`, and allowing `weights_only=False` for the
`torch.load()` call so a torch 2.6+ security default doesn't block loading your own checkpoint. None
of this needs manual intervention, just run the script and expect it to take a while, particularly
the final `trtexec` step, which does a real tactic search across GPU kernels for your specific
hardware.

##### Test interactively

```bash
make run
# inside the container:
python3 src/main/live_detection.py
```

Confirm the camera pipeline starts (`GST_ARGUS: ... Producer has connected; continuing.`), GPIO
initializes without errors, and the web dashboard is reachable at `http://<device-ip>:8080`
(port from `config.json`; `--network host` is used, so no port mapping is needed).

**If this fails with `OSError: [Errno 98] Address already in use`**, the boot-time systemd service
(below) is already running and holding the port `--network host` means an interactive test
container and the systemd-managed one share the same host network namespace and can't both bind
port 8080. Stop the service first (`sudo systemctl stop smartgate`), test, then start it again
(`sudo systemctl start smartgate`) once you're done.

##### Run on boot

The Docker-launch systemd unit is generated by a repo-tracked script. It's generic (device
passthrough, `JETSON_MODEL_NAME`, image name) and doesn't hardcode anything specific to a physical
unit, so it's committed to git like the rest of the setup tooling:

```bash
sudo ./setup/systemd_service_setup.sh
```

This creates, enables, and starts `/etc/systemd/system/smartgate.service`.

**2026 test bench:** the team updated this script so the service it generates runs
`setup/sgate_boot.sh` (the [pinmux fix](#pinmux-fix-required-every-boot)) as an `ExecStartPre`
step and mounts the live project folder into the container (`-v $PROJECT_DIR:/app`), so code
edits on the Nano take effect after `sudo systemctl restart smartgate` without a rebuild. (The comment
block at the top of the script still says the pinmux fix stays outside the repo. That comment is out
of date.) An older copy of the script generates a service without the fix and **overwrites** the
working one, after which the motor stops moving. Always use the version in this repo, and run the
pinmux readback check after re-running it.

Confirmed working end-to-end, including a full `sudo reboot`:

* The service starts automatically on boot (`systemctl enable`, already done by the script above)
  and brings up Docker first if it isn't already running (`Requires=docker.service`).
* `ExecStart` runs `docker run ... smartgate:latest python3 src/main/live_detection.py`: the
  container's main process is the detection script itself, not a shell, which is what lets clean
  shutdown work correctly (see below).
* `ExecStop` (`docker stop`) sends `SIGTERM` straight into that process on any stop, restart, or
  system shutdown. `live_detection.py`'s signal handler catches both `SIGINT` and `SIGTERM` and
  runs `cleanup()` (`all_pins_off()` + `GPIO.cleanup()` + shutting down the web server) before
  exiting verified via `sudo systemctl restart smartgate` and a full `sudo reboot`, confirming no
  GPIO pin is left driven across a restart.

Verify with `systemctl status smartgate`, `sudo docker ps`, and `journalctl -u smartgate -f`.

##### Third-party carrier board notes (non-OEM hardware only)

> **2026 test bench:** this unit needs the pinmux fix, so the team's pinmux script is now kept in
> the repo as `setup/sgate_boot.sh` with the register values for this specific board (see
> [Pinmux fix](#pinmux-fix-required-every-boot)). It is still unit-specific, so re-derive the values
> before using it on a different board.

**This section does not apply to a genuine Jetson Orin Nano dev kit carrier board.** It exists only for development units using a third-party
carrier board that isn't in `Jetson.GPIO`'s hardcoded list of recognized Jetson dev kit boards, and
whose SoC pinmux defaults don't match the expected out-of-box configuration. On real OEM hardware,
this entire section should be unnecessary the repo and Dockerfile ship "as if brand new out of
the box."

If you hit a `"Carrier board is not from a Jetson Developer Kit"` warning or GPIO pins reporting
`"set to input in pinmux"` on non-OEM hardware, the fix is two host-level, unit-specific pieces
that live outside git:

* A pinmux fix script direct SoC pinmux register writes (`busybox devmem ...`) forcing the
  relevant pins into output mode at boot, wired in via a systemd `ExecStartPre` drop-in.
* A one-line patch to the host's installed `Jetson.GPIO` library adding your carrier board's ID
  to the accepted list.

Both are specific to a physical board's ID and wiring and should be re-derived per-unit rather
than copy-pasted blindly. Work through the diagnostic process (`GPIOtest.py`, checking `/dev/mem`
warnings, matching the board ID reported at boot).

Note: since the container drives GPIO via `-e JETSON_MODEL_NAME=JETSON_ORIN_NANO`, the
carrier-board warning inside the container is cosmetic only it fires once `GPIO.setmode()` runs
but doesn't block anything, because `JETSON_MODEL_NAME` bypasses the device-tree-based detection
path entirely. The `Jetson.GPIO` library patch above is therefore only relevant for bare-metal/
host-side GPIO testing outside the container. The pinmux register fix, on the other hand, still
applies regardless of host vs. container, since pinmux is a SoC-level electrical property
independent of which process ends up driving the pin.

##### Troubleshooting

* **`Jetson.GPIO` `Exception: Could not determine Jetson model` inside the container**: the
  container can't see `/proc/device-tree`. Pass `-e JETSON_MODEL_NAME=JETSON_ORIN_NANO` in
  `docker run` (already included in the `Makefile` and the boot systemd unit).
* **`docker run --runtime nvidia` panics with a `cudacompat`/`nvidia-cdi-hook`: slice-bounds
  error** known bug in `nvidia-container-toolkit`'s CUDA forward-compatibility hook when
  running Jetson-targeted images. Not needed on Jetson anyway (container CUDA already matches the
  host driver). Fixed in the `Dockerfile` by removing
  `/usr/local/cuda-13.2/compat` and `/usr/local/cuda-13.2/compat_orin`.
* **No `GST_ARGUS` output / camera pipeline silently fails, `lsmod: not found` in logs**: missing
  `kmod` package inside the image (already added to the `Dockerfile`).
* **TensorRT apt install picks the wrong version / dependency conflict**: the base CUDA Ubuntu
  24.04 image ships its own generic SBSA CUDA apt repo that conflicts with the Jetson-specific
  TensorRT package. Removed in the `Dockerfile`
  (`rm -f /etc/apt/sources.list.d/cuda-ubuntu2404-sbsa.list`).
* **`RuntimeError: ... /dev/gpiochip0 does not exist` inside the container**: GPIO devices
  weren't passed through; add `--device /dev/gpiochip0 --device /dev/gpiochip1` (already in the
  `Makefile`/systemd unit).
* **I2C probe failure (`-121`/`EREMOTEIO`) configuring the CSI camera**: usually the wrong CSI
  port selected in `jetson-io.py`, not a bad camera. Double-check physical wiring against the
  port you selected. Generic `i2cdetect` scans are unreliable for Jetson CSI cameras (I2C mux
  only routes on real camera-subsystem probes) check `dmesg` output instead.
* **`OSError: [Errno 98] Address already in use` starting `live_detection.py` interactively**: 
  the `smartgate.service` systemd unit is already running and holding port 8080. See
  [Test interactively](#test-interactively) above.
* **`FileNotFoundError` on `config.json` when running from the container/systemd**: the default
  config path must resolve relative to `json_config.py`'s own file location, not the process's
  current working directory otherwise it breaks as soon as the script is launched from anywhere
  other than `src/main/` (exactly what both the container's `WORKDIR /app` and the systemd unit's
  `WorkingDirectory=/app` do).
* **`convert_models.sh` fails on `pip install onnx` with `Cannot uninstall numpy ... RECORD file
  not found`**: `onnx`'s dependency `ml_dtypes` wants `numpy>=2`, which would need to replace the
  apt-installed `numpy`, but pip can't cleanly uninstall a dpkg-tracked package. The script
  installs export-time dependencies into an isolated venv with `numpy<2` pinned instead, so it
  never fights the system's numpy.
* **`convert_models.sh` fails with `ModuleNotFoundError: No module named 'pkg_resources'`**:
  very recent `setuptools` releases dropped `pkg_resources`, which this vintage of YOLOv5 still
  imports directly. The script pins an older `setuptools` inside its venv to restore it.
* **ONNX export fails with `_pickle.UnpicklingError: Weights only load failed`**: torch changed
  `torch.load()`'s default `weights_only` from `False` to `True` starting at 2.6, as a security
  hardening against malicious pickled checkpoints. The script patches YOLOv5's `torch.load()` call
  to pass `weights_only=False` explicitly, which is safe for your own trusted checkpoint.
* **ONNX export fails with `No module named 'onnxscript'`**: recent `torch` versions default to
  a newer ONNX exporter path that depends on `onnxscript`, which YOLOv5 v6.2 never had to declare.
  Installed by the script alongside `onnx`.

</details>

## Configuration

**Ensure [Supported Hardware](#supported-hardware) setup is complete before proceeding.**

Users are free to configure the rules to set the behaviour of the gate specified on a list of stimuli. Within `config/config.json` a base template would be provided with:

```json
{
    "model": {
        "path": "../models/marsupial_16s.engine",
        "classes": "../models/classes/marsupial_16s.txt",
        "confidence": 0.6
    },
    "rules": [
        {
            "objects": ["Swamp Wallaby", "Eastern Grey Kangaroo", "Common Wombat", "Red-necked Wallaby", "Long-nosed Bandicoot", "Short-eared Brushtail Possum", "Euro", "Red-necked Pademelon", "Common Brushtail Possum"],
            "action": "OPEN"
        },
        {
            "objects": ["Red Fox", "Fallow Deer", "Pig"],
            "action": "CLOSE"
        }
    ],
    
    "server": {
        "port": 8080
    }
}
```

### Model Configuration

*Note that in the configuration file, any path specified can be relative to the location of the configuration file itself.*

- The `model` section defines the settings for the object detection model
    - `path` specifies the file path to the trained model (in this case, a YOLOv5 model in TensorRT format). If you are working with a `.pt` file, you will need to convert it to a `.engine` file. On the Jetson Nano, see the referenced [tutorial](https://youtube.com/watch?v=ErWC3nBuV6k) or the [JetsonYolov5](https://github.com/mailrocketsystems/JetsonYolov5) repo; on the Jetson Orin Nano, use `setup/convert_models.sh` as described in [Jetson Orin Nano (JetPack 7.2)](#jetson-orin-nano-jetpack-72).
    - `classes` points to a text file containing the list of object classes the model can detect. It will need to be in the following format `index: class` (check the files in `models/classes` for some examples)
    - `confidence` sets the confidence threshold for object detection (`0.6` or 60% in this example, as committed).

### Rules Configuration

- `rules` section define how the gate should respond to detected objects
    - `objects` array represents the list of strings of the objects that should trigger the specified `action`. This should be referred from your specified classes file (from `models/classes`)
    - `action` is the action to take when the specified objects from `objects` are detected. Can be either `OPEN` or `CLOSE`.

- In this example:

    - If `eastern-grey-kangaroo` is detected the gate should open
    - If `red-fox` is detected the gate should close
    - If both are detected the gate should close. This should be the default behaviour of the SmartGate when both stimuli are detected

### Server Configuration

- `server` section contains the settings for the web server
    - `port` is the port number for which the web server would run under. In the example it's set to `8080`

### Web App
- Run this on the host to setup the web app:

```sh
cd ~/SmartGate/src/web-app
sudo docker-compose up --build -d
```
- Go to `http://localhost:8000` on the nano or `http://<nano-ipv4-address>:8000` to view the web-app 

`Note`: Running both the web app and the live detection on the nano may cause performance issues

## Usage

**Ensure [Supported Hardware](#supported-hardware) setup is complete before proceeding.**

**Jetson Nano** run directly on the host:

```sh
cd SmartGate/src/main/
python3 live_detection.py
```

`Note`: You may need to run this command with sudo privileges.

**Jetson Orin Nano** run inside the container (see
[Test interactively](#jetson-orin-nano-jetpack-72) for the full flow, or rely on the
`smartgate.service` boot-time unit for production use):

```sh
make run
# inside the container:
python3 src/main/live_detection.py
```

**2026 test bench:** the system starts automatically at boot through `smartgate.service`; nothing needs to be run by hand. See the [Operating Guide](docs/OPERATING_GUIDE.docx) for checking the service, the dashboard, running by hand for development, and shut-down.

A web server should run in which the camera stream can be viewed from the main dashboard and dedicated controls to manually control the gate.

<details>
<summary><strong>Jetson Nano (JetPack 4.6)</strong></summary>

#### Jetson Nano (JetPack 4.6)

Installing the requirements should be ran under the Jetson Nano with the Jetpack SDK. For more info on setting this up, please refer to NVIDIA's official guides for your respective Jetson Nano model:

- [Jetson Nano 4GB](https://developer.nvidia.com/embedded/learn/get-started-jetson-nano-devkit)
- [Jetson Nano 2GB](https://developer.nvidia.com/embedded/learn/get-started-jetson-nano-2gb-devkit)

There are two options to set up the requirements.

**Option 1: Install the dependencies locally on the Nano.**

```sh
git clone https://github.com/TheOpenSI/SmartGate.git
cd SmartGate/setup
./setup_requirements.sh
```

Optional: Generate the systemd service and automatically enable and start the service to run on boot.

```sh
cd SmartGate/setup
./systemd_service_setup.sh
```

**Option 2: Build a Docker container.**

```sh
git clone https://github.com/TheOpenSI/SmartGate.git
cd SmartGate/
sudo docker build -t smartgate:latest .
```

Once set up, run SmartGate directly:

```sh
cd SmartGate/src/main/
python3 live_detection.py
```

`Note`: You may need to run this command with sudo privileges.

</details>

## Test results

Full data is in [`docs/testing/TESTING_AND_VALIDATION.docx`](docs/testing/TESTING_AND_VALIDATION.docx).

| Test | Result |
|---|---|
| L298N driver, manual and Raspberry Pi GPIO (Stages 1–2) | Both directions and the disabled state confirmed (about 8.2–8.9 V out, about 0 V disabled) |
| Red Fox in view (integrated) | Detected at 0.69; gate closed at the close stop |
| Eastern grey kangaroo in view (integrated) | Detected; gate opened at the open stop |
| Person in view, threshold 0.5 | **Fail:** read as Fallow Deer at 0.51–0.57, and the gate closed |
| Person in view, threshold 0.6 | Model-only misreads fell to 5 of 120 frames (about 4%); no false close in three integrated cycles |
| Batch test, about 20 images per class at 0.6 | 75 of 80 animal images detected (94%). Natives 20 of 20; predators 55 of 60 (92%) |
| Manual control from the dashboard | Open/Close/Stop drove the stepper to the correct stop |

**Not yet tested:** inference latency, a sustained run, more classes or live video, PIR response to a still animal, and a multi-frame decision rule.

## Supplementary documentation

| Document | Location | Status |
|---|---|---|
| Change register (chain of custody: what, who, when, why, files, backup) | [`CHANGE_REGISTER.docx`](CHANGE_REGISTER.docx) | 2026 |
| Operating guide (start, stop, dashboard, maintenance, troubleshooting) | [`docs/OPERATING_GUIDE.docx`](docs/OPERATING_GUIDE.docx) | 2026 |
| Build log (how v3 was built, problems and fixes, by phase) | [`docs/BUILD_LOG.docx`](docs/BUILD_LOG.docx) | 2026 |
| Electrical wiring diagram, REV 0.4 (sheets and notes) | [`docs/wiring/`](docs/wiring/ELECTRICAL_WIRING_REV0.4.docx) | 2026; diagram sheets to be added |
| Testing and validation record | [`docs/testing/`](docs/testing/TESTING_AND_VALIDATION.docx) | 2026; figures to be added |
| Test bench design and CAD files | [`docs/cad/`](docs/cad/TEST_BENCH_DESIGN.docx) | 2026; CAD files to be added |
| Architecture diagram | [`docs/architecture/`](docs/architecture/) | 2026, to be added |
| Inventory list | [`docs/inventory/`](docs/inventory/) | 2026, to be added |
| Web app | [`src/web-app/README.md`](src/web-app/README.md) | 2026 |
| v0.2 schematic (Jetson Nano, DC motor) | `docs/Schematic_New-Project_2024-10-22.pdf` | Inherited, superseded by REV 0.4 |
| v0.2 exploded-view drawing (Fusion 360, enclosed box) | `docs/smartgate Drawing final v4.pdf` | Inherited (N. Drury, Oct 2024), superseded by the v3 bench |
| SmartGate Second Prototype Documentation | `docs/SmartGate v0.2 Documentation.docx` | Inherited |
| BIOQUAI Smart Gate Overview | `docs/Smart Gate Overview.docx` | Inherited (T. Scott, 2023) |

### Model files

`models/marsupial_16s.engine`, `.onnx` and `.onnx.data` **are committed**. The engine was built on this team's Orin Nano with TensorRT 10.16. It only works on the same JetPack and TensorRT version, so on any other board, regenerate it with `setup/convert_models.sh`. `lib/libmyplugins.so` is inherited from the Jetson Nano build.

### Files not in this repository

These are excluded in `.gitignore` because of GitHub's 100 MB file limit, or because they are generated locally:

| Excluded | Why | How to get it |
|---|---|---|
| `*.pt` weights | Large | [Marsupial](https://github.com/carlosclaiton/marsupial) dataset, or ask OpenSI |
| `yolov5/` | Cloned by `convert_models.sh` | Created automatically |
| `*.whl` (e.g. 308 MB torch wheel) | Over GitHub's file limit | Only needed for the old Jetson Nano bare-metal setup; download from NVIDIA's PyTorch for Jetson page |
| `.convert_venv/`, `*venv*/` | Local Python environment | Recreated by `convert_models.sh` |
| `setup/torchvision/` | Separate cloned repo | Clone during Jetson Nano setup |

### Known repository issues

- **The web app folder name has a trailing space** (`src/web-app ` rather than `src/web-app`). Commands like `cd src/web-app`, the links in this README, and the `src/web-app/` line in `.dockerignore` don't match it, so the web app also gets copied into the detection image. Fix with `git mv "src/web-app " src/web-app`.
- **Referenced files that are not in the repo:** `SETUP_ORIN_NANO.md` (named in `setup/systemd_service_setup.sh`), and `src/main/live_api.py`, `setup/update_running_container.sh` and `docs/LIVE_MONITORING.md` (named in the web app's config and `NANO_COMMANDS.txt`). The web app works with `JETSON_LIVE_SERVICE=http_server` without them.
- **Controller backups.** The build notes call them `io_control.bak` and `door_control.bak`, but the repo holds `*_old.py` and `*_dc.py` versions instead.
- **Leftover development files:** `src/main/*_old.py`, `*_dc.py`, `detect_check.py`, `*.log`, `src/main/demo.log`, `test_frame.jpg`, and `src/web-app /.ev` (a stray copy of `.env`). The active code is `io_control.py` and `door_control.py`.
- **`.env` is committed** in the web app folder. It currently holds no real secrets, but it should be replaced by `.env.example` and added to `.gitignore` before anyone fills it in.

## Limitations

### Electrical and safety

- **Motor under-powered.** The stepper is rated for 12 V but runs from a 6 × AA pack (about 6–7 V), which limits torque.
- **No fuse or power switch** on the motor supply. Isolating it means removing a cell.
- **Hall sensor resistors (1 kΩ) not fitted.** Planned, and required before connecting a real gate.
- **PIR pin roles unconfirmed.** Inferred from wire colours, not checked against the datasheet.
- **Pinmux resets every boot.** The motor only works if `sgate_boot.sh` runs before the container. If the service is regenerated by an older setup script, the motor stops working without an obvious error.
- **Pinmux values are unit-specific.** They must be re-derived for a different carrier board.
- **Slow gate.** At 0.25 s per step and 7.5° per step, the stepper turns at about 30° per second. Faster speeds are untested at the AA pack's voltage.
- **Safety cap not tuned.** `MAX_STEPS` (240) is a placeholder of five revolutions, not the measured travel of a real gate.

### Mechanical (test bench)

- **Fragile joints.** The bench is printed in separate sections so it can be taken apart. The lower-deck legs are hot-glued and the upper deck is left detachable.
- **Hole grid doesn't match most parts.** The bench came out larger than intended, so most components are held with Velcro rather than bolted. Only the Hall sensor stands are bolted.
- **Loose, exposed wiring.** Kept tidy but not routed or clipped.
- **Not weatherproof or enclosed.** It is a lab bench, not an outdoor gate.

### Software and model

- **False detections.** At 0.5 a person was read as Fallow Deer and closed the gate. At 0.6 about 4% of person frames are still misread by the model alone, and the fox clears the threshold by only about 0.09.
- **Predators missed more often than natives.** In the batch test all five misses were predators (Fallow Deer 2, Pig 3).
- **Inherited model.** The YOLOv5 model was redeployed, not retrained. It only recognises the classes in `models/classes`, and won't reliably handle species outside its training set.
- **Engine rebuild needed per device.** The `.engine` file must be regenerated whenever the hardware, JetPack or TensorRT version changes, and `convert_models.sh` takes a long time to run.
- **Performance.** Running the web app and live detection together on the Nano can slow the system down.
- **One frame per decision.** Each PIR trigger runs detection on a single frame, so a partly visible or blurred animal can be missed or misclassified.
- **No detection means no action.** If nothing in the rules is detected, the gate stays where it is. There is no timed auto-close.
- **Dashboard is started by hand after each boot.** The Nano gets a new, random IP address on every boot, and the web app needs that address (`JETSON_LIVE_URL` in `src/web-app/.env`) to reach the Jetson. So after each boot, check the address with `hostname -I`, update `.env`, then run `sudo docker-compose up -d` in `src/web-app`. A fixed IP address (for example a DHCP reservation on the router, or the inherited `setup/set_static_ip.sh`, which is untested) would allow the dashboard to start automatically too. The gate itself still starts automatically.
- **Dashboard login.** It uses GitHub login, but `ENV=development` shows a DUMMY LOGIN button; switch to `ENV=production` before handover. The Jetson's own page on port 8080 has no login, so keep the bench on a trusted network.
- **Auto/Manual mode** only works with `JETSON_LIVE_SERVICE=smartgate_nano`. With `http_server`, the mode buttons are disabled.
- **No fixed IP address.** Find the Jetson with `hostname -I` if `smartgate.local` doesn't resolve.
- **Web app security.** The PostgreSQL username and password are hard-coded in `docker-compose.yml`, and the database port 5432 is exposed. Both containers run as root, and the detection container runs `--privileged`.
- **Repository history was reset.** On 1 Nov 2026 the repo was pushed as a single clean commit to remove oversized files. Earlier history is in the upstream repos (see `CHANGE_REGISTER.docx`).

### Scope

- Not field-tested on a real gate or with live animals outdoors.
- Single test bench. Power draw, battery life, inference latency and long-run reliability have not been measured.
- Tested with still images of four classes, not live animals or video.

## Team

2026 University of Canberra capstone team (Group 2026-S2-01, unit 9785 ITS Capstone Project), for OpenSI.

| Member | Role | Main areas |
|---|---|---|
| Theartha Hari Nair | Team Leader | Team coordination and sponsor meetings; gate logic and wiring diagram; motor-pin fix; stepper integration; Change Register |
| Antus Jojo | Hardware Lead | Inventory and parts; test bench CAD and printing; camera bring-up; boot script; GitHub, README and Operating Guide |
| Martin Benny | Integration Lead | Orin setup and Docker; TensorRT engine; stepper code and Hall stops; web dashboard; integrated testing |
| Krishna Sharma | Software Lead | Jetson Nano setup; Raspberry Pi and sensor testing; Orin environment; dashboard live status; batch testing |
| Janvy Jose | Documentation / Research Lead | Meeting minutes and research; motor-driver validation; Testing Record; Build Log; report structure |

Each member led the areas listed, and all members contributed equally across hardware, software, testing, documentation and the final report.

**Project sponsor:** Carlos Noschang Kuhn (OpenSI). **Project counterpart:** Alex Zecevic (OpenSI), who suggested the stepper and Hall end-stop demonstration on 15 Oct 2026. **Capstone mentor:** Jeanette Cotterhill.

The team met with OpenSI every Thursday from 3 Sep; the full chain was demonstrated on 22 Oct 2026.

## Contact

For project supports, please contact [Carlos C. N. Kuhn](mailto:carlos.noschangkuhn@canberra.edu.au).

## Contributing

We welcome contributions from the community! Whether you’re a researcher, developer, or enthusiast, there are many ways to get involved:

 - Report Issues: Found a bug or have a feature request? Open an issue on our GitHub page.
 - Submit Pull Requests: Contribute code by submitting pull requests. Please follow [our contribution guidelines](CONTRIBUTING.md).
 - Make a Donation: Support our project by making a donation [here](https://payments.canberra.edu.au/Misc/tran?tran-type=OPENSI).

## Funding
This project is funded under the agreement with the ACT Government for Future Jobs Fund with Open Source Institute (OpenSI)-R01553
