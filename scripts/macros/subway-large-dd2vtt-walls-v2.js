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
    const data = {
      resolution: {"map_origin":{"x":0,"y":0},"map_size":{"x":78,"y":15},"pixels_per_grid":192},
      line_of_sight: [
        [[42,15],[36,15]],
        [[42,0],[36,0]],
        [[55.5,9.5],[55.5,9.5],[55.5,10],[56,10]],
        [[57,10],[62.5,10],[62.5,8],[55.5,8],[55.5,8.5]],
        [[55,8.5],[55,8],[47,8],[47,8.5]],
        [[47,9.5],[47,10],[47.5,10]],
        [[48.5,10],[53,10]],
        [[54,10],[55,10],[55,9.5]],
        [[17,9.5],[17,9.5],[17,10],[18,10]],
        [[19,10],[24,10]],
        [[25,10],[26,10],[26,9.5]],
        [[26,8.5],[26,8],[17,8],[17,8.5]],
        [[26.5,5.5],[26.5,5],[17.5,5],[17.5,5.5]],
        [[17.5,6.5],[17.5,7],[18.5,7]],
        [[19.5,7],[24.5,7]],
        [[25.5,7],[26.5,7],[26.5,6.5]],
        [[42,15],[42,14],[40,14],[40,12],[42,12],[42,12],[49,12],[49,11],[52,11],[52,11.5],[52,12],[78,12]],
        [[0,12],[26,12],[26,11],[29,11],[29,12],[36,12],[36,12],[38,12],[38,14],[36,14],[36,15]],
        [[42,0],[42,1],[40,1],[40,3],[49,3],[49,4],[52,4],[52,3],[59,3],[59,3],[60,3],[60,3],[78,3]],
        [[-0.5,3],[18,3],[18,2],[19,2],[19,3],[26,3],[26,4],[29,4],[29,3],[38,3],[38,1],[36,1],[36,0]]
      ].map(path => path.map(([x, y]) => ({ x, y }))),
      objects_line_of_sight: [],
      portals: [
        [56,10,57,10,true],
        [55.5,8.5,55.5,9.5,true],
        [47,8.5,47,9.5,true],
        [47.5,10,48.5,10,true],
        [53,10,54,10,true],
        [55,9.5,55,8.5,true],
        [18,10,19,10,true],
        [24,10,25,10,true],
        [26,9.5,26,8.5,true],
        [17,8.5,17,9.5,true],
        [17.5,5.5,17.5,6.5,true],
        [18.5,7,19.5,7,true],
        [24.5,7,25.5,7,true],
        [26.5,6.5,26.5,5.5,true]
      ].map(([x1, y1, x2, y2, closed]) => ({
        bounds: [{ x: x1, y: y1 }, { x: x2, y: y2 }], closed
      }))
    };
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
})().catch(error => {
  console.error("Subway-Large DD2VTT wall builder:", error);
  ui.notifications.error("Wall builder failed. Run again to restore the backup; see console for details.");
});
