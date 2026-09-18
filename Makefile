.PHONY: copy-modules install

# Copies every module under src/ into the local Foundry Data/modules folder.
# Override with `make copy-modules FOUNDRY_DATA_PATH=/custom/path/Data`.
copy-modules:
	node scripts/copy-modules.mjs

install: copy-modules
