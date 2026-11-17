#import "../helpers/theme.typ" as theme;

#let featsPage() = {
  return [
    #theme.pageTitle(title: "General Feats");
    = Heroic Feats
    #columns(3)[

      #theme.featBlocksFromJson("../content/feats/heroic/general.json");

    ]

    = Paragon Feats
    #columns(3)[

      #theme.featBlocksFromJson("../content/feats/paragon/general.json");

      #colbreak();

      == Elemental Feats

      #theme.featBlocksFromJson("../content/feats/paragon/general-elemental.json");

      #colbreak();

      == Divine Feats

      #theme.featBlocksFromJson("../content/feats/paragon/general-divine.json");

      #colbreak();
      == Specialist Feats

      #theme.featBlocksFromJson("../content/feats/paragon/general-specialist.json");
    ]

    #pagebreak();

    = Multiclass Feats
    #columns(2)[
      == General
      #theme.featChoicesFromJson("../content/feats/multiclass/general.json");

      == Fighter

      #theme.featChoicesFromJson("../content/feats/multiclass/fighter.json");

      == Cleric

      #theme.featChoicesFromJson("../content/feats/multiclass/cleric.json");

      == Paladin

      #theme.featChoicesFromJson("../content/feats/multiclass/paladin.json");

      == Ranger

      #theme.featChoicesFromJson("../content/feats/multiclass/ranger.json");

      == Rogue

      #theme.featChoicesFromJson("../content/feats/multiclass/rogue.json");

      == Warlock

      #theme.featChoicesFromJson("../content/feats/multiclass/warlock.json");

      == Warlord

      #theme.featChoicesFromJson("../content/feats/multiclass/warlord.json");

      == Wizard

      #theme.featChoicesFromJson("../content/feats/multiclass/wizard.json");

      == Avenger

      #theme.featChoicesFromJson("../content/feats/multiclass/avenger.json");

      == Barbarian

      #theme.featChoicesFromJson("../content/feats/multiclass/barbarian.json");

      == Bard

      #theme.featChoicesFromJson("../content/feats/multiclass/bard.json");

      == Druid

      #theme.featChoicesFromJson("../content/feats/multiclass/druid.json");

      == Invoker

      #theme.featChoicesFromJson("../content/feats/multiclass/invoker.json");

      == Shaman

      #theme.featChoicesFromJson("../content/feats/multiclass/shaman.json");

      == Sorcerer

      #theme.featChoicesFromJson("../content/feats/multiclass/sorcerer.json");

      == Warden

      #theme.featChoicesFromJson("../content/feats/multiclass/warden.json");

      == Runepriest

      #theme.featChoicesFromJson("../content/feats/multiclass/runepriest.json");

      == Artificer

      #theme.featChoicesFromJson("../content/feats/multiclass/artificer.json");

      == Swordmage

      #theme.featChoicesFromJson("../content/feats/multiclass/swordmage.json");
    ]
  ]
}
