#!/bin/bash
### Convert marsupial .pt model to TensorRT engine ###
# Reference: https://www.youtube.com/watch?v=ErWC3nBuV6k
# This script converts the marsupial_16s.pt model to a TensorRT .engine file

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
MODELS_DIR="$PROJECT_DIR/models"

# Check CUDA is in PATH
if ! command -v nvcc &> /dev/null; then
    echo "[-] nvcc not found. Setting up CUDA paths..."
    export PATH=/usr/local/cuda/bin:${PATH}
    export LD_LIBRARY_PATH=/usr/local/cuda/lib64:${LD_LIBRARY_PATH}
fi

# Check if .pt file exists
if [ ! -f "$MODELS_DIR/marsupial_16s.pt" ]; then
    echo "[-] marsupial_16s.pt not found in $MODELS_DIR"
    echo "[-] Download it from https://github.com/carlosclaiton/marsupial and place it in models/"
    exit 1
fi

# Clone YOLOv5 v6.2 if not present
if [ ! -d "$PROJECT_DIR/yolov5" ]; then
    echo "[+] Cloning YOLOv5 v6.2..."
    cd "$PROJECT_DIR"
    git clone --branch v6.2 https://github.com/ultralytics/yolov5.git
    cd yolov5

    # torch changed torch.load's default `weights_only` from False to True starting at 2.6 (a
    # security hardening against malicious pickle payloads in downloaded checkpoints). YOLOv5
    # v6.2 predates that change and calls torch.load() with no weights_only argument, so on
    # torch 2.13 it now refuses to load the checkpoint's legacy numpy pickle globals. This is
    # your own trusted checkpoint (marsupial_16s.pt), not a third-party download, so explicitly
    # allowing weights_only=False here is the correct fix, not a security compromise.
    sed -i "s/torch.load(attempt_download(w), map_location='cpu')/torch.load(attempt_download(w), map_location='cpu', weights_only=False)/" models/experimental.py

    # YOLOv5 v6.2's own requirements.txt pulls in everything export.py actually needs to import
    # (requests, matplotlib, seaborn, thop, etc.) that isn't already in our custom Dockerfile pip
    # list. Filtered to EXCLUDE:
    #   - torch/torchvision   - would clobber the prerelease cu132 build already installed
    #   - opencv-python       - would shadow the from-source GStreamer build
    #   - tensorboard         - training-time logging only, not needed for export; also drags in
    #                           an ancient `protobuf<=3.20.1` pin that conflicts with onnx
    #   - protobuf            - see above
    grep -v -E "^(torch|torchvision|opencv-python|tensorboard|protobuf)" requirements.txt > /tmp/yolov5-reqs-filtered.txt

    # `onnx`'s own dependency `ml_dtypes` requires numpy>=2, which would force pip to upgrade
    # the system numpy - but that numpy was installed by apt (dpkg-tracked, no RECORD file), so
    # pip can't cleanly uninstall/replace it ("Cannot uninstall numpy ... RECORD file not
    # found"). Rather than fight that, install onnx (and the rest of the export dependencies)
    # into an isolated venv. --system-site-packages keeps torch/opencv visible (no re-download
    # of the multi-GB CUDA torch wheel) while letting pip manage numpy/protobuf/ml_dtypes
    # freely inside the venv, untangled from the system's apt-managed packages. This venv is
    # only ever used for this offline conversion step - live_detection.py never imports onnx,
    # so the deployed runtime is unaffected either way.
    VENV_DIR="$PROJECT_DIR/.convert_venv"
    if [ ! -d "$VENV_DIR" ]; then
        # `python3 -m venv --help` succeeds even when ensurepip/the venv package isn't actually
        # installed (it just prints help text), so it's not a reliable check - attempt creation
        # for real and only install python3-venv if that actually fails.
        if ! python3 -m venv --system-site-packages "$VENV_DIR" 2>/tmp/venv-create-error.log; then
            echo "[+] venv creation failed, installing python3-venv and retrying..."
            cat /tmp/venv-create-error.log
            rm -rf "$VENV_DIR"
            VENV_PKG="$(python3 -c 'import sys; print(f"python3.{sys.version_info.minor}-venv")')"
            apt-get update && apt-get install -y --no-install-recommends "$VENV_PKG"
            python3 -m venv --system-site-packages "$VENV_DIR"
        fi
    fi

    "$VENV_DIR/bin/pip" install -r /tmp/yolov5-reqs-filtered.txt

    # This YOLOv5 v6.2 script still does `import pkg_resources` (utils/general.py), which very
    # recent setuptools releases have dropped (the system's setuptools 84.0.0, visible in this
    # venv via --system-site-packages, no longer bundles it). Install an older setuptools
    # locally in the venv - shadows the system one for this venv only, doesn't touch it.
    "$VENV_DIR/bin/pip" install "setuptools<81"

    # torchvision was never installed anywhere (the Dockerfile only installs torch, via the
    # --pre cu132 prerelease index), but utils/dataloaders.py imports it. torch/torchvision are
    # tightly version-paired - installing a generic `pip install torchvision` here would very
    # likely pull a build compiled against a different torch/CUDA version and fail at import
    # with cryptic C++ operator-registration errors. Install it from the same prerelease index
    # the existing torch install came from, so pip resolves a build actually paired with it.
    "$VENV_DIR/bin/pip" install --pre torchvision --extra-index-url https://download.pytorch.org/whl/cu132

    # onnx's newest releases require numpy>=2 (via their ml_dtypes dependency). Because this venv
    # uses --system-site-packages, an unpinned "pip install onnx" would pull in numpy 2.x locally
    # and that numpy then shadows the apt-installed numpy 1.26.4 for EVERYTHING running in this
    # venv - including apt-built pandas/scipy/opencv, which were compiled against numpy 1.x's
    # binary layout and immediately break ("numpy.dtype size changed") the moment they're used.
    # Constrain numpy<2 here so pip instead picks whichever older onnx release still supports it,
    # keeping the whole environment on the numpy version everything else was actually built
    # against. Older onnx releases without a prebuilt aarch64/cp312 wheel fall back to building
    # from source, which needs a protoc binary - installing protobuf-compiler covers that case
    # too, so the fallback actually succeeds instead of failing on a missing compiler.
    apt-get update && apt-get install -y --no-install-recommends protobuf-compiler

    # torch's newer "dynamo" ONNX exporter path (the default torch.onnx.export() now reaches
    # for on recent torch versions) depends on onnxscript - another dependency YOLOv5 v6.2 never
    # had to declare because it predates that exporter. Installed in the same resolve as onnx so
    # its own dependencies get resolved against the same numpy<2 constraint, rather than in a
    # separate pip call that could re-trigger the numpy upgrade problem above.
    "$VENV_DIR/bin/pip" install "numpy<2" onnx onnxscript
else
    cd "$PROJECT_DIR/yolov5"
fi

VENV_DIR="$PROJECT_DIR/.convert_venv"
PYTHON_BIN="$VENV_DIR/bin/python"

# Step 1: Export .pt to ONNX
echo "[+] Exporting marsupial_16s.pt to ONNX..."
"$PYTHON_BIN" export.py --weights "$MODELS_DIR/marsupial_16s.pt" --include onnx --img 640

# Check ONNX was created
if [ ! -f "$MODELS_DIR/marsupial_16s.onnx" ]; then
    # YOLOv5 export puts onnx next to the .pt file
    if [ -f "$PROJECT_DIR/yolov5/marsupial_16s.onnx" ]; then
        mv "$PROJECT_DIR/yolov5/marsupial_16s.onnx" "$MODELS_DIR/"
    else
        echo "[-] ONNX export failed"
        exit 1
    fi
fi

# Step 2: Convert ONNX to TensorRT engine
# Locate trtexec - its install path has moved around across TensorRT versions/packagings,
# so check the classic location first and fall back to searching PATH.
if [ -x "/usr/src/tensorrt/bin/trtexec" ]; then
    TRTEXEC="/usr/src/tensorrt/bin/trtexec"
elif command -v trtexec &> /dev/null; then
    TRTEXEC="$(command -v trtexec)"
else
    echo "[-] trtexec not found. Searching filesystem..."
    TRTEXEC="$(find / -maxdepth 6 -iname trtexec -type f 2>/dev/null | head -n 1)"
    if [ -z "$TRTEXEC" ]; then
        echo "[-] Could not locate trtexec anywhere. Is the tensorrt apt package installed?"
        exit 1
    fi
fi
echo "[+] Using trtexec at: $TRTEXEC"

echo "[+] Converting ONNX to TensorRT engine (this will take a while)..."
"$TRTEXEC" \
    --onnx="$MODELS_DIR/marsupial_16s.onnx" \
    --saveEngine="$MODELS_DIR/marsupial_16s.engine" \
    --fp16

if [ -f "$MODELS_DIR/marsupial_16s.engine" ]; then
    echo "[+] Conversion complete! Engine saved to $MODELS_DIR/marsupial_16s.engine"
else
    echo "[-] TensorRT conversion failed"
    exit 1
fi