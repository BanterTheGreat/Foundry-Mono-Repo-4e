.PHONY: copy-modules copy-module install

# Copies every module under src/ into the local Foundry Data/modules folder.
# Override with `make copy-modules FOUNDRY_DATA_PATH=/custom/path/Data`.
copy-modules:
	node scripts/copy-modules.mjs

# Copies only the given module(s) into the local Foundry Data/modules folder.
# Usage: `make copy-module MODULE=dnd4e-health-display`.
copy-module:
	node scripts/copy-modules.mjs $(MODULE)

install: copy-modules
