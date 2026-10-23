#import "../helpers/theme.typ" as theme;
#import "../helpers/configuration.typ" as config;
#import "zeitgeist_themes.typ": zeitgeistThemesPage;

#let themesPage() = {
  let defaultThemePage() = {
    return [
      Here you can find a list of possible themes to select. Note they are sorted at what playstyle they offer, while you may think this means you should pick one that matches your class, it is not mandatory and even beneficial if you take one to spread your capabilities a bit.

      I didn't really have time yet to properly do this in the document, so have a link that is pre-queried for you: #theme.externalLink("https://iws.mx/dnd/?list.full.theme=%22Bloodsworn%22%20OR%20%22Earth%20Forger%22%20OR%20%22Elemental%20Initiate%22%20OR%20%22Gloomwrought%20Emissary%22%20OR%20%22Guardian%22%20OR%20%22Knight%20Hospitaler%22%20OR%20%22Melee-Magthere%20Champion%22%20OR%20%22Misshapen%22%20OR%20%22Sentinel%20Marshal%22%20OR%20%22Trapsmith%22%20OR%20%22Vigilante%22%20OR%20%22Firecrafter%22%20OR%20%22Ghost%20of%20the%20Past%22%20OR%20%22Infernal%20Prince%22%20OR%20%22Iron%20Wolf%20Warrior%22%20OR%20%22Ironwrought%22%20OR%20%22Mercenary%22%20OR%20%22Outlaw%22%20OR%20%22Reaver%22%20OR%20%22Skulker%20of%20Vhaeraun%22%20OR%20%22Sohei%22%20OR%20%22Son%20of%20Alagondar%22%20OR%20%22Noble%20Adept%22%20OR%20%22Disgraced%20Noble%22%20OR%20%22Halaster%27s%20Clone%22%20OR%20%22Iliyanbruen%20Guardian%22%20OR%20%22Neverwinter%20Noble%22%20OR%20%22Noble%22%20OR%20%22Templar%22%20OR%20%22Beguiler%22%20OR%20%22Blackstaff%20Apprentice%22%20OR%20%22Ghost%20of%20the%20Past%22%20OR%20%22Ooze%20Adept%22%20OR%20%22Order%20Adept%22%20OR%20%22Primordial%20Adept%22%20OR%20%22Sorcerer%20Adept%22%20OR%20%22Veiled%20Alliance%22")[
        See Themes Here
      ]

      == Flavor
      The flavor of these themes are very specific. As such I recommend ignoring any part of those you don’t enjoy or like.

      == Notes
      Anything that says “+X bonus to Y checks and Z checks” or the likes in regards to skill, ignore these lines for now. They will gain something else as we don’t use the old skill system anymore.

      #columns(2)[
        #theme.choiceBox("Defender")
        - Bloodsworn
        - Earth Forger
        - Elemental Initiate
        - Gloomwrought Emissary
        - Guardian
        - Knight Hospitaler
        - Melee-Magthere Champion
        - Misshapen
        - Sentinel Marshal
        - Trapsmith
        - Vigilante

        #colbreak();

        #theme.choiceBox("Striker")
        - Firecrafter
        - Ghost of the Past
        - Infernal Prince
        - Iron Wolf Warrior
        - Ironwrought
        - Mercenary
        - Outlaw
        - Reaver
        - Skulker of Vhaeraun
        - Sohei
        - Son of Alagondar
      ]

      #columns(2)[
        #theme.choiceBox("Leader")
        - Noble Adept
        - Disgraced Noble
        - Halaster's Clone
        - Iliyanbruen Guardian
        - Neverwinter Noble
        - Noble
        - Templar

        #colbreak();

        #theme.choiceBox("Controller")
        - Beguiler
        - Blackstaff Apprentice
        - Ghost of the Past
        - Ooze Adept
        - Order Adept
        - Primordial Adept
        - Sorcerer Adept
        - Veiled Alliance
      ]
    ]
  }

  return [
    #theme.pageTitle(title: "Themes");
    #if (config.isZeitgeistBuild) {
      zeitgeistThemesPage()
    } else if (config.isHomebrewBuild) {
      defaultThemePage()
    }
  ]
}
