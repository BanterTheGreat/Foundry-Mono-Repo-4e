/**
 * Subway Big.dd2vtt wall import, exported format 0.3.
 * Exact exported wall/portal coordinates at 192 px per grid square.
 * Adds terrain outlines for the twelve pillars absent from the export.
 * Run again to remove this set and restore any replaced walls.
 */
await (async () => {
  const scene = canvas.scene;
  const marker = "subway-large-dd2vtt-v1";
  const backupKey = "subwayDd2vttWallBackup";

  if (!game.user.isGM || !scene || !canvas.ready) {
    return ui.notifications.warn("Open the subway scene as GM first.");
  }

  try {
    const previous = scene.getFlag("world", backupKey);
    if (previous) {
      const restore = await Dialog.confirm({
        title: "Remove subway walls and restore backup?",
        content: "<p>Remove the walls made by this macro and restore any original walls it replaced?</p>"
      });
      if (!restore) {
        return;
      }

      const generated = scene.walls.filter(wall =>
        wall.getFlag("world", "subwayWallSet") === marker
      ).map(wall => wall.id);
      const missing = previous.originals.filter(wall => !scene.walls.has(wall._id));
      if (missing.length) {
        await scene.createEmbeddedDocuments("Wall", missing, { keepId: true });
      }
      if (generated.length) {
        await scene.deleteEmbeddedDocuments("Wall", generated);
      }
      await scene.unsetFlag("world", backupKey);
      return ui.notifications.info("Generated subway walls removed; original walls restored.");
    }

    if (scene.width !== 14976 || scene.height !== 2880 || scene.grid.size !== 192) {
      return ui.notifications.warn("This DD2VTT export needs a 14976 x 2880 scene with a 192 px grid.");
    }
    if (scene.background?.offsetX || scene.background?.offsetY ||
        (scene.background?.scaleX != null && scene.background.scaleX !== 1) ||
        (scene.background?.scaleY != null && scene.background.scaleY !== 1) ||
        scene.background?.rotation) {
      return ui.notifications.warn("Reset the background image offset, scale and rotation before using this import.");
    }

    // Exported directly from Subway Big.dd2vtt; the embedded image is omitted.
    const data = {"format":0.3,"resolution":{"map_origin":{"x":0,"y":0},"map_size":{"x":78,"y":15},"pixels_per_grid":192},"line_of_sight":[[{"x":42,"y":15},{"x":36,"y":15}],[{"x":42,"y":0},{"x":36,"y":0}],[{"x":55.5,"y":9.5},{"x":55.5,"y":9.5},{"x":55.5,"y":10},{"x":56,"y":10}],[{"x":57,"y":10},{"x":62.5,"y":10},{"x":62.5,"y":8},{"x":55.5,"y":8},{"x":55.5,"y":8.5}],[{"x":55,"y":8.5},{"x":55,"y":8},{"x":47,"y":8},{"x":47,"y":8.5}],[{"x":47,"y":9.5},{"x":47,"y":10},{"x":47.5,"y":10}],[{"x":48.5,"y":10},{"x":53,"y":10}],[{"x":54,"y":10},{"x":55,"y":10},{"x":55,"y":9.5}],[{"x":17,"y":9.5},{"x":17,"y":9.5},{"x":17,"y":10},{"x":18,"y":10}],[{"x":19,"y":10},{"x":24,"y":10}],[{"x":25,"y":10},{"x":26,"y":10},{"x":26,"y":9.5}],[{"x":26,"y":8.5},{"x":26,"y":8},{"x":17,"y":8},{"x":17,"y":8.5}],[{"x":26.5,"y":5.5},{"x":26.5,"y":5},{"x":17.5,"y":5},{"x":17.5,"y":5.5}],[{"x":17.5,"y":6.5},{"x":17.5,"y":7},{"x":18.5,"y":7}],[{"x":19.5,"y":7},{"x":24.5,"y":7}],[{"x":25.5,"y":7},{"x":26.5,"y":7},{"x":26.5,"y":6.5}],[{"x":42,"y":15},{"x":42,"y":14},{"x":40,"y":14},{"x":40,"y":12},{"x":42,"y":12},{"x":42,"y":12},{"x":49,"y":12},{"x":49,"y":11},{"x":52,"y":11},{"x":52,"y":11.5},{"x":52,"y":12},{"x":78,"y":12}],[{"x":0,"y":12},{"x":26,"y":12},{"x":26,"y":11},{"x":29,"y":11},{"x":29,"y":12},{"x":36,"y":12},{"x":36,"y":12},{"x":38,"y":12},{"x":38,"y":14},{"x":36,"y":14},{"x":36,"y":15}],[{"x":42,"y":0},{"x":42,"y":1},{"x":40,"y":1},{"x":40,"y":3},{"x":49,"y":3},{"x":49,"y":4},{"x":52,"y":4},{"x":52,"y":3},{"x":59,"y":3},{"x":59,"y":3},{"x":60,"y":3},{"x":60,"y":3},{"x":78,"y":3}],[{"x":-0.5,"y":3},{"x":18,"y":3},{"x":18,"y":2},{"x":19,"y":2},{"x":19,"y":3},{"x":26,"y":3},{"x":26,"y":4},{"x":29,"y":4},{"x":29,"y":3},{"x":38,"y":3},{"x":38,"y":1},{"x":36,"y":1},{"x":36,"y":0}]],"objects_line_of_sight":[],"portals":[{"position":{"x":56.5,"y":10},"bounds":[{"x":56,"y":10},{"x":57,"y":10}],"rotation":0,"closed":true,"freestanding":false},{"position":{"x":55.5,"y":9},"bounds":[{"x":55.5,"y":8.5},{"x":55.5,"y":9.5}],"rotation":1.570796,"closed":true,"freestanding":false},{"position":{"x":47,"y":9},"bounds":[{"x":47,"y":8.5},{"x":47,"y":9.5}],"rotation":1.570796,"closed":true,"freestanding":false},{"position":{"x":48,"y":10},"bounds":[{"x":47.5,"y":10},{"x":48.5,"y":10}],"rotation":0,"closed":true,"freestanding":false},{"position":{"x":53.5,"y":10},"bounds":[{"x":53,"y":10},{"x":54,"y":10}],"rotation":0,"closed":true,"freestanding":false},{"position":{"x":55,"y":9},"bounds":[{"x":55,"y":9.5},{"x":55,"y":8.5}],"rotation":-1.570796,"closed":true,"freestanding":false},{"position":{"x":18.5,"y":10},"bounds":[{"x":18,"y":10},{"x":19,"y":10}],"rotation":0,"closed":true,"freestanding":false},{"position":{"x":24.5,"y":10},"bounds":[{"x":24,"y":10},{"x":25,"y":10}],"rotation":0,"closed":true,"freestanding":false},{"position":{"x":26,"y":9},"bounds":[{"x":26,"y":9.5},{"x":26,"y":8.5}],"rotation":-1.570796,"closed":true,"freestanding":false},{"position":{"x":17,"y":9},"bounds":[{"x":17,"y":8.5},{"x":17,"y":9.5}],"rotation":1.570796,"closed":true,"freestanding":false},{"position":{"x":17.5,"y":6},"bounds":[{"x":17.5,"y":5.5},{"x":17.5,"y":6.5}],"rotation":1.570796,"closed":true,"freestanding":false},{"position":{"x":19,"y":7},"bounds":[{"x":18.5,"y":7},{"x":19.5,"y":7}],"rotation":0,"closed":true,"freestanding":false},{"position":{"x":25,"y":7},"bounds":[{"x":24.5,"y":7},{"x":25.5,"y":7}],"rotation":0,"closed":true,"freestanding":false},{"position":{"x":26.5,"y":6},"bounds":[{"x":26.5,"y":6.5},{"x":26.5,"y":5.5}],"rotation":-1.570796,"closed":true,"freestanding":false}]};
    const dimensions = scene.getDimensions();
    const pixelsPerGrid = data.resolution.pixels_per_grid;
    const origin = data.resolution.map_origin;
    const walls = [];
    const seen = new Set();
    const S = CONST.WALL_SENSE_TYPES;
    const M = CONST.WALL_MOVEMENT_TYPES;
    const D = CONST.WALL_DOOR_TYPES;
    const normal = { move: M.NORMAL, sight: S.NORMAL, light: S.NORMAL, sound: S.NORMAL };
    const terrain = { move: M.NORMAL, sight: S.LIMITED, light: S.LIMITED, sound: S.LIMITED };
    const glass = { move: M.NORMAL, sight: S.NONE, light: S.NONE, sound: S.NORMAL,
      door: D.DOOR, ds: CONST.WALL_DOOR_STATES.CLOSED };

    /**
     * Convert one DD2VTT grid-space segment to padded Foundry coordinates.
     * Repeated vertices and duplicate edges in the export are ignored.
     */
    function segment(a, b, properties, group) {
      const c = [
        Math.round(dimensions.sceneX + (a.x - origin.x) * pixelsPerGrid),
        Math.round(dimensions.sceneY + (a.y - origin.y) * pixelsPerGrid),
        Math.round(dimensions.sceneX + (b.x - origin.x) * pixelsPerGrid),
        Math.round(dimensions.sceneY + (b.y - origin.y) * pixelsPerGrid)
      ];
      if (c[0] === c[2] && c[1] === c[3]) {
        return;
      }
      const edge = [c.slice(0, 2).join(','), c.slice(2).join(',')].sort().join(':');
      if (seen.has(edge)) {
        return;
      }
      seen.add(edge);
      walls.push({
        c,
        dir: CONST.WALL_DIRECTIONS.BOTH,
        door: D.NONE,
        ds: CONST.WALL_DOOR_STATES.CLOSED,
        ...properties,
        flags: { world: { subwayWallSet: marker, subwayWallGroup: group } }
      });
    }

    // The export provides 73 usable wall segments and all 14 car portals.
    for (const path of [...data.line_of_sight, ...data.objects_line_of_sight]) {
      for (let index = 1; index < path.length; index++) {
        segment(path[index - 1], path[index], normal, 'exported-wall');
      }
    }
    for (const portal of data.portals) {
      segment(portal.bounds[0], portal.bounds[1], {
        ...glass,
        ds: portal.closed ? CONST.WALL_DOOR_STATES.CLOSED : CONST.WALL_DOOR_STATES.OPEN
      }, 'car-door');
    }

    // Pillar collision paths are absent from the export. Supplement from the
    // supplied image: 12 square pillars, each 144 x 144 px (0.75 grid squares).
    for (const x of [31.5, 35.5, 42.5, 46.5]) {
      for (const y of [4.5, 7.5, 10.5]) {
        const half = 0.375;
        const loop = [
          { x: x-half, y: y-half }, { x: x+half, y: y-half },
          { x: x+half, y: y+half }, { x: x-half, y: y+half },
          { x: x-half, y: y-half }
        ];
        for (let index = 1; index < loop.length; index++) {
          segment(loop[index - 1], loop[index], terrain, 'pillar');
        }
      }
    }

    const choice = await new Promise(resolve => {
      new Dialog({
        title: "Build Subway-Large walls from DD2VTT",
        content: `<p>Create <strong>${walls.length} walls</strong> from Subway Big.dd2vtt,
          including 12 terrain pillars and 14 transparent car doors.</p>
          <p><label><input type="checkbox" name="replace" checked>
          Replace the scene's ${scene.walls.size} existing walls (save a backup).</label></p>
          <p>Run this macro again to remove its walls and restore the backup.</p>`,
        buttons: {
          build: { label: "Build walls", callback: html =>
            resolve({ replace: html.find('[name="replace"]').prop("checked") }) },
          cancel: { label: "Cancel", callback: () => resolve(null) }
        },
        default: "cancel",
        close: () => resolve(null)
      }).render(true);
    });
    if (!choice) {
      return;
    }

    const originals = choice.replace ? scene.walls.map(wall => wall.toObject()) : [];
    await scene.setFlag("world", backupKey, { originals });
    await scene.createEmbeddedDocuments("Wall", walls);
    if (originals.length) {
      await scene.deleteEmbeddedDocuments("Wall", originals.map(wall => wall._id));
    }
    ui.notifications.info(`Created ${walls.length} subway walls. Run again to restore the previous set.`);
  } catch (error) {
    console.error("Subway-Large DD2VTT wall builder:", error);
    ui.notifications.error("Wall builder failed. Backup retained; run again to restore. See console for details.");
  }
})();
