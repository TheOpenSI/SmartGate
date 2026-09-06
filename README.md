# SmartGate

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![python](https://img.shields.io/badge/Python-3.6-3776AB.svg?style=flat&logo=python&logoColor=white)](https://www.python.org)
[![AIIA](https://img.shields.io/badge/AIIA-2025-purple.svg)](https://youtu.be/FwYv-16JMjo?si=IlkEh4MlS5sk0w-t)


## Table of Contents

- [Features](#features)
- [Supported Hardware](#supported-hardware)
  - [Jetson Nano (JetPack 4.6)](#jetson-nano-jetpack-46)
  - [Jetson Orin Nano (JetPack 7.2)](#jetson-orin-nano-jetpack-72)
- [Configuration](#configuration)
- [Usage](#usage)
- [Contact](#contact)
- [Contributing](#contributing)
- [Web App README](src/web-app/README.md)

Utilizing real-time object detection for endangered animal species to determine the state of a hardware-configured gate. Supports both the original Jetson Nano and the Jetson Orin Nano, using TensorRT engine optimization.

## Features

Features include:

- Real-time object detection to set the state of the physical gate. The rules are set within the `config/` folder. The `config.json` file contains the general rules to set the list of stimuli that triggers the specified state of the gate (more details in [Configuration](#configuration)).

- Utilizing TensorRT engine optimization to enhance inference performance. The optimized models are saved as `.engine` files within the `models/` folder. Models are obtained from the [Marsupial](https://github.com/carlosclaiton/marsupial) dataset.

- Web server dashboard to view a live feed fetched from the camera as well as manually control state of the door.

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
3. **Configure the CSI camera** via `sudo /opt/nvidia/jetson-io/jetson-io.py` →
   *Configure Jetson 22pin CSI Connector* → select the IMX219 overlay matching your physically
   connected port (A/B/C check your wiring, not just the first option), then reboot. Confirm
   `/dev/video0` exists afterward (`ls /dev/video0`).
4. If running on a **non-OEM/third-party carrier board**, apply the host-only fixes in
   [Third-party carrier board notes](#third-party-carrier-board-notes-non-oem-hardware-only)
   before continuing. Skip this step entirely on a genuine Jetson Orin Nano dev kit carrier board.

##### Build

```bash
git clone https://github.com/Latzerni/SmartGate.git
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

This creates, enables, and starts `/etc/systemd/system/smartgate.service`. It does **not**
include the carrier-board pinmux fix that stays host-only and layers on top separately (see
below) only if you're on non-OEM hardware.

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

**This section does not apply to a genuine Jetson Orin Nano dev kit carrier board, and none of it
is part of this git repository.** It exists only for development units using a third-party
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
        "confidence": 0.5
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
    - `confidence` sets the confidence threshold for object detection (`0.5` or 50% in this example).

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

## Contact

For project supports, please contact [Carlos C. N. Kuhn](mailto:carlos.noschangkuhn@canberra.edu.au).

## Contributing

We welcome contributions from the community! Whether you’re a researcher, developer, or enthusiast, there are many ways to get involved:

 - Report Issues: Found a bug or have a feature request? Open an issue on our GitHub page.
 - Submit Pull Requests: Contribute code by submitting pull requests. Please follow [our contribution guidelines](CONTRIBUTING.md).
 - Make a Donation: Support our project by making a donation [here](https://payments.canberra.edu.au/Misc/tran?tran-type=OPENSI).

## Funding
This project is funded under the agreement with the ACT Government for Future Jobs Fund with Open Source Institute (OpenSI)-R01553