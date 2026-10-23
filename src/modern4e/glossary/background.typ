#import "../helpers/theme.typ" as theme;

#let backgroundPage() = {
  return [
    #theme.pageTitle(title: "Background");

    #columns(2)[
      Where did your adventurer come from? What life did they lead before taking up the mantle of heroism? Your character's background shapes who they are and where they came from. A background consists of two parts: an environment and their upbringing.

      = Environment
      Your environment describes what kind of area your adventurer grew up in. Did he come from a big city across the hill? Maybe he was part of a secluded cloister devoted to a god. Your environment influenced who you are and what you picked something up along the way. When choosing an environment, pick one from the following options: Nomadic, Rural, Wilderness, Urban, Secluded. 
      Each environment gives you a choice of 4 skills to pick from, you may choose one skill to become proficient in.

      == Nomadic
      Your adventurer grew up traveling from place to place, never staying in one location for too long. They might have been part of a caravan, or a tribe that roamed the land. Those who grow up in a nomadic environment learn to navigate the wilderness and work together to survive. You become proficient in either *Diplomacy*, *Acrobatics*, *Medicine* or *Nature*.

      == Rural
      Your adventurer grew up in a small town or village, surrounded by farmland and open fields. Life in a rural environment is often simple and hard-working, with a strong sense of community. Those who grow up in rural areas learn to get along with eachother, and everyone has to contribute to the community in some way through a trade. You become proficient in either *Crafting*, *Religion*, *Diplomacy* or *Perception*.

      == Wilderness
      Your adventurer grew up in the wilds, far from civilization. They might have lived in a forest, a desert, or a mountainous region. Life in the wilderness is often harsh and unforgiving, requiring resourcefulness and adaptability to survive. Those who grow up in the wilderness learn to be self-reliant and attuned to nature. You become proficient in either *Crafting*, *Nature*, *Acrobatics* or *Medicine*.

      == Urban 
      Your adventurer grew up in a bustling city or town, surrounded by people and activity. Life in an urban environment is often fast-paced and diverse, with a wide range of cultures and experiences. Those who grow up in urban areas learn to navigate social situations and political movements as part of the city life. You become proficient in either *Bluff*, *Society*, *Insight* or *Intimidate*.

      == Secluded
      Your adventurer grew up in a secluded environment, such as a monastery, a fortress, or a hidden village. Life in a secluded environment is often disciplined and focused, with a strong emphasis on tradition and values. Those who grow up in secluded areas have enough time to study and self-discipline. You become proficient in either *Crafting*, *Arcana*, *Religion* or *Society*.

      #colbreak();

      = Upbringing
      Your upbringing describes the teachings and daily activities your adventurer was exposed to while growing up. Did they go to a prestigious academy, or did they instead join the militia? Just like environments, your upbringing influenced who you are and what skills you might have picked up on along the way. When choosing an upbringing, pick one from the following options: Academic, Militaristic, Lawless, Labor, Spiritual, Creative. Each upbringing gives you a choice of 4 skills to pick from, you may choose one skill to become proficient in.

      == Academic
      Your adventurer was raised in an environment that valued knowledge and learning. They might have attended a prestigious academy, or been part of a scholarly community. Those who grow up with an academic upbringing learn to think critically and value education. You become proficient in either *Arcana*, *Society*, *Crafting* or *Medicine*.

      == Militaristic
      Your adventurer was raised in a disciplined and structured environment, such as a military academy or a warrior clan. Those who grow up with a militaristic upbringing learn the value of order, strategy, and physical fitness. You become proficient in either *Endurance*, *Medicine*, *Athletics* or *Diplomacy*.

      == Lawless
      Your adventurer was raised in a chaotic and unpredictable environment, such as a gang, a thieves' guild, or a rough neighborhood. Those who grow up with a lawless upbringing learn to be resourceful and adaptable, often relying on their wits to get by. You become proficient in either *Stealth*, *Thievery*, *Intimidate* or *Insight*.

      == Labor
      Your adventurer was raised in a working-class environment that valued hard work and practical skills. They might have grown up in a family of laborers, craftsmen, or farmers. Those who grow up with a labor upbringing learn the value of perseverance and dedication. You become proficient in either *Athletics*, *Crafting*, *Endurance* or *Perception*.

      == Spiritual
      Your adventurer was raised in a religious or spiritual environment, such as a temple, a monastery, or a faith-based community. Those who grow up with a spiritual upbringing learn to value faith, compassion, and inner strength. You become proficient in either *Religion*, *Diplomacy*, *Medicine* or *Nature*.

      == Creative
      Your adventurer was raised in an environment that valued artistic expression and creativity. They might have grown up in a family of artists, performers, or musicians. Those who grow up with a creative upbringing learn to think outside the box and value individuality. You become proficient in either *Bluff*, *Acrobatics*, *Crafting* or *Diplomacy*.
    ]
  ]
}