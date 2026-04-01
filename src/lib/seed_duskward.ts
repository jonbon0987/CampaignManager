// seed_duskward.ts
// -----------------------------------------------------------
// Seeds submodules and monster/character sheets for the
// "Interlude: The Duskward" module from the Chapter 1 PDF.
//
// USAGE:
//   1. Make sure VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.
//   2. npx tsx src/lib/seed_duskward.ts
//
// This script looks up the Duskward module by title so you don't
// need to hardcode its UUID.
// -----------------------------------------------------------

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !key) {
  throw new Error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY / VITE_SUPABASE_ANON_KEY');
}

const supabase = createClient(supabaseUrl, key);
const USER_ID = '6529dd61-6bca-4403-8a07-3bf8423f6d8d';

async function insertRows(table: string, rows: object[]) {
  const { error } = await supabase.from(table).insert(rows);
  if (error) {
    console.error(`❌  ${table}:`, error.message);
  } else {
    console.log(`✅  ${table}: ${rows.length} row(s) inserted`);
  }
}

async function getModuleId(title: string): Promise<string> {
  const { data, error } = await supabase
    .from('modules')
    .select('id')
    .eq('title', title)
    .eq('user_id', USER_ID)
    .maybeSingle();
  if (error) throw new Error(`Failed to find module "${title}": ${error.message}`);
  if (!data) throw new Error(`Module "${title}" not found. Run the main seed first.`);
  return data.id;
}

// ============================================================
// SUBMODULES
// 6 areas from the dungeon module PDF
// ============================================================

async function seedSubmodules(moduleId: string) {
  await insertRows('submodules', [
    {
      user_id: USER_ID,
      module_id: moduleId,
      sort_order: 0,
      title: 'Area 0 — The Murk: Descent to the Duskward',
      submodule_type: 'encounter',
      summary: 'The party descends through the murk to the sunken Duskward. Corrupted Giant Crabs guard the descent. Mortecai feels the first trace of the Reliquary the moment he enters the water.',
      content: `AREA 0 — THE MURK: DESCENT TO THE DUSKWARD
Setting: The sunken merchant vessel Duskward, lake floor off Pier 6 in Skarport's Murk.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
READ ALOUD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"The water here is the color of old tea and smells of brine and something sharper — something chemical. Below you, at the limit of visibility, a dark shape rests on the lake floor. The hull is intact but listing hard to starboard. One mast still stands, trailing weed. The ship's bell hangs at the bow, and in the stillness of the deep water, you can just barely hear it — ringing, faintly, in a current that shouldn't exist this far down."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHAT MORTECAI NOTICES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
The moment Mortecai enters the water, he knows something. A warmth that doesn't belong to the temperature — the trace of the Reliquary, faint and familiar, rising from somewhere below. It's like recognizing a voice in the next room. He can't make out words yet. But he knows the voice. Tell him only this: it was here.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ENCOUNTER: CORRUPTED GIANT CRABS × 3
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
(See monster sheets for full stat blocks.)
Tactics: Two crabs grapple; the third circles and strikes grappled targets.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PC MOMENTS — DESCENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Craren: moves through the water like he was born in it.
• Mittens: descends in a straight line like a dropped anvil.
• Exius: swimming technique should be described at length regardless of his roll.
• Kutter: checks his instruments are sealed.
• Mara: notices the bioluminescence from below and recognizes the wildstone signature.`,
      dm_notes: `Wild Magic Corruption applies to all creatures in the dungeon:
• Wild Magic Surge (Passive): 15+ damage from single hit → roll d6: 1–2 = attacker outlined in wild magic (enemies have advantage); 3–4 = resistance to that damage type until next turn; 5–6 = +5 ft. reach, advantage on next attack.
• Toxic Discharge (On Death): All creatures within 10 ft. make DC 12 Con save or disadvantage on concentration checks for 1 minute. Mortecai has advantage.
• Glow: All corrupted creatures have eyes/wounds that glow faint blue-green. Cannot hide in darkness.
• +15 HP to every stat block.

Exius Special Rule — The Conductor: Any time Exius is within 20 ft. of a leaking wildstone crate or a corrupted creature using Wild Magic Surge, roll d6. On 1–2: Exius also triggers a minor Wild Magic Surge. On 3+: he just feels it, like a bell rung behind his teeth. Play for laughs.`,
    },
    {
      user_id: USER_ID,
      module_id: moduleId,
      sort_order: 1,
      title: 'Area 1 — The Hull Breach',
      submodule_type: 'encounter',
      summary: 'A cracked section of the lower hull serves as the entry point. A dead sailor pinned under a beam reveals the ship sank by murder, not accident. Loot includes a sailor\'s logbook mentioning the scholar "Kael" and a locket.',
      content: `AREA 1 — THE HULL BREACH

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
READ ALOUD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"A section of the lower hull has cracked open where the ship struck the lake bed. The gap is about three feet wide — enough for most of you, barely. Splintered timber juts inward like teeth. Through the gap, the faint blue-green glow of the cargo hold is visible. Loose debris and rope drift in the current. Somewhere inside, something shifts."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ENTRY OPTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Squeeze Through:    Medium or smaller creatures can pass freely. Larger: DC 12 Acrobatics or Dex.
                    Failure: 1d6 piercing + stuck until DC 14 Str.
Widen the Gap:      DC 15 Athletics (Mittens has advantage).
                    Nat 1: section collapses — 2d6 bludgeoning, DC 13 Dex for half. Makes noise.
Craren's Option:    Slips through with no check required, scouts 30 ft. ahead, and reports back.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DEAD SAILOR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Just inside the breach: a dead sailor pinned under a collapsed support beam. Three days old but preserved by the cold water. Kutter can examine it — DC 13 Medicine.

On success: the sailor did not drown. His lungs have no water in them. He was dead before the ship went down — blunt trauma to the back of the skull. It's deliberate. The ship didn't sink by accident.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LOOT — NEAR THE BREACH
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Drifting near the entry: a waterproofed canvas satchel. Inside:
• 22 gp in mixed coin
• A sailor's logbook (last entry: "New passenger. Quiet. Doesn't eat with us. Keeps the box close.")
• A locket containing a miniature portrait of a halfling woman.
  Whoever she was waiting for is pinned under that beam.`,
      dm_notes: `The logbook's "new passenger" entry is the scholar who transported the Reliquary. The logbook mentions the passenger boarded in Bildorahl, paid in advance, and requested the cargo hold be kept locked. This is a concrete lead — the Reliquary came from Bildorahl.`,
    },
    {
      user_id: USER_ID,
      module_id: moduleId,
      sort_order: 2,
      title: 'Area 2 — The Cargo Hold',
      submodule_type: 'encounter',
      summary: 'The main cargo hold glows with leaked wildstone bioluminescence. A pressure-plate hazard threatens a wild magic pulse. Enemies: Corrupted Quipper Swarm + Corrupted Merrow (Drowned Guard). Cob\'s three sealed crates are here, plus a strongbox with a cargo manifest naming "Passenger Kael."',
      content: `AREA 2 — THE CARGO HOLD

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
READ ALOUD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"The hold is larger than it looks from outside. Three rows of crates are still strapped to the walls, several cracked open, leaking a blue-green light that fills the space with cold color. The floor is a tangle of netting, rope, and scattered cargo. Cob's sealed crates are here — three of them, stamped with the Arborath refinery mark. Something else is here too. You can hear it before you can see it — a low, rhythmic ticking sound, like a heartbeat made of teeth."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ENVIRONMENTAL HAZARD — THE PRESSURE PLATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
A cracked wildstone crate has settled onto a release valve in the floor. The first creature to move one of the sealed cargo crates will inadvertently shift the pressure equilibrium.
• DC 13 Perception to notice the valve before triggering.
• If triggered: wild magic pulse — every creature in the hold makes a DC 13 Con save or rolls once on the Wild Magic Surge table.
• Craren notices the valve automatically if he scouts ahead.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ENCOUNTER: CORRUPTED QUIPPER SWARM + 1 CORRUPTED MERROW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
(See monster sheets for full stat blocks.)
Tactics: Merrow harpoons isolated casters, drags them through netting. Uses Wild Slam when PCs cluster. Swarm illuminates targets for the Merrow to exploit.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MORTECAI IN THE CARGO HOLD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
The warmth is stronger here. There are traces of it on the netting — the scholar rested the box on these ropes at some point. Tell Mortecai: it's closer above, not here. The trail leads up through the ship.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LOOT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Cob's three sealed crates (each ~80 lbs; DC 12 Athletics to move, or rope to Mortecai's aquatic form)
• Locked iron strongbox chained to wall: DC 14 Thieves' Tools or DC 16 Str.
  Inside: 85 gp, a small emerald (50 gp), and a cargo manifest.
  The manifest has a line for "Personal Effects, Passenger Kael" — value listed as "incalculable."
  Item marked as transferred to captain's custody prior to departure.`,
      dm_notes: `The passenger "Kael" is the scholar who stole the Reliquary. The captain's custody note means the cube was moved to the Captain's Cabin for safekeeping. This is a deliberate breadcrumb. Mortecai will feel the warmth pulling upward when someone tells him what it says.`,
    },
    {
      user_id: USER_ID,
      module_id: moduleId,
      sort_order: 3,
      title: 'Area 3 — The Crew Quarters',
      submodule_type: 'social',
      summary: 'A quiet, no-combat room with an air pocket for rest. Bodies sway in the current. Deliberately paced for character moments and roleplay. Each PC has a specific discovery. The cut-down hammock is the saboteur\'s.',
      content: `AREA 3 — THE CREW QUARTERS

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
READ ALOUD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"The tilted corridor opens into the crew quarters — eight hammocks, most still occupied by what remains of the crew. The bodies sway in the current like sleeping men. An air pocket has collected at the ceiling here; the water surface is only about eighteen inches above your heads if you stand. Someone has already been through this room. A hammock has been cut down. A personal trunk lies open and emptied."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AIR POCKET
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Characters can surface here to breathe. Air is stale but breathable. Party can speak normally, take a short rest, and regroup. Air lasts approximately 30 minutes before it becomes dangerously stale.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NO COMBAT — CHARACTER MOMENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
This room is deliberately quiet after the cargo hold. Let it breathe.

MITTENS:  Finds a dwarven good luck charm — a small carved badger, the kind sold at dock markets.
          He decides whether he takes it or puts it back.

CRAREN:   A hammock has a Harengon-sized dent in it. Left behind: a half-deck of playing cards,
          marked for cheating. Old marks. Someone on this crew knew the trade.

EXIUS:    Finds a book in a crew locker — Introduction to Theoretical Spellcraft, Volume II.
          The most basic possible magic primer. He will read it with absolute seriousness.

KUTTER:   The cut-down hammock is the saboteur's. Neat. Took the whole thing, left no trace.
          Professional. Comfortable with not leaving things behind.

MARA:     A small crystal vial, sealed with wax, tucked under a mattress.
          Inside: a single drop of something that glows faintly. Refined wildstone, high purity.
          Not from these crates. Someone brought this personally.

MORTECAI: One of the bodies near the back clutches a small carved wooden figure — crude,
          homemade — in the shape of a druid holding a staff. The carving style is from the
          eastern desert. Someone on this ship had been somewhere Mortecai knows.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LOOT — CREW QUARTERS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Scattered through trunks and hammocks:
• 47 gp in mixed coin
• A pair of loaded dice (always roll 5 or 6; DC 14 Investigation to notice)
• A sailor's compass that points to the nearest large body of fresh water rather than north
• The marked card deck`,
      dm_notes: `This is the breathing room of the dungeon. Do not rush it. The saboteur's cut-down hammock is the most significant detail for Kutter — a professional who leaves no trace. The refined wildstone vial Mara finds belongs to the saboteur, not to the cargo. It establishes the thorn-seal network had resources beyond hiring muscle.`,
    },
    {
      user_id: USER_ID,
      module_id: moduleId,
      sort_order: 4,
      title: 'Area 4 — The Captain\'s Cabin (Boss)',
      submodule_type: 'encounter',
      summary: 'The dungeon\'s boss room. Captain Aldous Dray — a Wildstone Revenant — guards the open Reliquary compartment. The cube is gone; only its impression in the wood remains. The captain\'s desk holds the thorn-seal letter, the R.V. handler note, and the property deed.',
      content: `AREA 4 — THE CAPTAIN'S CABIN

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
READ ALOUD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"The door at the end of the corridor is sealed from the inside. Through the warped wood, you can see light — not the blue-green of the wildstone, but something whiter, colder. The handle is ice-cold to the touch. When you force the door open, the light hits you: the entire cabin is illuminated by a slowly rotating column of wild magic energy, rising from a reinforced compartment in the floor. Standing in the center of it, facing the door as if he has been waiting, is the captain. What's left of him."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BOSS: CAPTAIN ALDOUS DRAY, THE ANCHORED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
(See monster sheet for full stat block.)

Dray does not speak. He opens his mouth and the ship's bell rings — that same faint, impossible ringing from above, now loud and close and wrong. He fights until destroyed. He has no interest in parley.

On initiative count 20 (losing ties): Dray throws his head back and the bell rings once. A body tears free from wherever it rests in the ship and lurches upright. The summoned crewman acts immediately after init 20 and persists until destroyed or until Dray uses this action again. (Zombie stat block + +15 HP + Brine-Soaked + Toxic Discharge.)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
THE RELIQUARY COMPARTMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
The rotating column of wild magic rises from an open compartment in the floor — reinforced oak, iron-banded, with a lock that has been picked clean. The compartment is empty.

After the fight — Mortecai's Moment:
The warmth Mortecai has been following across the entire ship radiates from this box like heat from a cooling oven. He has found where it was. Give him a quiet beat. He can kneel at the compartment. The wood remembers the cube — the grain is faintly altered, the density changed, like the Reliquary left an impression of itself in the material. He knows what was here. He knows it's gone. He knows it was taken deliberately — the lock was picked, not broken. Someone planned this. He doesn't know where it is. Yet.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
THE CAPTAIN'S DESK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Bolted to the wall, waterproof compartment inside. Contains:

1. The Duskward's manifest and captain's log
   (Last entry: "Passenger Kael has asked me to move his box to my cabin for safety. I've agreed.
   Something is wrong with this voyage. Too many eyes on us.")

2. A letter, sealed with wax — a stylized THORN DESIGN. Already opened.
   Inside: "Transfer the cube to the handler per the contract. Ensure the scholar does not arrive.
   The guild must not receive it." No signature. The seal is distinctive and unfamiliar.

3. A folded note in different handwriting, tucked inside the letter:
   "Handler: R.V. Ask for the Warden's package."
   R.V. means nothing to anyone yet. It should mean something to Kutter later.

4. Captain's personal lockbox: 120 gp, a ring with a large blue-green wildstone gem (75 gp to
   the right buyer), and a deed to a small property in Skarport
   (a half-burned warehouse by the docks).`,
      dm_notes: `THE THORN SEAL: belongs to the thorn-seal network the party will encounter again. Do not explain it. Do not connect it to any named figure yet. It should feel professional and ominous — someone with reach, operating through intermediaries, who does not put their name on anything. Let it sit as an open question.

"R.V." = Captain Renly Vaust — on Kutter's list. The retired Guard Captain who captured and exiled Albrecht Thane is now apparently operating as a handler for a criminal network. Kutter will recognize the initials. Do NOT flag this to the player; let Tucker make the connection himself.

MORTECAI'S MOMENT is the emotional climax of the dungeon. Do not rush it. The compartment is the payoff for every "the warmth grows stronger" beat across the previous rooms. Let the silence of not-finding it land.`,
    },
    {
      user_id: USER_ID,
      module_id: moduleId,
      sort_order: 5,
      title: 'Area 5 — The Bilge (Optional — Craren Only)',
      submodule_type: 'other',
      summary: 'A 14-inch hatch only Craren can fit through. In the dark bilge he finds a waterproof bundle with the saboteur\'s confession letter naming "the woman at the trinket shop," a Driftglobe, a wildstone shard, and 35 gp + stones.',
      content: `AREA 5 — THE BILGE (OPTIONAL — CRAREN ONLY)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
READ ALOUD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"The bilge access panel is barely visible under the netting in the crew quarters — a 14-inch square hatch leading down into the ship's lowest section. No adult human, elf, or orc could fit. A dwarf would not fit. A small halfling might, on a good day, with a lot of exhaling. A Harengon, however, was practically built for exactly this kind of gap."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ACCESS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Craren only. No check required to fit. Completely dark — needs his own light source.
DC 13 Perception to find the concealed section at the far end.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHAT HE FINDS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
A small waterproof bundle tucked into the ribs of the hull above the waterline:

• A Driftglobe (functions normally; currently dark, can be activated as an action).

• A folded letter addressed to "Whoever finds this in case I don't make it"
  Written by the saboteur. He was hired through a third party to transfer the "cube artifact"
  to a warehouse before the ship docked. Something went wrong. The ship went down before
  the transfer could be completed. He made it off. He feels guilty. He does not name his employer.
  He does name his contact: "the woman at the trinket shop."

• A small sack: 35 gp and two semi-precious stones (10 gp each).

• One wildstone shard — raw, unrefined wild magic crystallized into a dark blue-green stone
  about the size of a thumb. Unstable and slightly warm to the touch.
  Used as a spell component, it causes the spell to also roll once on the Wild Magic table. Single use.`,
      dm_notes: `"The woman at the trinket shop" = Madge, proprietor of Madge's Oddments — or possibly the person operating out of the back of Magis Oddmitz. The phrasing is deliberately ambiguous. Both exist in Skarport. This should generate table discussion about which one and whether they're connected. Plant the seed and let it grow.

CRAREN'S MOMENT: When Craren surfaces back into the crew quarters and relays this information, he has just had the best session contribution in terms of pure intelligence gathered. He found it alone, in a hole no one else could reach, by being exactly what he is. That should feel good.`,
    },
  ]);
}

// ============================================================
// MONSTER / STAT SHEETS
// ============================================================

async function seedSheets(moduleId: string) {
  await insertRows('module_sheets', [
    // ---- Global Modifier "sheet" (not a creature, but needs to be at the table) ----
    {
      user_id: USER_ID,
      module_id: moduleId,
      sort_order: 0,
      title: 'Wild Magic Corruption — Global Modifier',
      sheet_type: 'other',
      content: `WILD MAGIC CORRUPTION — GLOBAL MODIFIER
Applied to ALL creatures encountered in the Duskward.
(Exposed to leaking wildstone runoff for 3 days.)

+15 HP  ............  Every stat block has +15 HP beyond its standard total.

GLOW  ..............  Eyes (and sometimes wounds) glow faint blue-green.
                      Cannot benefit from hiding in darkness.

WILD MAGIC SURGE (Passive)
  Trigger: creature takes 15+ damage from a single hit.
  Roll a d6:
    1–2  Attacker outlined in wild magic — enemies have advantage on attacks
         against the attacker until the attacker's next turn.
    3–4  Corrupted creature gains resistance to that damage type until its next turn.
    5–6  Corrupted creature briefly grows: +5 ft. reach, advantage on next attack.

TOXIC DISCHARGE (On Death)
  All creatures within 10 ft. make DC 12 Con save.
  Failure: disadvantage on concentration checks for 1 minute.
  Mortecai has advantage on this save.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXIUS SPECIAL RULE — THE CONDUCTOR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Exius's wild magic body chemistry reacts badly to concentrated wildstone.
Any time Exius is within 20 ft. of a leaking wildstone crate OR a corrupted creature
when it uses its Wild Magic Surge ability, roll a d6:
  1–2  Exius also triggers a minor Wild Magic Surge (roll on the table).
  3+   Nothing happens except he feels it — like a bell rung behind his teeth.
Play for laughs.`,
      dm_notes: `This modifier applies without exception to every enemy in the dungeon. Remind yourself before each encounter. The +15 HP in particular changes action economy significantly. The Exius rule is comedy gold — lean into it.`,
    },
    // ---- Area 0: Corrupted Giant Crabs ----
    {
      user_id: USER_ID,
      module_id: moduleId,
      sort_order: 1,
      title: 'Corrupted Giant Crab (×3) — Area 0',
      sheet_type: 'monster',
      content: `CORRUPTED GIANT CRAB
Base: Giant Crab (MM p. 324) + Wild Magic Corruption modifiers
Quantity: 3

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STATS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HP:     28 each  (base 13 + 15 corruption)
AC:     15  (natural armor)
Speed:  30 ft., swim 30 ft.
Size:   Medium

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ACTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Claw (Melee Weapon Attack):
  +3 to hit, reach 5 ft., one target.
  Hit: 1d6+1 bludgeoning damage.
  Special: Target is grappled on hit (DC 11 Str to escape).
  The crab can grapple up to two creatures simultaneously.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SPECIAL ABILITIES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Shell Vent (Reaction, 1/creature):
  Trigger: Takes 10+ damage from a single hit.
  Effect: 5-ft. radius wild magic vapor.
  All creatures in range make DC 11 Con save or are blinded until end of their next turn.

Wild Magic Corruption (global):
  Wild Magic Surge (passive) | Toxic Discharge (on death) | Glow | +15 HP (included above)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TACTICS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Two crabs grapple PCs. The third circles and strikes grappled targets.
Shell Vent is a reaction to taking heavy damage — use it to punish burst-damage PCs.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NOTES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Underwater combat: The Ship's Tilt (20° list to starboard) — DC 10 Acrobatics/Athletics to avoid
slipping on sloped surfaces (DC 12 during combat). Doors on the low side are jammed — DC 13 Str.`,
      dm_notes: `Opening encounter. Set the tone for the dungeon's wild magic weirdness. Lean into the Exius Conductor rule here — the Shell Vent vapor is exactly the kind of thing that might set him off.`,
    },
    // ---- Area 2: Corrupted Quipper Swarm ----
    {
      user_id: USER_ID,
      module_id: moduleId,
      sort_order: 2,
      title: 'Corrupted Quipper Swarm — Area 2',
      sheet_type: 'monster',
      content: `CORRUPTED QUIPPER SWARM
Base: Swarm of Quippers (MM p. 338) + Wild Magic Corruption modifiers

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STATS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HP:     43  (base 28 + 15 corruption)
AC:     13
Speed:  swim 40 ft.
Size:   Medium swarm of Tiny beasts

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STANDARD SWARM TRAITS (MM p. 338)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Resistances: bludgeoning, piercing, slashing
Immunities: charmed, exhaustion, frightened, grappled, paralyzed, petrified, prone, restrained, stunned
Swarm: can occupy another creature's space and vice versa. Can move through any opening large
       enough for a Tiny quipper. Cannot regain HP or gain temp HP.

Blood Frenzy: Advantage on melee attack rolls against any creature that doesn't have all its HP.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ACTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Bites (Melee Weapon Attack):
  +5 to hit, reach 0 ft., one creature in swarm's space.
  Hit: 4d6 piercing (half HP or fewer remaining: 2d6 piercing).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CORRUPTION SPECIAL ABILITY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Bioluminescent Frenzy:
  When the swarm deals damage to a creature, that creature is illuminated (bright light 5 ft.)
  until the start of the swarm's next turn.
  Enemies have advantage on attack rolls against that illuminated creature.

Wild Magic Corruption (global):
  Wild Magic Surge (passive) | Toxic Discharge (on death) | Glow | +15 HP (included above)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TACTICS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Works in tandem with the Merrow. Swarm illuminates a high-priority target; Merrow capitalizes with
harpoon. Keep the swarm moving between two targets to spread illumination.`,
      dm_notes: `The Bioluminescent Frenzy is the real danger here — it negates stealth and creates targeting advantage for the Merrow. PCs who try to hide or back off in the murky water get lit up. Great for highlighting Mara's wildstone recognition — she saw this bioluminescence from above during the descent.`,
    },
    // ---- Area 2: Corrupted Merrow ----
    {
      user_id: USER_ID,
      module_id: moduleId,
      sort_order: 3,
      title: 'Corrupted Merrow (Drowned Guard) — Area 2',
      sheet_type: 'monster',
      content: `CORRUPTED MERROW — "THE DROWNED GUARD"
Base: Merrow (MM p. 218) + Wild Magic Corruption modifiers
Background: The Duskward's hired muscle, drowned and reanimated by wildstone saturation.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STATS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HP:    60  (base 45 + 15 corruption)
AC:    13  (natural armor)
Speed: 10 ft., swim 40 ft.
Size:  Large

Str 18 (+4) | Dex 10 (0) | Con 15 (+2) | Int 8 (−1) | Wis 10 (0) | Cha 9 (−1)

Saves: Str +6, Con +4
Senses: Darkvision 60 ft., Passive Perception 10
Languages: Abyssal, Aquan

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TRAITS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Amphibious: Can breathe air and water.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ACTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Multiattack: Makes two attacks: one with its Claws and one with its Harpoon, or two Claws.

Claws (Melee Weapon Attack):
  +6 to hit, reach 5 ft., one target.
  Hit: 2d6+4 slashing.

Harpoon (Melee or Ranged Weapon Attack):
  +6 to hit, reach 5 ft. or range 20/60 ft., one target.
  Hit: 2d6+4 piercing.
  Special: If the target is Medium or smaller, it must succeed on a DC 14 Strength saving throw
           or be pulled up to 20 feet toward the Merrow.

Wild Slam (Recharge 5–6):
  The Merrow slams the ship's hull/ceiling with wildstone-charged force.
  Each creature in a 10-ft. radius around the Merrow must make a DC 13 Strength saving throw.
  Failure: knocked prone + 2d8 thunder damage.
  Additionally: raining ceiling debris — DC 12 Dex save or 1d6 bludgeoning.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CORRUPTION SPECIAL ABILITIES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Wild Magic Surge (passive) | Toxic Discharge (on death) | Glow | +15 HP (included above)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TACTICS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Priority 1: Harpoon the most dangerous isolated caster; drag them through netting (difficult terrain).
Priority 2: Use Wild Slam when 2+ PCs cluster — knock them prone in the difficult-terrain cargo hold.
Priority 3: If the Quipper Swarm illuminates a target, follow up with Claw + Harpoon combo.
The Merrow uses the cargo hold's netting as environmental cover — treat areas with netting as
difficult terrain for movement purposes.`,
      dm_notes: `The cargo hold's tilt and netting are this fight's main environmental factors. Prone PCs in difficult terrain are extremely vulnerable. The Harpoon + drag combo is best used to separate the party's spellcasters from melee support. Wild Slam is devastating against clustered PCs — use it the moment 2+ characters enter the same 10-ft. area. The Quipper Swarm is the setup; the Merrow is the payoff.`,
    },
    // ---- Area 4: Captain Aldous Dray ----
    {
      user_id: USER_ID,
      module_id: moduleId,
      sort_order: 4,
      title: 'Captain Aldous Dray — Wildstone Revenant (Boss)',
      sheet_type: 'monster',
      content: `CAPTAIN ALDOUS DRAY — WILDSTONE REVENANT
Type: Undead (revenant variant) — reanimated by concentrated wild magic in the compartment.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STATS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HP:    108  (base 78 + 15 corruption + 15 for dying at his post)
AC:    13
Speed: 30 ft., swim 30 ft.
Size:  Medium undead

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ACTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Multiattack: Two Spectral Hook attacks.

Spectral Hook (Melee Weapon Attack):
  +7 to hit, reach 5 ft., one target.
  Hit: 1d8+4 necrotic damage.
  Special: Target makes DC 13 Con save or loses 5 ft. of movement speed until its next turn.

Anchor Pull (Recharge 5–6):
  +7 to hit, reach 30 ft., one target.
  Hit: Target is grappled and restrained (escape DC 16).
  While restrained, target sinks 5 ft. per turn in open water.

Wild Surge Burst (1/Day):
  Trigger: Dray drops to half HP or below.
  Effect: 20-ft. radius burst.
  All creatures in range make DC 14 Con save.
  Failure: 4d8 wild damage + roll once on the Wild Magic Surge table.
  Success: Half damage, no table roll.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REACTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
The Ship Remembers:
  Trigger: An ally enters the cabin.
  Effect: Dray makes one Spectral Hook attack as a reaction.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LEGENDARY ACTIONS (3/round, after another creature's turn)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Move (1 action):         Moves up to 15 ft. without provoking opportunity attacks.
Rattle the Chains (1):   All grappled/restrained creatures take 1d6 necrotic damage.
Eyes of the Drowned (2): One creature makes DC 13 Wis save or is frightened until end of its
                         next turn.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LAIR ACTION — THE BELL RINGS (Initiative Count 20)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
On initiative count 20 (losing ties), Captain Dray throws his head back and the ship's bell rings once.
A body tears free from wherever it rests in the ship and lurches upright. The summoned crewman
acts immediately after initiative count 20 and persists until destroyed or until Dray uses this action again.

SUMMONED CREWMAN — Zombie (MM p. 316) with modifications:
  • +15 HP  (wildstone corruption)
  • Brine-Soaked: moves through water at full speed; does not impose difficult terrain when
    grappling underwater.
  • Toxic Discharge on Death: DC 12 Con save or disadvantage on concentration for 1 min
    within 10 ft. (same as global modifier).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BEHAVIOR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Dray does not speak. He opens his mouth and the ship's bell rings — the same faint, impossible
ringing from above, now loud and close and wrong. He fights until destroyed. No interest in parley.

Wild Magic Corruption (global):
  Wild Magic Surge (passive) | Toxic Discharge (on death) | Glow | +15 HP (included above)`,
      dm_notes: `This is the emotional payoff of the dungeon as much as a mechanical one. Dray fighting silently, with a bell ringing from his open mouth, should feel wrong — not scary in a standard undead way, but wrong. The Reliquary compartment's glow fills the room. When Dray drops to half HP, the Wild Surge Burst goes off — this is the moment the room escalates.

ANCHOR PULL is the fight's signature move. If it grapples a PC in the open water section of the cabin, the sinking mechanic becomes terrifying. Prioritize the party's most mobile striker.

The Lair Action's Summoned Crewman should always emerge from somewhere narratively resonant: the crewman Mittens saw in a hammock, the sailor Mortecai noticed holding a carved figure. Make the details match what the party saw in the crew quarters.

AFTER THE FIGHT: Do not rush to the loot. Give Mortecai the compartment beat first.`,
    },
  ]);
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log('🌊  Seeding Duskward submodules and sheets...\n');

  const moduleId = await getModuleId('The Duskward');
  console.log(`📦  Found module: ${moduleId}\n`);

  await seedSubmodules(moduleId);
  await seedSheets(moduleId);

  console.log('\n✅  Duskward seed complete.');
}

main().catch(console.error);
