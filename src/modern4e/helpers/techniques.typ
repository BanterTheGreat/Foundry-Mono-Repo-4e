#import "theme.typ" as theme;

#let techniqueEntry(
  level: int,
  category: str,
  title: str,
  time: str,
  duration: str,
  marketPrice: str,
  cost: str,
  focus: none,
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
            columns: (auto, 1fr),
            align: (left + top, left + horizon),
            image("../svgs/magnify.svg", height: 1em), [#h(2pt)#text(keywords, weight: "bold")],
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

          #grid(
            columns: (auto, 1fr),
            column-gutter: 4pt,
            row-gutter: 4pt,
            [*Market Price:*], [#marketPrice],
            [*Casting Cost:*], [#cost],
            ..if focus != none { ([*Reusable Focus:*], [#focus]) } else { () },
          )

          #description
        ],
      ),
      size: 9pt,
    )],
    breakable: false,
  )
}
