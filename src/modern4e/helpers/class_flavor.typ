#import "class_data.typ" as data;

#let classFlavor = (
  "Artificer": (
    quote: data.artificerQuote,
    info: data.artificerInfo,
    role: data.artificerRole,
    image: data.artificerImage,
  ),
  "Avenger": (
    quote: data.avengerQuote,
    info: data.avengerInfo,
    role: data.avengerRole,
    image: data.avengerImage,
  ),
  "Barbarian": (
    quote: data.barbarianQuote,
    info: data.barbarianInfo,
    role: data.barbarianRole,
    image: data.barbarianImage,
  ),
  "Bard": (
    quote: data.bardQuote,
    info: data.bardInfo,
    role: data.bardRole,
    image: data.bardImage,
  ),
  "Cleric": (
    quote: data.clericQuote,
    info: data.clericInfo,
    role: data.clericRole,
    image: data.clericImage,
  ),
  "Druid": (
    quote: data.druidQuote,
    info: data.druidInfo,
    role: data.druidRole,
    image: data.druidImage,
  ),
  "Fighter": (
    quote: data.fighterQuote,
    info: data.fighterInfo,
    role: data.fighterRole,
    image: data.fighterImage,
  ),
  "Invoker": (
    quote: data.invokerQuote,
    info: data.invokerInfo,
    role: data.invokerRole,
    image: data.invokerImage,
  ),
  "Paladin": (
    quote: data.paladinQuote,
    info: data.paladinInfo,
    role: data.paladinRole,
    image: data.paladinImage,
  ),
  "Ranger": (
    quote: data.rangerQuote,
    info: data.rangerInfo,
    role: data.rangerRole,
    image: data.rangerImage,
  ),
  "Rogue": (
    quote: data.rogueQuote,
    info: data.rogueInfo,
    role: data.rogueRole,
    image: data.rogueImage,
  ),
  "Runepriest": (
    quote: data.runePriestQuote,
    info: data.runePriestInfo,
    role: data.runePriestRole,
    image: data.runePriestImage,
  ),
  "Shaman": (
    quote: data.shamanQuote,
    info: data.shamanInfo,
    role: data.shamanRole,
    image: data.shamanImage,
  ),
  "Sorcerer": (
    quote: data.sorcererQuote,
    info: data.sorcererInfo,
    role: data.sorcererRole,
    image: data.sorcererImage,
  ),
  "Swordmage": (
    quote: data.swordmageQuote,
    info: data.swordmageInfo,
    role: data.swordmageRole,
    image: data.swordmageImage,
  ),
  "Warden": (
    quote: data.wardenQuote,
    info: data.wardenInfo,
    role: data.wardenRole,
    image: data.wardenImage,
  ),
  "Warlock": (
    quote: data.warlockQuote,
    info: data.warlockInfo,
    role: data.warlockRole,
    image: data.warlockImage,
  ),
  "Warlord": (
    quote: data.warlordQuote,
    info: data.warlordInfo,
    role: data.warlordRole,
    image: data.warlordImage,
  ),
  "Wizard": (
    quote: data.wizardQuote,
    info: data.wizardInfo,
    role: data.wizardRole,
    image: data.wizardImage,
  ),
)

#let defaultFlavor = (
  quote: none,
  info: none,
  role: none,
  image: data.defaultImage,
)

#let getQuote(className: str) = {
  classFlavor.at(className, default: defaultFlavor).quote
}

#let getInfo(className: str) = {
  classFlavor.at(className, default: defaultFlavor).info
}

#let getRole(className: str) = {
  classFlavor.at(className, default: defaultFlavor).role
}

#let getImage(className: str) = {
  classFlavor.at(className, default: defaultFlavor).image
}
