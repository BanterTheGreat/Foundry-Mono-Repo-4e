#import "theme.typ" as theme;

#let techniqueEntry(
  level: int,
  category: str,
  title: str,
  time: str,
  duration: str,
  cost: str,
  keywords: str,
  description: content,
) = {
  return block(
    [#text(
      table(
        columns: 1fr,
        stroke: 0.5pt + theme.tableDivider,
        align: left,
        fill: theme.rowStripes,
        inset: 6pt,
        [
          #grid(
            columns: (1fr, auto),
            align: (left + top, right + top),
            text(weight: 700, size: 11pt)[#title],
            text(weight: 700, size: 11pt)[
              Level #level | #category
            ],
          )

          #v(-6pt);
          #theme.fadingLine();
          #v(-5pt);

          #grid(
            columns: (1fr, auto),
            align: (left + top, right + top),
            grid(
              columns: (auto, auto),
              align: (left + top, right + horizon),
              image("../svgs/magnify.svg", height: 1em), [#h(2pt)#text(keywords, weight: "bold")],
            ),

            grid(
              columns: (auto, auto),
              align: (right + horizon, left + top),
              [#text(cost, weight: "bold")#h(2pt)], image("../svgs/action.svg", height: 1em),
            ),
          );

          #v(-5pt);

          #grid(
            columns: (1fr, auto),
            align: (left + top, right + top),
            grid(
              columns: (auto, auto),
              align: (left + top, right + horizon),
              image("../svgs/sandclock.svg", height: 1em), [#h(2pt)#text(time, weight: 0)],
            ),

            grid(
              columns: (auto, auto),
              align: (right + horizon, left + top),
              [#duration#h(2pt)], image("../svgs/duration.svg", height: 1em),
            ),
          );

          #description
        ],
      ),
      size: 9pt,
    )],
    breakable: false,
  )
}
