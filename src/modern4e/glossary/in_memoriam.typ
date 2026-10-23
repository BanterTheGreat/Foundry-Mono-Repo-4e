#let inMemoriamPage() = {
  return [
    #pagebreak();
    #v(1fr)
    #align(center)[
      #show heading.where(depth: 1, numbering: none): it => block(
        width: 100%,
        above: 0pt,
        below: 0pt,
        text(it.body, font: "Merriweather", size: 24pt, weight: "regular"),
      )
      #heading(level: 1, outlined: true, bookmarked: true)[In Memoriam]
      #v(8mm)
      #image("../images/in_memoriam/ozyn-rogal-beltane.png", width: 190mm, height: 120mm, fit: "contain")
      #v(5mm)
      #block(width: 109mm)[#grid(
        columns: (1fr, 1fr, 1fr),
        gutter: 0mm,
        [#text("Ozyn", font: "Merriweather", size: 16pt)\
          #text([Level 10 Warlock], size: 12pt, style: "italic")],
        [#text("Rogal", font: "Merriweather", size: 16pt)\
          #text([Level 10 Swordmage], size: 12pt, style: "italic")],
        [#text("Beltane", font: "Merriweather", size: 16pt)\
          #text([Level 10 Warlord], size: 12pt, style: "italic")],
      )]
      #v(3mm)
      #text([Died 22/10/2026], size: 11pt, style: "italic")
    ]
    #v(1fr)
  ]
}
