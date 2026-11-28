#let zeitgeistBuild = "ZEITGEIST";
#let homebrewBuild = "HOMEBREW";

#let version = "v2.0";
#let editionName = "(Rest in) Peace Summit Edition";

#let _isCurrentBuild = zeitgeistBuild;

#let isZeitgeistBuild = _isCurrentBuild == zeitgeistBuild;
#let isHomebrewBuild = _isCurrentBuild == homebrewBuild;
#let isRevisedRules = sys.inputs.at("rules", default: "2.0") == "2.0";
