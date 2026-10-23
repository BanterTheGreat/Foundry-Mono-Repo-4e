#let join_with_or(input: array) = {
  if input.len() == 0 {
    ""
  } else if input.len() == 1 {
    input.at(0)
  } else if input.len() == 2 {
    "either " +input.at(0) + " or " + input.at(1)
  } else {  
    "either " +input.slice(0, input.len()-1).join(", ") + " or " + input.at(input.len()-1)
  }
}