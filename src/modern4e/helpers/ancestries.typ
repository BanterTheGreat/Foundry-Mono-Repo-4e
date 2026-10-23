#import "theme.typ" as theme;

#let attributes(size: str, speed: int, vision: str, languages: str) = {
  return [
    #table(
      columns: (1fr, 1fr, 1fr, 1fr),
      fill: theme.columnStripes,
      align: center,
      stroke: 0.5pt + theme.tableDivider,
      [
        #image("../svgs/size.svg", height: 2em)
        #v(-4pt)
        Size
      ],
      [
        #image("../svgs/speed.svg", height: 2em)
        #v(-4pt)
        Speed
      ],
      [
        #image("../svgs/vision.svg", height: 2em)
        #v(-4pt)
        Vision
      ],
      [
        #image("../svgs/language.svg", height: 2em)
        #v(-4pt)
        Languages
      ],

      [
        #align(horizon)[*#size*]
      ],
      [
        #align(horizon)[*#speed*]
      ],
      [
        #align(horizon)[*#vision*]
      ],
      [
        #align(horizon)[*#languages*]
      ],
    );
  ]
}
