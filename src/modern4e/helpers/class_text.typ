// Shared class prose is data, never executable Typst. Support bold/emphasis only.
#let classText(value) = {
  let inline(value) = value.split("*").enumerate().map(((index, part)) => {
    let body = part.split("_").enumerate().map(((index, piece)) => {
      if calc.odd(index) { emph(text(piece)) } else { text(piece) }
    }).join()
    if calc.odd(index) { strong(body) } else { body }
  }).join()
  value.split("\n\n").map(inline).join(parbreak())
}
