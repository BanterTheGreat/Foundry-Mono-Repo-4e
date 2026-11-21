.PHONY: copy-modules copy-module install typst typst-compile typst-release typst-watch typst-fonts typst-clean

# Copies only Foundry modules with manifests; modern4e is always excluded.
# Override with `make copy-modules FOUNDRY_DATA_PATH=/custom/path/Data`.
copy-modules:
	node scripts/copy-modules.mjs

# Copies only the given module(s) into the local Foundry Data/modules folder.
# Usage: `make copy-module MODULE=dnd4e-health-display`.
copy-module:
	node scripts/copy-modules.mjs $(MODULE)

install: copy-modules

# Build and update Character Builder on connected Android devices.
.PHONY: builder-install
builder-install:
	node scripts/builder-install.mjs

# Same over Wi-Fi: `make builder-install-wifi DEVICE=192.168.2.3:39867` (DEVICE optional; mDNS fallback).
.PHONY: builder-install-wifi
builder-install-wifi:
	node scripts/builder-install.mjs --wireless $(DEVICE)

# Build the shareable debug APK and print its path.
.PHONY: builder-apk
builder-apk:
	node scripts/builder-apk.mjs

# Typst development; outputs src/modern4e/inDev.pdf. Requires Typst on PATH.
# Extra options: make typst-compile TYPST_ARGS="--font-path /path/to/fonts"
# Override the executable with TYPST_BIN=/path/to/typst.
export TYPST_BIN
export FOUNDRY_DATA_PATH

typst: typst-compile

typst-compile:
	node scripts/typst.mjs compile $(TYPST_ARGS)

# Versioned PDF in src/modern4e, using helpers/configuration.typ's version.
typst-release:
	node scripts/typst.mjs release $(TYPST_ARGS)

typst-watch:
	node scripts/typst.mjs watch $(TYPST_ARGS)

typst-fonts:
	node scripts/typst.mjs fonts $(TYPST_ARGS)

typst-clean:
	node scripts/typst.mjs clean
