# Targeting Automation TODO

- [ ] Allow switching to a power's Charge or Basic variant during initial targeting, matching the options available in chat messages.
- [x] Allow specific powers to originate from configured actors/tokens, retaining the power's owning actor for rolls, resources, and use tracking. Previews remain visible when selecting the alternate origin.
- [x] Support selecting a square for summoning companions, checking placement range, scene bounds, permissions, and player line of effect.
- [ ] Check occupancy across the summoned token's footprint before allowing placement.
- [ ] Complete Spirit Companion targeting support, including melee spirit powers. Bursts can already originate from a configured companion token; verify any remaining spirit-specific range handling.
- [x] Honor the per-power include-caster setting for area targets. With an alternate attack origin, inclusion applies to that origin token instead of the original caster. Close-burst previews, shared previews, and placed Regions use the same origin-space exclusion.
- [x] Require player line of effect for AoE origins, summon squares, and every drawn wall square; prevent bypass through Proceed Anyway. Open doors allow placement, and GMs retain override access.
- [x] Preserve manual area-target removals during automatic refreshes until the area changes or the excluded creature moves or re-enters. Explicitly selecting area targets again resets exclusions.
- [x] Add a per-power target filter that only allows creatures with a specified condition.
- [x] Add a per-power target filter that only allows creatures adjacent to allies or enemies, with a configurable choice of which relationship is required.
