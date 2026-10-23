#import "state.typ" as state;
#import "configuration.typ" as config;

#let tableDivider = rgb("#96afaf");
#let table1 = rgb("#e7f0f0");
#let table2 = rgb("#cce0e0");

#let highContrastTable1 = rgb("#f0dfbb");
#let highContrastTable2 = rgb("#e0cda2");
#let tableHeader = rgb("#aec4c4");
#let highlight = rgb("#b5cece");

#let lineColor = rgb("#889aa5");

#let bgColor = rgb("#f1f7f7");

#let headerColor = rgb("#d9e4e4")
#let quoteColor = rgb("#d9e4e4")

#let rowStripes = (col, row) => if calc.rem(row, 2) == 0 { table1 } else { table2 };
#let columnStripes = (col, row) => if calc.rem(col, 2) == 0 { table1 } else { table2 };
#let checkerboard = (col, row) => if calc.rem(row + col, 2) == 0 { table1 } else { table2 };

#let defaultTableStyle() = {
  return (col, row) => if row == 0 {
    tableHeader
  } else if calc.rem(row, 2) == 0 {
    table1
  } else {
    table2
  }
}

#let defaultTableStyleWithFirstColumnHeaders() = {
  return (col, row) => if row == 0 or col == 0 {
    tableHeader
  } else if calc.rem(row, 2) == 0 {
    table1
  } else {
    table2
  }
}

#let footer(invert: bool) = {
  return context [
    #set align(center);

    #let fill = if invert == false {
      black
    } else {
      white
    }

    #if invert == true {
      v(-0.8cm)
    }
    #set text(9pt, fill: fill);
    #columns(3)[
    #colbreak();
    #counter(page).display("1", both: false);
    #colbreak();
    #align(right)[
      #config.version
    ]
    ]
  ]
}

#let runningHeader() = context {
  let currentPage = here().page()
  // Numbered headings identify the book's navigation hierarchy; ordinary
  // rule headings reuse these levels without belonging in the running header.
  let titles = query(heading.where(numbering: "1.")).filter(
    title => title.level <= 2 and title.location().page() <= currentPage,
  )
  let chapter = []
  let section = []
  for title in titles {
    if title.level == 1 {
      chapter = title.body
      section = []
    } else {
      section = title.body
    }
  }

  set text(size: 8pt, fill: lineColor)
  grid(
    columns: (1fr, 1fr),
    align: (left, right),
    chapter,
    section,
  )
}

#let highContrastTableStyle() = {
  return (col, row) => if row == 0 {
    tableHeader
  } else if calc.rem(row, 2) == 0 {
    highContrastTable2
  } else {
    highContrastTable1
  }
}

#let choiceBox(content) = {
  heading(level: 3, depth: 3, upper(content))
}

#let buildChoiceHeader(title: [Build Choice], prompt: [Choose One]) = {
  block(
    width: 100%,
    below: 5pt,
    breakable: false,
    sticky: true,
  )[
    #grid(
      columns: (1fr, auto),
      align: (left + horizon, right + horizon),
      text(size: 8pt, weight: "bold", fill: rgb("#294550"), upper(title)),
      box(
        fill: rgb("#17333d"),
        inset: (x: 5pt, y: 3.5pt),
        text(size: 8pt, weight: "bold", fill: white, upper(prompt)),
      ),
    )
  ]
}

// Variant B: banded title and padded body. Study: prototype/choice-design-b.
#let choiceBlock(title: content, body: content, breakable: false) = {
  block(
    width: 100%,
    fill: table1,
    stroke: 0.5pt + tableHeader,
    inset: 0pt,
    breakable: breakable,
  )[
    #block(
      width: 100%,
      fill: headerColor,
      inset: (x: 7pt, y: 5pt),
      above: 0pt,
      below: 0pt,
      breakable: false,
      sticky: true,
    )[
      #text(size: 11pt, weight: "bold")[○ #title]
    ]
    #block(
      width: 100%,
      inset: (x: 7pt, top: 4pt, bottom: 6pt),
      above: 0pt,
      below: 0pt,
      breakable: breakable,
    )[#body]
  ]
}

#let choiceOr() = {
  align(center, text(size: 8pt, weight: "bold")[OR])
}

#let quoteBox(content) = {
  block(
    stroke: 0.5pt + table1,
    radius: 2pt,
    width: 100%,
    below: 6pt,
  )[
    #box(
      align(center)[
        #box(
          emph(content),
          width: 100%,
          inset: 4pt,
          fill: quoteColor,
        )
      ],
    )
  ]
}

#let pageTitle(title: str) = {
  return [
    #{
      show heading.where(numbering: "1."): it => {
        let test = context {
          let val = counter(heading).display(it.numbering)
          str(val).slice(0, str(val).len() - 1)
        }

        text([Chapter #test], size: 10pt, font: "Rokkitt")
        linebreak()
        v(-28pt)
        it.body
        linebreak()
      }

      text(
        upper(heading(title, level: 1, numbering: "1.")),
        size: 18pt,
        font: "Alfa Slab One",
      )
    }
  ]
}

#let subPageTitle(title: str, outlined: true, level: 2) = {
  return [
    #{
      // Make Numbering invisible.
      show heading.where(level: level): it => {
        it.body
      }

      text(
        upper(heading(
          title,
          level: level,
          depth: level,
          numbering: if outlined { "1." } else { none },
          outlined: outlined,
        )),
        size: 18pt,
        font: "Alfa Slab One",
      )
    }
  ]
}

// Pack cards into independent columns so shorter cards leave no row-sized gaps.
#let featGrid(count: 2, ..cards) = layout(size => {
  let gutter = 10pt
  let columnWidth = (size.width - gutter * (count - 1)) / count
  let heights = (0pt,) * count
  let columns = ((),) * count
  for card in cards.pos() {
    let shortest = 0
    for index in range(1, count) {
      if heights.at(index) < heights.at(shortest) {
        shortest = index
      }
    }
    columns.at(shortest).push(card)
    heights.at(shortest) += measure(card, width: columnWidth).height + gutter
  }
  grid(
    columns: (1fr,) * count,
    column-gutter: gutter,
    ..columns.map(cards => [
      #for (index, card) in cards.enumerate() {
        if index > 0 { v(gutter) }
        block(above: 0pt, below: 0pt, card)
      }
    ]),
  )
})

// Full-width category heading for ancestry feat grids.
#let featCategoryTitle(title) = {
  block(width: 100%, above: 12pt, below: 8pt, breakable: false, sticky: true)[
    #stack(
      dir: ttb,
      spacing: 4pt,
      text(font: "Merriweather", size: 16pt, weight: "bold", title),
      line(length: 100%, stroke: 0.8pt + lineColor),
    )
  ]
}

#let featBlock(title: str, content: content, requirements: none) = {
  return choiceBlock(
    title: title,
    body: [
      #if (requirements != none) [
        *Requires: #text(requirements)* #linebreak();
      ]
      #content
    ],
  )
}

#let featCardsFromJson(file) = {
  let data = json(file)
  data.feats.map(feat => featBlock(
    title: feat.title,
    // Preserve bold emphasis without interpreting descriptions as Typst code.
    content: feat.description.split("\n\n").map(paragraph => {
      paragraph.split("*").enumerate().map(((index, part)) => {
        let body = text(part.replace("'", "’"))
        if calc.odd(index) { strong(body) } else { body }
      }).join()
    }).join(parbreak()),
    requirements: feat.at("requirements", default: none),
  ))
}

#let featBlocksFromJson(file) = {
  let data = json(file)
  for feat in data.feats [
    #featBlock(
      title: feat.title,
      content: feat.at("description", default: none),
      requirements: feat.at("requirements", default: none),
    )
  ]
}

#let externalLink(destination, body) = {
  link(destination)[#body#sym.space.nobreak#box(image("../svgs/external-link.svg", height: 0.75em))]
}

#let pathBlocksFromJson(file) = {
  let data = json(file)
  for path in data.paths [
    #choiceBlock(
      title: externalLink(path.link, [#path.title]),
      body: [
        #if path.at("requirements", default: none) != none [
          *Requirements: #text(path.requirements)* #linebreak()
        ]
        #path.description
      ],
    )
  ]
}

///
///   Shows the displayed text in a black box with thick white text.
/// - ability (The text to format):
/// ->
#let formatAbility(ability: str) = context {
  if state.defaultAbilityFormattingEnabled.get() == false {
    return ability
  }

  return box(fill: highlight, inset: 2pt, text(weight: "bold", ability, fill: black))
}

// HACK: Hacky as all hell, this adds invisible characters to avoid the other highlighter :/
#let highlightInReverse(string: str) = {
  return box(fill: white, inset: 2pt, baseline: 0%, text(weight: "bold", string, fill: black))
}


#let fadingLine() = {
  return line(length: 100%, stroke: (paint: gradient.linear(lineColor, bgColor.transparentize(20%)), thickness: 1pt))
}

#let bigChoiceBox(title: str, content: content) = {
  choiceBlock(title: title, body: content, breakable: true)
}

#let addChapterAboveHeading(it, margin) = {
  if (it.numbering == none) {
    return it;
  };
  
  let test = context {
    let val = counter(heading).display(it.numbering)
    str(val).slice(0, str(val).len() - 1)
  }

  text([Chapter #test], size: 10pt, font: "Rokkitt")
  linebreak()
  v(margin)
  it.body
}

#let bannerPage(title: str, content: content, imageName: str, width: relative, gradient: gradient) = {
  return [
    #show heading.where(): it => {
      addChapterAboveHeading(it, -36pt)
    }

    #set page(
      background: image("../images/REPLACE_ME".replace("REPLACE_ME", imageName), fit: "stretch", width: 100%),
      footer: footer(invert: true),
      margin: 0cm,
    )

    #set text(fill: white);

    #block(
      width: 100%,
      height: 100%,
      fill: gradient,
      inset: (top: 1cm),
      [
        #block(
          width: width,
          height: 5%,
          inset: (left: 1cm),
          [
            #set align(left)
            #text(
              upper(heading(title, level: 1, numbering: "1.")),
              size: 24pt,
              font: "Alfa Slab One",
            )
          ],
        )

        #block(
          width: 40%,
          height: 100%,
          fill: none,
          inset: (left: 1cm),
          [
            #content;
          ],
        )
      ],
    )
  ]
}
