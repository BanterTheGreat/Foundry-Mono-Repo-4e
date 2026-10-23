#import "../helpers/theme.typ" as theme;

#import "./avenger.typ";
#import "./barbarian.typ";
#import "./cleric.typ";
#import "./artificer.typ";
#import "./wizard.typ";
#import "./fighter.typ";
#import "./warlord.typ";
#import "./invoker.typ";
#import "./warlock.typ";
#import "./runepriest.typ";
#import "./rogue.typ";
#import "./warden.typ";
#import "./ranger.typ";
#import "./sorcerer.typ";
#import "./shaman.typ";
#import "./paladin.typ";
#import "./swordmage.typ";
#import "./bard.typ";
#import "./druid.typ";

#let roleCover(role: str, imgPath: str) = {
  set page(
    background: image("../images/REPLACE_ME".replace("REPLACE_ME", imgPath), width: 100%, fit: "stretch"),
    margin: 0cm,
  )
  set text(fill: white)
  set align(left)

  show heading.where(): it => {
    let test = context {
      let val = counter(heading).display(it.numbering)
      str(val).slice(0, str(val).len() - 1)
    }

    text([Chapter #test], size: 10pt, font: "Rokkitt")
    linebreak()
    v(-42pt)
    it.body
  }

  block(
    width: 100%,
    height: 100%,
    fill: gradient.linear(
      black,
      black.transparentize(100%),
      black.transparentize(100%),
      black.transparentize(100%),
      angle: 45deg,
    ),
    inset: (top: 1cm),
    [
      #block(
        width: 40%,
        height: 100%,
        inset: (left: 1cm),
        [
          #set align(left)
          #text(
            upper(heading(role, level: 1, numbering: "1.")),
            size: 26pt,
            font: "Alfa Slab One",
          )
        ],
      )
    ],
  )
}


#let classesPage() = {
  let _getLeaderPages() = {
    return (
      artificer.artificerPage(),
      bard.bardPage(),
      cleric.clericPage(),
      shaman.shamanPage(),
      runepriest.runePriestPage(),
      warlord.warlordPage(),
    ).join(pagebreak())
  }

  let _getControllerPages() = {
    return (
      druid.druidPage(),
      invoker.invokerPage(),
      wizard.wizardPage(),
    ).join(pagebreak())
  }

  let _getStrikerPages() = {
    return (
      avenger.avengerPage(),
      barbarian.barbarianPage(),
      ranger.rangerPage(),
      rogue.roguePage(),
      sorcerer.sorcererPage(),
      warlock.warlockPage(),
    ).join(pagebreak())
  }

  let _getDefenderPages() = {
    return (
      fighter.fighterPage(),
      paladin.paladinPage(),
      swordmage.swordmagePage(),
      warden.wardenPage(),
    ).join(pagebreak())
  }

  return [
    #roleCover(role: "Leaders", imgPath: "leaders.png")
    #pagebreak();
    #_getLeaderPages();
    #pagebreak();

    #roleCover(role: "Controllers", imgPath: "controllers-cropped.jpg")
    #pagebreak();
    #_getControllerPages();
    #pagebreak();

    #roleCover(role: "Strikers", imgPath: "strikers.jpg")
    #pagebreak();
    #_getStrikerPages();
    #pagebreak();

    #roleCover(role: "Defenders", imgPath: "defenders.jpg")
    #pagebreak();
    #_getDefenderPages();
  ]
}


