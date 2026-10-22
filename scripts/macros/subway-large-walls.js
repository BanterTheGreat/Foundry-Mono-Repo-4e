/**
 * Trace Subway-Large.webp at 14976 x 2880, with a 192 px grid.
 * Coordinates below use a 2048 px wide reference of the supplied image.
 * Run again to remove this set and restore walls replaced on the first run.
 */
await (async () => {
  const scene = canvas.scene;
  const marker = "subway-large-traced-v1";
  const backupKey = "subwayLargeWallBackup";

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
      return ui.notifications.warn("This trace needs a 14976 x 2880 scene with a 192 px grid.");
    }
    if (scene.background?.offsetX || scene.background?.offsetY ||
        (scene.background?.scaleX != null && scene.background.scaleX !== 1) ||
        (scene.background?.scaleY != null && scene.background.scaleY !== 1) ||
        scene.background?.rotation) {
      return ui.notifications.warn("Reset the background image offset, scale and rotation before using this trace.");
    }

    const dimensions = scene.getDimensions();
    const scale = 14976 / 2048;
    const walls = [];
    const S = CONST.WALL_SENSE_TYPES;
    const M = CONST.WALL_MOVEMENT_TYPES;
    const D = CONST.WALL_DOOR_TYPES;
    const normal = { move: M.NORMAL, sight: S.NORMAL, light: S.NORMAL, sound: S.NORMAL };
    const terrain = { move: M.NORMAL, sight: S.LIMITED, light: S.LIMITED, sound: S.LIMITED };
    const glass = { move: M.NORMAL, sight: S.NONE, light: S.NONE, sound: S.NORMAL,
      door: D.DOOR, ds: CONST.WALL_DOOR_STATES.CLOSED };

    /**
     * Add one connected wall chain in image coordinates, without grid snapping.
     */
    function chain(points, properties = normal, group = "station") {
      for (let index = 1; index < points.length; index++) {
        const a = points[index - 1];
        const b = points[index];
        walls.push({
          c: [
            Math.round(dimensions.sceneX + a[0] * scale),
            Math.round(dimensions.sceneY + a[1] * scale),
            Math.round(dimensions.sceneX + b[0] * scale),
            Math.round(dimensions.sceneY + b[1] * scale)
          ],
          dir: CONST.WALL_DIRECTIONS.BOTH,
          door: D.NONE,
          ds: CONST.WALL_DOOR_STATES.CLOSED,
          ...properties,
          flags: { world: { subwayWallSet: marker, subwayWallGroup: group } }
        });
      }
    }

    // Station outline. Tunnel mouths and the outer stair exits remain open.
    chain([[0,79.5],[475,79.5],[475,53],[496,53],[496,79.5],
      [683,79.5],[683,106],[761,106],[761,79.5],[999,79.5],
      [999,26],[946,26],[946,0]]);
    chain([[1102,0],[1102,26],[1048,26],[1048,79.5],[1287,79.5],
      [1287,106],[1365,106],[1365,79.5],[2048,79.5]]);
    chain([[0,315],[683,315],[683,289],[761,289],[761,315],
      [999,315],[999,368],[946,368],[946,2880 / scale]]);
    chain([[1102,2880 / scale],[1102,368],[1048,368],[1048,315],
      [1287,315],[1287,289],[1365,289],[1365,315],[2048,315]]);

    // Small maintenance door in the north wall's alcove.
    chain([[475,64],[496,64]], { ...normal, door: D.DOOR }, "maintenance-door");

    // Twelve platform pillars: closed terrain-wall loops.
    for (const x of [827, 932, 1116, 1221]) {
      for (const y of [118.5, 197.5, 276]) {
        chain([[x-10,y-10],[x+10,y-10],[x+10,y+10],
          [x-10,y+10],[x-10,y-10]], terrain, "pillar");
      }
    }

    /**
     * Trace a car, splitting its lower side at each painted door opening.
     * End doors are also transparent and operable; solid ends have no opening.
     */
    function car({ left, right, top, bottom, doors, leftDoor = true, rightDoor = true }) {
      const bevel = 2;
      const upperEnd = top + 14;
      const lowerEnd = bottom - 14;
      chain([[left,upperEnd],[left,top+bevel],[left+bevel,top],
        [right-bevel,top],[right,top+bevel],[right,upperEnd]], normal, "car-body");

      chain([[left,lowerEnd],[left,bottom-bevel],[left+bevel,bottom],
        [doors[0][0],bottom]], normal, "car-body");
      for (let index = 0; index < doors.length; index++) {
        const [start, end] = doors[index];
        chain([[start,bottom],[end,bottom]], glass, "car-door");
        const next = doors[index + 1]?.[0] ?? right - bevel;
        chain([[end,bottom],[next,bottom]], normal, "car-body");
      }
      chain([[right-bevel,bottom],[right,bottom-bevel],[right,lowerEnd]], normal, "car-body");
      chain([[left,upperEnd],[left,lowerEnd]], leftDoor ? glass : normal,
        leftDoor ? "car-door" : "car-body");
      chain([[right,upperEnd],[right,lowerEnd]], rightDoor ? glass : normal,
        rightDoor ? "car-door" : "car-body");
    }

    car({ left: 460, right: 695, top: 132, bottom: 182,
      doors: [[485,511],[643,669]] });
    car({ left: 448, right: 682, top: 211, bottom: 261,
      doors: [[472,498],[630,656]] });
    car({ left: 1235, right: 1446, top: 211, bottom: 261,
      doors: [[1257,1283],[1391,1417]] });
    car({ left: 1459, right: 1639, top: 211, bottom: 261,
      doors: [[1481,1507]], rightDoor: false });

    const choice = await new Promise(resolve => {
      new Dialog({
        title: "Build Subway-Large walls",
        content: `<p>Create <strong>${walls.length} traced walls</strong> for this map,
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
    console.error("Subway-Large wall builder:", error);
    ui.notifications.error("Wall builder failed. Backup retained; run again to restore. See console for details.");
  }
})();
