// Advancement schedules for the 2.0 PDF.
#let abilityIncrease(level) = {
  if level in (8, 14, 28) {
    "+1 to two different abilities"
  } else if level == 21 {
    "+1 to all six abilities"
  } else {
    "—"
  }
}

#let skillIncreases = (4, 8, 11, 14, 18, 21, 24, 28).map(level => (
  str(level), if level < 11 { 3 } else if level < 21 { 5 } else { 8 },
)).to-dict()

#let extraArmorLevels = (5, 9, 13, 17, 19, 25, 27, 29)

#let normalDcs = (
  14, 15, 16, 17, 17, 18, 18, 20, 20, 21,
  22, 23, 23, 25, 25, 26, 26, 27, 27, 28,
  30, 31, 31, 32, 32, 33, 33, 35, 35, 36,
)
