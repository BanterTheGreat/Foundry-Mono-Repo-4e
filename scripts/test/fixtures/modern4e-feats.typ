#import "../../../src/modern4e/helpers/theme.typ" as theme

#metadata((
  formatted: repr(theme.featDescription("*Bold* and _italic_.\n\nSecond paragraph.\n\n- First bullet\n\n- Second bullet\n\n#panic(\"literal\") 1[W]")),
  trailingList: repr(theme.featDescription("- One\n\n- Two")),
  range: repr(theme.featBlocksFromJson("../content/feats/heroic/sorcerer.json", start: 15, end: 16)),
  multiclass: repr(theme.featChoicesFromJson("../content/feats/multiclass/general.json")),
))
