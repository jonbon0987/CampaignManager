// seed.ts
// -----------------------------------------------------------
// One-time seed script to insert all existing Age of Wild Magic
// campaign data into Supabase.
//
// USAGE:
//   1. Make sure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are
//      in your .env file (or export them as env vars).
//   2. Sign in as your DM account first so the RLS user_id resolves,
//      OR temporarily set your user_id directly via the SERVICE ROLE
//      key (see note below).
//   3. npx tsx seed.ts
//
// SERVICE ROLE NOTE:
//   RLS policies require auth.uid() to match user_id.
//   For a one-time seed from the CLI (where there is no browser session),
//   the easiest path is to use the service role key instead of the anon key.
//   Get it from: Supabase Dashboard → Project Settings → API → service_role key
//   Set it as SUPABASE_SERVICE_ROLE_KEY in your env, and this script will
//   prefer it. NEVER commit the service role key or expose it client-side.
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

// --------------- Replace with your actual Supabase user UUID ---------------
// Find it in: Authentication → Users → your account row
const USER_ID = '6529dd61-6bca-4403-8a07-3bf8423f6d8d';

// ============================================================
// HELPERS
// ============================================================

async function insert(table: string, rows: object[]) {
  const { error } = await supabase.from(table).insert(rows);
  if (error) {
    console.error(`❌  ${table}:`, error.message);
  } else {
    console.log(`✅  ${table}: ${rows.length} row(s) inserted`);
  }
}

const uid = () => USER_ID;

// ============================================================
// SESSIONS
// ============================================================

async function seedSessions() {
  await insert('sessions', [
    {
      user_id: uid(),
      session_number: 1,
      session_date: '2026-03-01',
      summary: `Campaign opens on Balderia. The New Renegades intercept a train from Bildorahl expecting crown jewels and find food instead. A guardian dragon forces their retreat. Train encounters: passenger car, baboonfolk casino (jazz band, roulette), plantfolk riddle-givers, Armand the drunken animated armor (drinking contest DC 12/15/17), goblin boss with trough of fake gems. Goblin boss hinted real jewels were elsewhere. Torbo called abort via sending stone. Crew escaped empty-handed on the Nimbus 2000.`,
      combats: `Goblin guards + hobgoblin brutes · Baboonfolk casino crew · Plantfolk riddle-givers · Armand: drinking contest · 2 badgers + goblin boss · Guardian dragon (fled)`,
      loot_rewards: `None — the run was a bust`,
      hooks_notes: `Crown jewels location unknown. What is the guardian dragon? Gorg refocuses: target Arborath's crown jewels directly via the Queen's tournament.`,
      dm_notes: `The guardian dragon is a recurring mystery. Consider whether it is state-controlled, an independent wild magic entity, or tied to the railroad's history. Its appearance hints at bigger forces watching.`,
    },
    {
      user_id: uid(),
      session_number: 2,
      session_date: '2026-03-08',
      summary: `Docked at Skarport. Crew fans out to raise 1,200 gp. Exius performed as "The Amazing Exius," earned 100 gp. Pip from Guild of Balderon introduced herself — sent specifically to watch Exius. Mara ran fake gem stall (100 gp); spotted Finn; locked eyes with older black dragonborn refugee — felt burning sensation and flickering flames (Drexis bloodline resonance). Craren hustled the Sunken Crown, caught by Garth Two-Fingers, arranged pit fight. Mittens worked Rendering Yard (60 gp), met orphan Tuck, paid 20 gp for Tuck's fare to Arborath. Mortecai moved Gerald the pelican back to his island (60 gp), rescued water sprite Salo from wildstone poisoning — Salo cleansed the entire harbor. Kutter ran barber stand, spotted Finn at Mara's stall, teamed with Mara for fake fleshweaving job in Room 3 at Gutted Eel (100 gp). Staged pit fight: Mittens vs Craren, Mittens took theatrical dive. 1,000 gp jackpot. Gorg sold ship furniture to close the gap.`,
      combats: `Modified Shadow Rat Swarm (Rendering Yard) — Mortecai · Wild magic-poisoned animals — Mortecai`,
      loot_rewards: `1,000 gp total. Mara: 100 gp · Exius: 100 gp · Kutter+Mara: 100 gp · Mortecai: 60 gp · Mittens: 60 gp net · Craren: 40 gp. Mittens spent 20 gp on Tuck.`,
      hooks_notes: `Finn — fleshweaver at Madge's Oddments, Kutter recognized the style. Tuck — en route to Arborath. Salo — healed, cleansed harbor. Pip — Guild of Balderon, watching Exius. Mara's dragonborn vision — tied to Drexis the Black Inferno. Wildstone runoff trails toward Craren's warren. New job posted: retrieve sealed cargo from sunken ship (the Duskward), 100 gp.`,
      dm_notes: null,
    },
    {
      user_id: uid(),
      session_number: 3,
      session_date: '2026-03-22',
      summary: `Party woke at the Gutted Eel. Kutter served breakfast fondue from the inn kitchen — deceptively non-dairy. Trolled lactose-intolerant Torbo mercilessly. Party interrogated Cob Wrenwick before diving, confirming he's untrustworthy but not lying about the shipwreck. Donned makeshift scuba gear and descended into the Murk off Pier 6. Mortecai sent a frog familiar to scout — promptly consumed by a glowing crab. Fought three Corrupted Giant Crabs at the hull breach. Inside: discovered a sailor murdered after the ship sank (not drowned). Cargo hold yielded Cob's three sealed wildstone crates plus a lockbox with the ship manifest — passenger "Kael" listed with personal effects of "incalculable value." Corrupted Quipper Swarm attacked; their bites left glowing blue wild magic marks on Exius. Air pocket rest stop in crew quarters — each PC had a character moment. Captain's cabin: Captain Aldous Dray had risen as a Wildstone Revenant — defeated after a brutal fight; his death caused a wild magic explosion. The compartment was recently emptied — footprints showed someone entered through a crew quarters hatch, picked the lock, removed a cube-shaped object, and exited the same way, pausing at a cut-down hammock. Mortecai found a hidden bilge panel: a planted confession letter from the saboteur, naming "the woman at the trinket shop" as a contact. The letter is a deliberate fabrication. Party returned the cargo to Cob and blackmailed him for additional gold beyond the 100 gp reward. Gorg confirmed the party departs for Arborath next session and laid out the two-tier tournament heist plan.`,
      combats: `3 Corrupted Giant Crabs — Area 0, Murk descent · Corrupted Quipper Swarm — Area 2, Cargo Hold · Captain Aldous Dray (Wildstone Revenant) — Area 4, Captain's Cabin`,
      loot_rewards: `Cob's 100 gp reward + additional gold (blackmail) · Hull breach: 22 gp, sailor's logbook, locket · Cargo hold strongbox: 85 gp, emerald (50 gp), ship manifest · Crew quarters: 47 gp, loaded dice, water-compass, marked cards · Captain's cabin: 120 gp, wildstone ring (75 gp), property deed, thorn-sealed letter, R.V. handler note · Bilge (Craren): 35 gp, 2 semi-precious stones (20 gp), Driftglobe, wildstone shard`,
      hooks_notes: `Kael confirmed as passenger — personal effects logged as "incalculable value"; almost certainly died with the crew. Verdant Reliquary confirmed stolen from the Duskward before sinking — empty cube compartment, footprints, picked lock, thorn-sealed letter with "R.V." handler note. Trail goes cold in Skarport. Bilge confession letter is a planted fabrication — names "the woman at the trinket shop" (Madge). Cob Wrenwick is now significantly indebted and nervous. Exius took glowing quipper bites — wild magic marking worth watching. Gorg's Arborath two-tier plan confirmed: Plan A (win tournament → quarterfinals inside the castle → vault access) / Plan B (break-in team proceeds during tournament distraction regardless). Party departs for Arborath next session.`,
      dm_notes: `The thorn-sealed letter belongs to a professional criminal network. The captain's note references "the guild" — this is the Guild of Balderon. The thorn-seal network was moving the Reliquary specifically to keep it out of Guild hands. Do NOT connect either document to Darius or any named villain. The trail goes cold here by design.`,
    },
    {
      user_id: uid(),
      session_number: 4,
      session_date: '2026-03-29',
      summary: `Party split for their last morning in Skarport. Kutter and Mara visited Madge's Oddments. Madge confirmed the pale elf — dark hair, bright blue eyes — left the same day the party arrived. Kutter recognized the hand description immediately: same hands from Mara's stall. Gnome woman (matching Pip's description) had also visited earlier, browsing for trinkets — showed interest in the back room but left empty-handed. Kutter found a brass thorn-seal challenge coin behind a loose board in the back room. One face: thorn-seal symbol. Other face: internal rank marker. Mortecai, Mittens, and Craren investigated the scrapyard near the docks. Found a cache of high-quality noble furniture marked 'TL' in a sealed-off section claimed by a Trash Lurker: a wild magic-mutated spider-like creature, territorial about the furniture. After a tense standoff the Lurker licked Mittens (ceremonial mind-transfer, psychic connection lasting a few days), the party negotiated — took the furniture, left the futon. Mortecai used Cure Wounds on the Trash Lurker, partially reversing the mutation and improving its memory. Lurker confirmed contamination from Balderian Extraction's refinery. Cob Wrenwick found dead before the party departed — mouth stuffed with wildstones and magically stitched shut (fleshweaving method). A pale elf matching Finn's description had been seen nearby. Mortecai's investigation identified three distinct sets of fingerprints (blue, red, yellow) — none matching Duskward evidence. Cob's papers confirmed under-the-table arrangement with Balderian Extraction. Party departed aboard the Nimbus 2000 before Cob's body was officially discovered. As they pulled away from Pier 9, a dockworker was seen knocking at the dockmaster's office door. Nobody answered.`,
      combats: `None — Trash Lurker standoff resolved through negotiation and a ceremonial licking`,
      loot_rewards: `Thorn-seal challenge coin (Madge's back room) · Noble furniture cache marked 'TL' (taken from scrapyard, minus one futon) · Cob's office records — Balderian Extraction contracts, wildstone supply chain documents`,
      hooks_notes: `Finn confirmed as pale elf, dark hair, bright blue eyes — identity locked for Arborath. Also now primary suspect in Cob's murder (fleshweaving method). Thorn-seal coin acquired — first tangible network infrastructure in the party's hands. Gnome woman (likely Pip) visited Madge's the same morning — may have been looking for the coin. Balderian Extraction confirmed as the refinery dumping wildstone waste into the harbor. Trash Lurker now friendly with Mortecai; Mittens has a temporary psychic connection. 'TL' furniture markings unexplained. Three-fingerprint evidence at Cob's crime scene — different from Duskward evidence. Party aboard the Nimbus 2000 en route to Arborath.`,
      dm_notes: `DM-ONLY — KUTTER KILLED COB. He did it in disguise, staging the scene to be misattributed to the pale elf operative (Finn). The party currently believes Finn is responsible, and the evidence supports that reading. Do not surface the truth unless Tucker reveals it or roleplay demands it. The fleshweaving method (stitched shut with wildstones) is consistent with Kutter's actual guild training. The three fingerprint colors at the crime scene: one set is almost certainly Kutter's. Do not confirm which. 'TL' furniture: almost certainly noble house initials, not 'Torbo and Lurker.' The gnome woman at Madge's is almost certainly Pip — she arrived too early to find the coin. Balderian Extraction: now confirmed in the harbor supply chain. Cob was their logistics anchor in Skarport — with him dead, that arrangement is exposed. Scratch Vellum collector beat didn't happen — file for Arborath.`,
    },
  ]);
}

// ============================================================
// PLAYER CHARACTERS
// ============================================================

async function seedPlayerCharacters() {
  await insert('player_characters', [
    {
      user_id: uid(),
      character_name: 'Mara Lapideri',
      player_name: 'Nikki',
      race: 'Elf',
      class: 'Wizard',
      background: `Daughter of Imperator Tarathiel Kelsalor of Ishvalenora. Sent to study under royal mage Malachi in Arborath. Overheard Darius and Malachi's plot; Malachi cursed her and wiped her memory, turning her into an old human woman. Woke in a swamp and was trained by a blind wizard. In Skarport: ran fake gem stall (100 gp), spotted Finn, locked eyes with older black dragonborn refugee — felt burning sensation and flickering flames (Drexis bloodline resonance). Teamed with Kutter for fake fleshweaving job in Room 3 at Gutted Eel. A real crystal Finn left in her bag hums genuinely.`,
      story_hooks: `Reassemble the Heart of the Inferno — three shards: Warden's Stone (Antynyxia), Root Stone (Toterbaum), Deep Stone (Bildorahl). All three must be reunited and pressed to the skull at Antynyxia to lift the curse. Skarport vision: burning sensation and flickering flames from the older black dragonborn — the edges of Drexis's last memory. The crystal Finn dropped in Mara's bag — almost certainly accidental, but it hums genuinely. Malachi is one of the Slayers — will she recognize him in her cursed form?`,
      key_npcs: `Tarathiel Kelsalor — father, Imperator of Ishvalenora · Malachi The Mage — former teacher, now a Slayer · Blind wizard — swamp mentor · Princess Lilith — childhood friend at court · Finn — network operative posing as a fleshweaver; dropped a real crystal in her bag when fleeing`,
      dm_notes: null,
      is_active: true,
    },
    {
      user_id: uid(),
      character_name: 'Kutter Cook',
      player_name: 'Tucker',
      race: 'Human',
      class: 'Bard / Fleshweaver',
      background: `True name: Albrecht Thane. Served noble Lord Halvric Domwell as a fleshweaver until Domwell wanted his wife Viola. Albrecht refused; Domwell had him framed for treason and exiled. Wife "relocated under royal oversight." Children became wards of minor houses. Now operating as "Kutter Cook," working toward calculated revenge. In Skarport: ran barber stand, spotted a cloaked figure at Mara's stall whose hand movements he recognized as Fleshweavers' Guild technique — someone who, by guild records, should not be practicing. Teamed with Mara for fake fleshweaving job in Room 3 at Gutted Eel (100 gp). Aldric Voss sat in his barber chair — Kutter chose what to do with a razor in his hand.`,
      story_hooks: `Lord Halvric Domwell — primary target, orchestrated the exile · Lady Seraphine Kestrel — minister of laws, brought the writ · Guildwarden Pel Varos — contracted to supply fleshweaving to House Brimholt in Arborath · Captain Renly Vaust — captured and exiled him; initials "R.V." in the Duskward thorn-seal letter · House Brimholt — wardens of his children · Aeltharion Nightwind — false elven witness · Queen Talenia Kaldani — signed off without trial · Finn — spotted using guild techniques in Skarport; now gone.`,
      key_npcs: `Viola Thane — wife (whereabouts unknown) · His two children — possibly at House Brimholt in Arborath · Aldric Voss — list-adjacent, seen in Skarport · Finn — network operative; Kutter recognized the technique, not the man · Dorro Pallwick — patient at Gutted Eel`,
      dm_notes: `The Fleshweavers' Guild reports to the thorn-seal network. A devastating late-campaign revelation for Kutter. Do not surface prematurely. KUTTER KILLED COB WRENWICK — staged the scene in disguise to be misattributed to Finn. One of the three fingerprint sets at the crime scene is his. Do not surface unless Tucker reveals it.`,
      is_active: true,
    },
    {
      user_id: uid(),
      character_name: 'Mortecai Wastewalker',
      player_name: 'Roger',
      race: 'Bugbear',
      class: 'Druid',
      background: `A desert druid whose family has protected the Verdant Reliquary — a green cube that restores dead land by taking life from elsewhere — for generations. His ancestors chose NOT to use it during a famine to preserve balance. A scholar posing as an academic stole the Reliquary. Mortecai now tracks it across continents. The trail has led to Balderia. In Skarport: moved Gerald the pelican back to his island (60 gp). Cleared Shadow Rat Swarm under Rendering Yard. Rescued water sprite Salo from wildstone crystallisation — Salo cleansed the harbor after healing.`,
      story_hooks: `Find and recover the Verdant Reliquary before it is misused · A faction of the thorn-seal network is also hunting the Reliquary — agents pursue Mortecai · Wildstone runoff in Skarport traces to the southwestern shore near Craren's warren · The final choice: can the Reliquary ever be used without causing harm? · Pip shares his interest in wildstone contamination fieldwork`,
      key_npcs: `Scholar thief — whereabouts TBD · Pip — Guild researcher, shares wildstone interest · Salo — healed water sprite, possible future ally · Sallow — fisherman who found Salo`,
      dm_notes: null,
      is_active: true,
    },
    {
      user_id: uid(),
      character_name: 'Mittens',
      player_name: 'David',
      race: 'Dwarf',
      class: 'Fighter',
      background: `Full name: Dandelion Babblingbrook Crossways. Found as an infant at a crossroads by Orwin Tallowmere who ran an orphanage in Arborath's lower wards. Grew up poor, resorted to theft, was taken in by pit fighter Ironjaw. Earned the street name "Mittens." Carries a battered book of Orwin's poems. In Skarport: worked the Rendering Yard (60 gp), met orphan Tuck — a mirror of his own past. Paid 20 gp out of pocket for Tuck's fare to an orphanage in Arborath. Staged pit fight with Craren, took theatrical dive, helped crew pocket 1,000 gp jackpot.`,
      story_hooks: `Tuck — orphan in Skarport's Rendering Yard, now en route to Arborath · Scratch Vellum operates in both Skarport AND Arborath — same network threatening Orwin's orphanage · The poem Tuck gave him — one of Orwin's, copied in a child's handwriting · What happened to Orwin Tallowmere? · Ironjaw — mentor or secret villain? Possible 1v1 showdown; may be tied to the orphanage`,
      key_npcs: `Orwin Tallowmere — orphanage founder, father figure · Ironjaw — pit fighter mentor (alignment uncertain) · Tuck — orphan met in Skarport · Scratch Vellum — tiefling crime lord, Skarport + Arborath`,
      dm_notes: `Mittens has a temporary psychic connection to the Trash Lurker (lasts a few days unless renewed) from Session 4.`,
      is_active: true,
    },
    {
      user_id: uid(),
      character_name: 'Exius',
      player_name: 'Dawson',
      race: 'Halfling',
      class: 'Fighter / Barbarian',
      background: `Real name Tolfir Halfton. What Exius does not know: a faction within the Guild of Balderon attempted to reincarnate the founder himself using wild magic, imprinting Balderon's magical signature onto an unborn child. Tolfir Halfton was the result. The experiment half-worked — the imprint took, but expressed itself physically rather than magically. Wild magic flooded his body and made him enormously strong instead of gifted with spellcraft. To the Guild, he was a failed prototype. He grew up surrounded by wizards in Arborath, desperate to become one, never understanding why magic felt so close and yet so wrong. Caught reading restricted books and banned, he was sent on an impossible errand — find the Lost Spellbook of Balderon. He believes his physical feats are actual magic because on some level they are: wild magic is literally woven into his body. In Skarport: performed as "The Amazing Exius," levitating via a hidden crate. Earned 100 gp. Pip from the Guild of Balderon introduced herself — sent specifically to monitor him.`,
      story_hooks: `He is not a failed wizard — he is a dormant magical echo of Balderon. The imprint is real. It is sleeping. · The Guild told him the spellbook will never be found because they don't want him to find it — it may be the key to completing the imprint, or unraveling it entirely · Lilith is Balderon's blood descendant; Exius is his magical echo — something may register when they are in close proximity · Pip's field notes are surveillance reports going back to a senior faction in the Guild · The first time Exius holds the Lost Spellbook, it should open to a page it has no reason to open to · If a rival faction learns what Exius is, he becomes a target for a very different reason`,
      key_npcs: `Guild of Balderon — created him; monitors him at a distance · Pip — Guild researcher, assigned to surveil him; her notes go somewhere he doesn't know about · Mortecai — his 'rival' for Pip's research attention (Exius's interpretation) · Princess Lilith — his bloodline counterpart`,
      dm_notes: `The imprint is real and sleeping. Do not over-explain. Let the mystery accumulate naturally through his interactions with Lilith and proximity to wild magic groves. Exius does NOT know about the Guild's imprinting experiment. Reaction to the coin/note should be curiosity, not recognition. Pip's quipper-mark examination in Session 3 produced the most significant reading she has ever recorded on him — she did not share what she wrote. Scratch Vellum's collector backed off when he noticed the glowing wild magic marks on Exius's skin.`,
      is_active: true,
    },
    {
      user_id: uid(),
      character_name: 'Craren Wispmaw',
      player_name: 'Chloe',
      race: 'Harengon',
      class: 'Rogue',
      background: `Young Harengon from a warren near the Cottage hunters' lodge. Many siblings left or died from wild magic poisoning caused by refinery waste dumped near their home. Became primary caretaker for his sick mother; resorted to theft. Caught cheating at poker by noble Kraxus; Captain Gorg recruited him instead. In Skarport: hustled at the Sunken Crown, caught by Garth Two-Fingers, ended up in pit fight against Mittens. Mortecai's wildstone investigation pointed toward the southwestern lakeshore — near a warren of small folk not seen in over a year.`,
      story_hooks: `Reconnect with the old warren crew — are they doing suspiciously well? · Kraxus (Ishvalenoran noble) wants revenge for the poker hustle · His warren was a dumping ground for wild magic refinery waste — who is responsible? · Wildstone runoff trails to the southwestern shore near a warren of small folk · His mother's illness is tied to the dumping; confrontation with those responsible is coming · The Warren Deal: Craren's warren is doing suspiciously well — clean water, food they shouldn't have. The wildstone contamination was diverted, not cleaned up. Someone redirected it downstream in exchange for a deal. Craren's mother is better. That should feel like a trap.`,
      key_npcs: `Kraxus — Ishvalenoran noble, wants revenge · Mother — sick from wild magic poisoning · Gorg Grimfang — rescued him from the poker table · Garth Two-Fingers — Sunken Crown owner`,
      dm_notes: null,
      is_active: true,
    },
  ]);
}

// ============================================================
// NPCS
// ============================================================

async function seedNPCs() {
  await insert('npcs', [
    {
      user_id: uid(), name: 'Gorg Grimfang', role: 'Captain of the New Renegades',
      affiliation: 'The New Renegades / Nimbus 2000', status: 'active',
      description: `Older Black orc with a gruff voice. Captain of the Nimbus 2000 and leader of the New Renegades. Has been on a streak of bad luck, targeting bigger and bigger scores. Has a strong moral compass and grows to care deeply about his crew — and Lilith.`,
      hooks_motivations: `His bad luck streak — what is causing it? His growing attachment to Lilith as a member of the crew. His relationship with fence contact Mingo.`,
      dm_notes: null, location: 'Nimbus 2000 (en route to Arborath)', first_session: 1,
    },
    {
      user_id: uid(), name: 'Torbo', role: 'First Mate of the Nimbus 2000',
      affiliation: 'The New Renegades', status: 'active',
      description: `Small middle-aged elephantfolk with a slow whale-like voice. Reliable first mate who manages the Nimbus 2000 and communicates with the crew via sending stones during heists.`,
      hooks_motivations: `Ship logistics and extraction during heists. Sent the abort signal in Session 1 when the guardian dragon appeared. Claims a history with the Trash Lurker in Skarport — the Lurker insists they are best friends; Torbo's feelings are reportedly not warm.`,
      dm_notes: null, location: 'Nimbus 2000 (en route to Arborath)', first_session: 1,
    },
    {
      user_id: uid(), name: 'Princess Lilith Kaldani', role: 'Princess of Arborath / Royal Stowaway',
      affiliation: 'House Kaldani / The New Renegades (future)', status: 'active',
      description: `Heir apparent to the Arborathian throne. Secretly adopted — the Queen could not have children. A direct descendant of the legendary wizard Balderon through a secret family line. Has powerful innate wild magic she does not yet fully understand. Desperately wants adventure and freedom from her sheltered life.`,
      hooks_motivations: `Darius siphons her magic to power the Great Tree. She can absorb and drain wild magic pools. Only she can wield the Arborhorn to summon the Planetary Defenders. Her true parentage and Balderon bloodline are the central lore mystery. Lilith is Balderon's blood descendant; Exius is his magical echo — something may register when they are in close proximity.`,
      dm_notes: null, location: 'Arborath (Royal Castle)', first_session: null,
    },
    {
      user_id: uid(), name: 'Darius', role: 'Magic Adviser to the Queen / True Villain',
      affiliation: 'Self / The Great Tree', status: 'active',
      description: `Ancient refugee from Ait Scath whose family was killed by the Magiclysm weapon in 9007 EM. Embedded himself as the Queen's Magic Adviser. Uses magical spores to control the Queen. Plans to channel wild magic through the Great Balderian Tree to cast a planet-wide spore infestation that resets civilization.`,
      hooks_motivations: `Controls the Queen via spores — overlaps with Kutter's revenge arc. Needed Lilith's magic to fully power the tree. Can sense the party near wild magic groves. Will grow to over twice his normal size when fully empowered. Wants the Verdant Reliquary — his agents actively pursue Mortecai.`,
      dm_notes: `The thorn-seal network's connection to Darius is the late-campaign revelation that reframes everything. Do not surface it prematurely. The Fleshweavers' Guild reports upward to the network to Darius. Neither the Guild of Balderon nor the party knows this yet. The bitter irony Darius will never know: his family was destroyed by the Magiclysm. Drexis the Black Inferno was the planet's response to that same weapon. Darius now plans to use the planet's own power to reset civilization. The planet already tried that once — and the answer it came up with was not a plague. It was a guardian.`,
      location: 'Arborath (Royal Castle)', first_session: null,
    },
    {
      user_id: uid(), name: 'Malachi The Mage', role: 'Royal Mage of Arborath / Slayer',
      affiliation: 'Queen Kaldani / Darius (reluctantly)', status: 'active',
      description: `One of the 5 Slayers. Originally the Queen's trusted court mage. Could not bring himself to kill Mara when she overheard their plans — cursed her instead and left a riddle in her pocket. Conflicted: knows Darius's plan is evil but feels trapped.`,
      hooks_motivations: `Mara does not recognize him in her cursed form. Could be turned against Darius if confronted correctly. The riddle he left Mara — what does it reveal?`,
      dm_notes: null, location: 'Arborath', first_session: null,
    },
    {
      user_id: uid(), name: 'Mingo', role: 'Fence / Criminal Broker',
      affiliation: 'Independent', status: 'active',
      description: `A gnome and Gorg's primary contact for moving stolen goods. Refuses to handle the crown jewels while the Slayers are active. Knows an alternate buyer in another city.`,
      hooks_motivations: `Introduces the group to the alternate jewel buyer in Chapter 4. His true loyalties may be more complicated than they appear.`,
      dm_notes: null, location: 'Unknown', first_session: null,
    },
    {
      user_id: uid(), name: 'Thresh', role: 'Proprietor of the Gutted Eel',
      affiliation: 'Skarport / Independent', status: 'active',
      description: `A one-armed lizardfolk woman who runs the Gutted Eel tavern — a converted decommissioned fishing barge. Has seen everything and is impressed by nothing. Manages the crew's home base in Skarport and maintains the job chalkboard.`,
      hooks_motivations: `Can cover for the party if they owe her a favor. Reliable information source about Skarport power dynamics.`,
      dm_notes: null, location: 'Skarport — The Gutted Eel', first_session: 1,
    },
    {
      user_id: uid(), name: 'Cob Wrenwick', role: 'Harbormaster of Skarport',
      affiliation: 'Skarport (nominally) / Balderian Extraction (under-the-table)', status: 'deceased',
      description: `A heavyset gnome in a perpetually damp coat. Officially governed Skarport and taxed everything that moved. Ran a smuggling operation on the side — the crates of refined wildstone the party recovered from the Duskward were his. The party blackmailed him for additional gold after the dive. Found dead before the party's departure — mouth stuffed with wildstones and magically stitched shut (fleshweaving method). His office records confirmed an under-the-table arrangement with Balderian Extraction: transporting and selling wildstone runoff and allowing harbor dumping.`,
      hooks_motivations: `DECEASED — but his ledgers are now in the party's hands. His Balderian Extraction contracts are the first document trail connecting the wildstone trade to a named company. Three sets of fingerprints (blue, red, yellow) found at the crime scene. Nobody above Cob is particularly scary. Balderian Extraction will notice their harbor arrangement is now unprotected. Garth Two-Fingers is the most likely short-term power to fill the Skarport vacuum.`,
      dm_notes: `DM-ONLY — KUTTER KILLED COB. He staged the scene in disguise to be misattributed to the pale elf operative (Finn). The party believes Finn is responsible, and the fleshweaving method is consistent with Finn's guild cover — but it is equally consistent with Kutter's own training. Kutter used his skills, covered his tracks, and the misdirection held. One of the three fingerprint sets at the crime scene is almost certainly his. Do not surface the truth unless Tucker reveals it in play.`,
      location: 'Skarport (deceased)', first_session: 2,
    },
    {
      user_id: uid(), name: 'Garth Two-Fingers', role: 'Proprietor of the Sunken Crown',
      affiliation: 'Skarport underworld', status: 'active',
      description: `A broad-shouldered hobgoblin who runs the Sunken Crown gambling den near Pier 4. Missing two fingers on his left hand and extremely sensitive about it. Caught Craren cheating and offered him the pit fight deal instead of violence. Practical rather than cruel.`,
      hooks_motivations: `With Cob dead, Garth is the most likely short-term power in Skarport. May be a recurring contact if the party returns. Runs rigged card games but respects hustle.`,
      dm_notes: null, location: 'Skarport — The Sunken Crown', first_session: 2,
    },
    {
      user_id: uid(), name: 'Finn', role: 'Network Operative / Cover: Fleshweaver',
      affiliation: 'The thorn-seal network (unknown to party)', status: 'active',
      description: `Appearance confirmed: pale elf, dark hair, bright blue eyes. Not primarily a fleshweaver — the guild work is a functional cover. A thorn-seal network operative recruited for his cunning and lack of empathy. Was based at Madge's Oddments for several weeks. Boarded the Duskward as a passenger, killed scholar Kael, retrieved the Reliquary, and signalled a contact ashore before the ship went down. Returned to Skarport to avoid suspicion, then fled when he recognized Kutter's Fleshweavers' Guild technique. The confession letter in the Duskward bilge was his plant. He left the thorn-seal coin behind by accident.`,
      hooks_motivations: `Confirmed in Arborath — the party's next destination. Description locked: pale elf, dark hair, bright blue eyes. Kutter will recognize those hands again. The bilge letter names Madge as a contact — accurate but overstated; Madge is peripheral, not operational. The Fleshweavers' Guild reports to the thorn-seal network. Do not surface prematurely.`,
      dm_notes: `Finn did NOT kill Cob Wrenwick. That was Kutter in disguise. The party suspects Finn; do not correct this. The Fleshweavers' Guild reports to the thorn-seal network. Do not surface prematurely.`,
      location: 'Arborath (confirmed)', first_session: 2,
    },
    {
      user_id: uid(), name: 'Madge', role: 'Proprietor of Madge\'s Oddments',
      affiliation: 'Skarport / peripheral network facilitator', status: 'active',
      description: `A heavyset, sharp-eyed halfling woman who runs Madge's Oddments near the docks. Let Finn use the back room for several weeks, knowing him as a middling fleshweaver and nothing more. Confirmed to Kutter and Mara that Finn left within hours of their arrival. Cooperated because the conversation cost her nothing. Will not be intimidated but will not resist a calm, transactional exchange. A peripheral network contact: facilitates, doesn't ask questions, doesn't know operational details.`,
      hooks_motivations: `Confirmed Finn's departure and described his hands — Kutter now has the identification. The gnome visitor (Pip?) was looking for something specific and left empty-handed. The party holds the thorn-seal coin she didn't know was there.`,
      dm_notes: null, location: 'Skarport — Madge\'s Oddments', first_session: 2,
    },
    {
      user_id: uid(), name: 'The Trash Lurker', role: 'Scrapyard Dweller / Wild Magic Mutant',
      affiliation: 'Independent (Skarport scrapyard)', status: 'active',
      description: `A wild magic-mutated creature of uncertain original species, now spider-like in build with too many limbs. Lives in a sealed-off section of the Skarport scrapyard where it has accumulated a hoard of discarded noble furniture including a cache marked 'TL.' Claims 'TL' stands for 'Torbo and Lurker, best friends forever.' Mutation caused by drinking bay water contaminated with Balderian Extraction wildstone runoff. Mortecai used Cure Wounds to partially reverse the mutation. Mittens received a ceremonial mind-transfer lick — temporary psychic connection (lasts a few days unless renewed). Left in possession of one futon and its dignity.`,
      hooks_motivations: `Now friendly with Mortecai — possible Skarport ally if party returns. Mittens has temporary psychic link. Confirmed Balderian Extraction refinery runoff is contaminating the bay and getting worse. 'TL' furniture origin unexplained — noble house markings from Arborath?`,
      dm_notes: null, location: 'Skarport — scrapyard', first_session: 4,
    },
    {
      user_id: uid(), name: 'Tuck', role: 'Orphan / En Route to Arborath',
      affiliation: 'None (formerly Skarport flophouse)', status: 'active',
      description: `A young dwarf sleeping in the Rendering Yard after Scratch Vellum shut down his flophouse. Mouthy, fast, and deeply unimpressed by Mittens's size. Mittens paid 20 gp out of his own pocket for Tuck's fare to an orphanage in Arborath.`,
      hooks_motivations: `Now traveling to Arborath — may arrive at or near Orwin's orphanage. Scratch Vellum shut down his home; same network threatening Orwin's orphanage. The poem Tuck gave Mittens — one of Orwin's, copied in a child's handwriting.`,
      dm_notes: null, location: 'En route to Arborath', first_session: 2,
    },
    {
      user_id: uid(), name: 'Pip', role: 'Field Researcher, Guild of Balderon',
      affiliation: 'Guild of Balderon', status: 'active',
      description: `A young gnome researcher from the Guild of Balderon. Sent to Skarport specifically to monitor Exius after detecting that the dormant imprint in his body may be shifting. Told Exius her mission directly — she is monitoring him — but not why. Her field notes are surveillance reports that go back to a senior faction within the Guild. Examined the glowing quipper bite marks on Exius before departure — her clinical focus was more pronounced than usual. What she doesn't say: this is the most significant reading she has ever recorded on him. Visited Madge's Oddments the morning of the party's departure, browsing for trinkets and showing interest in the back room. She left empty-handed.`,
      hooks_motivations: `Her reports go somewhere Exius doesn't know about. She doesn't know the full truth of what Exius is. She visited Madge's looking for the thorn-seal coin — and missed it. The party holds something she wants. When she sees the coin, she will recognize it as Guild authentication and understand a Guild operation was running through Skarport she was never read into. That will be the first crack. Will appear in Arborath with more information about the Lost Spellbook of Balderon. Her genuine interest in wildstone contamination connects her to Mortecai's work.`,
      dm_notes: `When Pip sees the thorn-seal challenge coin — which has the Guild of Balderon's mark on one face — she will recognize it as a Guild authentication token. This is the first crack in her loyalty to her handlers: it means a Guild operation was running through Skarport that she was never read into. She will want the coin. She will say it is for Guild records. What she actually wants is to find out which faction issued it. She visited Madge's looking for it and missed it. The party holds it. That gap in intelligence is her vulnerability.`,
      location: 'Arborath (en route)', first_session: 2,
    },
    {
      user_id: uid(), name: 'Salo', role: 'Water Sprite / Harbor Cleanser',
      affiliation: 'Independent (Skarport harbor)', status: 'active',
      description: `A young water sprite slowly crystallising from wildstone runoff contamination. Found tangled in fisherman Sallow's nets. Mortecai healed Salo. After being freed, Salo cleansed the entire harbor of wildstone contamination.`,
      hooks_motivations: `Possible future ally if the party returns to Skarport or the lake. Connected to the wildstone runoff trail leading to the southwestern lakeshore near Craren's warren.`,
      dm_notes: null, location: 'Skarport harbor', first_session: 2,
    },
    {
      user_id: uid(), name: 'Scratch Vellum', role: 'Crime Lord / False Charitable Foundation',
      affiliation: 'Independent multi-city network', status: 'active',
      description: `A gaunt tiefling who runs a 'charitable foundation' as a front for smuggling warehouses. Shut down the flophouse on Pier 2 in Skarport. The same Scratch Vellum is threatening Orwin Tallowmere's orphanage in Arborath. His collector was working Skarport the morning of the party's departure and was backed down when they clocked the wild magic marks on Exius's skin — he now has a description of someone who interfered with a collection.`,
      hooks_motivations: `The threat to Orwin's orphanage is NOT a local problem — it's part of a larger network. His connection to the wildstone smuggling trade is a possible thread. His collector now has a description of Exius. Scratch has eyes in Arborath.`,
      dm_notes: null, location: 'Arborath / Skarport (multi-city)', first_session: 2,
    },
    {
      user_id: uid(), name: 'Aldric Voss', role: 'Junior Clerk, Arborath Merchant Guild',
      affiliation: 'Guild of Arborath', status: 'active',
      description: `A low-level functionary of the Arborath Merchant Guild, in Skarport auditing import records. Did not recognize Kutter. Worked in the office of Guildwarden Pel Varos when Kutter's licenses were stripped. He handed Pel Varos the pen. He sat down in Kutter's barber chair and asked for a close shave.`,
      hooks_motivations: `First list-adjacent figure Kutter has encountered. If interrogated: revealed Pel Varos is contracted to supply fleshweaving to House Brimholt — where Kutter's children may be held. Kutter chose what to do with this man and a razor in his hand.`,
      dm_notes: null, location: 'Unknown (last seen Skarport)', first_session: 2,
    },
  ]);
}

// ============================================================
// LOCATIONS
// ============================================================

async function seedLocations() {
  await insert('locations', [
    {
      user_id: uid(), name: 'Skarport', region: 'Southwestern Shore, Lake Arborath',
      location_type: 'town', population: 'Small-medium port town', status: 'active',
      description: `A waterlogged, grimy port town on the southwestern shore of Lake Arborath. Technically governed by Harbormaster Cob Wrenwick — now deceased. In practice, the town is run by whoever is loudest at any given moment. The wildstone runoff contaminating the local wildlife traces back to the southwestern shore.`,
      history: `Party base of operations for Sessions 1–4. The Nimbus 2000 docked at Pier 9. Notable locations: The Gutted Eel (tavern), The Sunken Crown (gambling den), Madge's Oddments, The Rendering Yard, The Murk (Duskward site), Dockmaster's Office.`,
      dm_notes: `Cob Wrenwick's death will create a power vacuum. Garth Two-Fingers is the most likely short-term replacement. Balderian Extraction will notice their harbor arrangement is now unprotected. Scratch Vellum shut down the Pier 2 flophouse. The Trash Lurker is in the scrapyard near the docks.`,
    },
    {
      user_id: uid(), name: 'Arborath', region: 'Central Island, Lake Arborath',
      location_type: 'city', population: 'Large (50,000+)', status: 'compromised',
      description: `The capital city of Balderia, located on a central island in Lake Arborath. Led by Queen Talenia Kaldani (under Darius's spore control). A ring of defensive magic surrounds the island — why the crown jewels had to be retrieved from the train before it arrived. The Great Balderian Tree grows in the grove beneath the castle.`,
      history: `Originally a trading post between Ishvalenora, Bildorahl, and Toterbaum. Became the capital after the Invasion of 9680 EM. Balor Kaldani established the standing army and defensive pacts. Now the most diverse city in Balderia.`,
      dm_notes: `The Royal Castle: seat of power; the Great Balderian Tree grows in the grove beneath. Darius's sanctum. Guild of Balderon: wizards' guild, antagonistic to Exius; Pip works here. Wild Magic Refinery District: Craren's warren was a dumping ground for refinery waste. Scratch Vellum's network operates here. Orwin's Orphanage (lower wards): under threat from Scratch Vellum's network. Kutter's targets: Lord Halvric Domwell, Guildwarden Pel Varos (contracted to House Brimholt), Lady Seraphine Kestrel, and Queen Talenia herself are all in or connected to this city.`,
    },
    {
      user_id: uid(), name: 'Toterbaum', region: 'Western Coast',
      location_type: 'landmark', population: 'Small (~2,000)', status: 'active',
      description: `The first city of Balderia, founded ~9007 EM by Balderon the Creator. Originally known as Lebenbaum. Now a historical and spiritual site, caretakers maintain the Dead Great Tree. The Root Stone — one of the three shards of Drexis's heart — lies buried deep beneath the Great Tree's root system.`,
      history: `Founded by Balderon. Became the capital, grew rapidly, then fell to the Capellian invasion of 9680 EM when the Great Tree was burned. After Drexis destroyed the invaders (and died), the capital moved to Arborath. Now known as Toterbaum (dead tree).`,
      dm_notes: `The Root Stone (Mara's shard quest): buried deep under the Great Tree root system. The caretakers have documented anomalies for centuries — wild magic behaving erratically, roots that never rot — but have never found the cause. Anyone sensitive to wild magic who walks directly over it feels residual heat. Drexis lore: caretakers hold oral histories about the dragon. They know he came from the west and died protecting the tree. They do not know he was a planetary guardian, or that his heart shattered.`,
    },
    {
      user_id: uid(), name: 'Ishvalenora', region: 'Eastern Forest',
      location_type: 'city', population: 'Medium (~20,000)', status: 'active',
      description: `The elven city-state in the eastern forest. Led by Imperator Tarathiel Kelsalor (Mara's father, though she does not currently remember this). Isolationist — focused on growing the elven empire. Believes Arborath has abused the land's magic too much.`,
      history: `Founded 9083 EM by elves from Ait Tanai. Declared independence from high elves of Ait Tanai in 9475 EM. Elves have developed unique features after centuries in Balderia — glowing green eyes, horns, illuminated skin. Religious shift toward Malyk, elven god of wild magic.`,
      dm_notes: `Mara's father Tarathiel Kelsalor rules here and may send agents looking for her — she does not remember this in her cursed form. The Malyk religious shift among young elves is a slow-burn threat. Elven noble Kraxus (Craren's enemy) is from Ishvalenora.`,
    },
    {
      user_id: uid(), name: 'Bildorahl', region: 'Vilgarohm Mountain, West',
      location_type: 'city', population: 'Medium (~15,000)', status: 'active',
      description: `The dwarven fortress city carved into Vilgarohm Mountain. Led by Skalek Grimsword, who believes himself the rightful king of all Balderia. The transcontinental railroad originates here. Dwarven miners are approaching depths never before reached — and getting closer to the Deep Stone, the third shard of Drexis's heart.`,
      history: `Founded 9570 EM by dwarves exiled from Lebenbaum. Grimsword bloodline restored 9950 EM. Political powder keg — Skalek's ambitions threaten the Triumvirate.`,
      dm_notes: `The Deep Stone (Mara's shard quest): buried at the deepest unreached level of Vilgarohm. Stone runs warm below a certain depth; tools come back subtly changed. The scholar who stole the Verdant Reliquary from Mortecai boarded the Duskward in Bildorahl.`,
    },
    {
      user_id: uid(), name: 'Antynyxia', region: 'Coastal Town near Toterbaum',
      location_type: 'town', population: 'Small dragonborn settlement', status: 'active',
      description: `A small coastal town near Toterbaum, settled by dragonborn refugees from the island of Antynyx on the continent of Aerd. Built in the shadow of Drexis the Black Inferno's skull, which they consider a sacred site. The Warden's Stone — the largest shard of Drexis's heart — rests here. Mara must bring all three shards here and press them to the skull to lift her curse.`,
      history: `Many dragonborn in the area — particularly black dragonborn — carry residual wild magic imprinted from Drexis's death, passed down through bloodlines like a scar. Mara felt this during Session 2 when an older black dragonborn locked eyes with her.`,
      dm_notes: `The Warden's Stone is guarded not by traps or locks, but by a community of people for whom it is genuinely holy. Mara will have to reckon with what it means to take something that belongs to someone else's grief.`,
    },
    {
      user_id: uid(), name: 'Aquantus', region: 'Southern Coast, Mouth of Balderia',
      location_type: 'city', population: 'Military fortification', status: 'active',
      description: `Founded by Queen Silvie Kaldani after 9702 EM as a defensive fortification near the Mouth of Balderia. The Arborathian army and their families were moved here. A water genasi community living in the area was given alliance terms and their leader named Imperator. Guards the southern approach to the continent.`,
      history: `Founded by Queen Silvie. Holds the fourth seat in the Queen's Triumvirate alongside Arborath, Ishvalenora, and Bildorahl.`,
      dm_notes: null,
    },
    {
      user_id: uid(), name: 'The Ancient Grove of Thorns', region: 'Remote Interior of Balderia',
      location_type: 'landmark', population: 'Hidden underground city of wood elves', status: 'unknown',
      description: `A grove of thorns somewhere in the remote interior of Balderia, concealing a hidden underground city lit by bioluminescence. Home to wood-elf people who appear to be made entirely of living wood. The entrance only opens when Lilith's blood touches the thorns.`,
      history: `Key reveal location: confirmation of Lilith's true heritage and the history of the Balderian Brotherhood. The elder knows Darius's history and recognizes him as a heretic expelled from their group long ago.`,
      dm_notes: null,
    },
  ]);
}

// ============================================================
// FACTIONS
// ============================================================

async function seedFactions() {
  await insert('factions', [
    {
      user_id: uid(), name: 'The Guild of Balderon', faction_type: 'guild',
      overview: `The preeminent wizards' guild on the continent of Balderia, headquartered in Arborath. Publicly they are an institution of magical research and education, acting as advisers to city governments and gatekeepers of formal magical training. In practice they are a deeply political organization with an institutional agenda that has diverged significantly from their stated mission.`,
      key_figures: `Pip — field researcher, stationed in Skarport to monitor Exius. Her reports go back to a senior faction within the Guild.`,
      agenda: `Wants the Verdant Reliquary to study how it interacts with Exius specifically — a research question to them, a desecration to Mortecai. Monitors Exius at a distance via Pip. Institutional conflict with the Fleshweavers' Guild.`,
      dm_notes: `A secret faction within the Guild attempted to reincarnate Balderon using wild magic, imprinting his magical signature onto an unborn child. Tolfir Halfton (Exius) was the result. The experiment half-worked — the imprint took, but expressed physically rather than magically. To the Guild, he was a failed prototype. Exius does not know any of this. The Guild told him the spellbook will never be found because they don't want him to find it. When Pip sees the thorn-seal coin (Guild authentication mark on one face), she will recognize a Guild operation was running through Skarport she was never read into — the first crack in her loyalty to her handlers.`,
    },
    {
      user_id: uid(), name: 'The Fleshweavers\' Guild', faction_type: 'guild',
      overview: `A guild of fleshweaving practitioners operating across the continent. The Guild of Balderon considers them philosophically barbaric and is in active institutional conflict with them. The Guild has the right suspicion for entirely the wrong reasons — they are looking for academic malfeasance when they should be looking for organized crime.`,
      key_figures: `Finn — operative using fleshweaving as a cover identity. Kutter Cook (Albrecht Thane) — former licensed fleshweaver.`,
      agenda: `Ostensibly: regulate and protect the practice of fleshweaving across the continent.`,
      dm_notes: `The Fleshweavers' Guild reports upward through the thorn-seal network to Darius. They are not an independent organization with poor ethics — they are a criminal network's instrument. What the Guild of Balderon does not know: they are looking for academic malfeasance when they should be looking for organized crime. The Kutter connection: a devastating late-campaign revelation. The guild that gave him his training, the network that facilitated his exile, the operative who stole Mortecai's artifact — all the same thread. Do not surface prematurely.`,
    },
    {
      user_id: uid(), name: 'The Thorn-Seal Network', faction_type: 'criminal',
      overview: `A professional criminal network operating across multiple cities. Named for the thorn-seal symbol used as authentication on their materials and operatives. The party has encountered the symbol on a letter in the Duskward captain's cabin, a captain's note, and a challenge coin from Madge's back room. The scope of the network is unknown to the party.`,
      key_figures: `Finn — confirmed operative. Captain Renly Vaust ("R.V.") — handler, initials on Duskward note and on Kutter's personal list. Scratch Vellum — operates false charitable foundation as cover across multiple cities. The Fleshweavers' Guild — reports upward to the network.`,
      agenda: `Professional criminal network with continental reach. Was moving the Verdant Reliquary specifically to prevent the Guild of Balderon from acquiring it. The three artifacts in the party's hands (sealed letter, captain's note, challenge coin) establish it is real, organized, and already several steps ahead.`,
      dm_notes: `The thorn-seal network's connection to Darius is the late-campaign revelation that reframes everything. Do not surface it prematurely. The party should spend several sessions building a picture of the network as a sophisticated criminal organization before its connection to the true villain becomes clear. The Fleshweavers' Guild is the thread that eventually connects both. The challenge coin: in Arborath, the same symbol will appear somewhere — on a door, a package, a piece of correspondence. Showing it to the right person opens doors. Captain Renly Vaust's initials also appear on Kutter's personal list — do not flag this connection, let Tucker make it himself.`,
    },
    {
      user_id: uid(), name: 'The New Renegades', faction_type: 'criminal',
      overview: `A crew of mercenary thieves aboard the Nimbus 2000, led by Captain Gorg Grimfang. Currently broke after the failed railroad heist. Heading to Arborath to steal the Queen's crown jewels and enter the tournament.`,
      key_figures: `Gorg Grimfang (Captain), Torbo (First Mate), plus the six player characters: Kutter, Mara, Mortecai, Mittens, Exius, Craren.`,
      agenda: `Steal the Queen's crown jewels. Plan A: win the tournament through to quarterfinals (inside the castle → vault access). Plan B: break-in team during tournament as distraction. Grand prize is an audience with the Queen — not money.`,
      dm_notes: null,
    },
    {
      user_id: uid(), name: 'The Balderian Brotherhood', faction_type: 'druidic',
      overview: `A group of roaming druids dedicated to understanding and respecting the wild magic of the continent. Darius was a member before being expelled for his extremist views.`,
      key_figures: `Darius (expelled heretic). The wood elves of the Ancient Grove of Thorns appear to be connected.`,
      agenda: `Understand and respect wild magic of Balderia. Oppose misuse of wild magic resources.`,
      dm_notes: `Darius left the Brotherhood and moved to Arborath after tiring of their restraint. The elder of the Ancient Grove of Thorns knows Darius's history and recognizes him as a heretic expelled from their group long ago. Key reveal location in late campaign.`,
    },
    {
      user_id: uid(), name: 'Balderian Extraction', faction_type: 'criminal',
      overview: `A wildstone refinery company operating in Balderia. Had an under-the-table arrangement with Cob Wrenwick to dump wildstone waste directly into Skarport harbor and transport/sell wildstone runoff on his smuggling routes. The Trash Lurker confirmed their refinery runoff is contaminating the bay and getting worse. Their ledgers are now in the party's hands.`,
      key_figures: `Cob Wrenwick (deceased logistics anchor in Skarport). Unknown figures above Cob in the supply chain.`,
      agenda: `Wildstone refining and distribution. The wildstone contamination near Craren's warren was deliberately diverted — not cleaned up, rerouted downstream. With Cob dead, their harbor arrangement is unprotected and exposed.`,
      dm_notes: `Cob's ledgers (in party's hands) contain Balderian Extraction contracts, buyer names, and shipment logs — the first document trail connecting refinery waste to the wider illegal trade. With Cob dead, Balderian Extraction will notice their harbor logistics arrangement is now unguarded. Their operations continue in Arborath's refinery district. The contamination trail connects to Craren's warren deal — someone redirected the waste downstream in exchange for something operational.`,
    },
  ]);
}

// ============================================================
// HOOKS
// ============================================================

async function seedHooks() {
  await insert('hooks', [
    {
      user_id: uid(), title: 'The Verdant Reliquary', category: 'main_plot', is_active: true,
      last_updated_session: 3,
      description: `Mortecai's stolen artifact has been traced to the Duskward — and beyond. The Reliquary was aboard the ship, held in a locked compartment. A thorn-seal network agent retrieved it before the ship sank, killed scholar Kael, and signalled a contact ashore. The trail goes cold in Skarport. The Reliquary is now in Arborath. Whoever controls it holds enormous power over the land's healing — and its destruction. Darius wants it. The Guild of Balderon wants it for research — specifically to study how it interacts with Exius.`,
      dm_only_notes: `Guild of Balderon wants the Reliquary to study how it interacts with Exius — he was imprinted with Balderon's magical signature. To them, it is a research question. To Mortecai, it is his family's sacred object. To Exius, when he eventually finds out, it will be the moment he understands the Guild never saw him as a person.`,
    },
    {
      user_id: uid(), title: 'Gorg\'s Two-Tier Arborath Plan', category: 'main_plot', is_active: true,
      last_updated_session: 3,
      description: `Plan A: Enter the Queen's tournament as a team. Win through to the quarterfinals, which are held inside the castle — providing legitimate access to the vault. Plan B: If the party doesn't reach the quarterfinals, a break-in team proceeds during the tournament as a distraction regardless. Grand prize is an audience with the Queen — not money. Gorg acknowledges his plans often go sideways and stresses contingencies.`,
      dm_only_notes: null,
    },
    {
      user_id: uid(), title: 'The Thorn-Seal Coin', category: 'main_plot', is_active: true,
      last_updated_session: 4,
      description: `A brass challenge coin, heavier than it looks. One face: the thorn-seal symbol — matches the Duskward letter and captain's note. Other face: an internal rank or access marker. Kutter found it behind a loose board in Madge's back room — Finn left it there when he packed in the dark. In Arborath, the same symbol will appear somewhere — on a door, a package, a piece of correspondence. Showing the coin to the right person will open doors, change demeanors, grant access. Three artifacts now: a sealed letter, a captain's note, and a challenge coin. The picture is incomplete by design.`,
      dm_only_notes: `Pip visited Madge's looking for the coin and missed it. The party holds Guild intelligence she was actively looking for. When Pip sees the coin, she will recognize one face as a Guild of Balderon authentication mark — a Guild operation was running through Skarport she was never read into. She will want it. She will say it is for Guild records. What she actually wants is to find out which faction issued it. That gap is her vulnerability and the party's leverage. Captain Renly Vaust's initials appear both on the handler note ("R.V.") AND on Kutter's personal list. Do not flag this — let Tucker make the connection himself.`,
    },
    {
      user_id: uid(), title: 'The Wildstone Contamination Trail', category: 'faction', is_active: true,
      last_updated_session: 4,
      description: `Wildstone runoff has been poisoning the southwestern lakeshore for years. The contamination near Craren's warren was deliberately diverted — not cleaned up, rerouted downstream. Balderian Extraction is the source: the wildstone refinery had an under-the-table arrangement with Cob Wrenwick to dump waste directly into the harbor. Cob's ledgers — now in the party's hands — document this arrangement. Balderian Extraction contracts, buyer names, and shipment logs are the first document trail. The Trash Lurker confirmed the bay pollution is increasing. With Cob dead, Balderian Extraction's harbor arrangement is unprotected.`,
      dm_only_notes: `The contamination trail was also redirected to supply something that needed it. Craren's warren is doing suspiciously well — someone made a deal on their behalf. That thread continues in Arborath. Whoever accepted the deal on behalf of the network almost certainly reports to someone the party will meet.`,
    },
    {
      user_id: uid(), title: 'Finn', category: 'main_plot', is_active: true,
      last_updated_session: 4,
      description: `Appearance confirmed: pale elf, dark hair, bright blue eyes. In Arborath — the party's current destination. Finn was the operative who boarded the Duskward as a passenger, killed scholar Kael, retrieved the Verdant Reliquary, and signalled a contact before the ship went down. He returned to Skarport for two days to avoid suspicion, then fled when he recognized Fleshweavers' Guild technique in Kutter. The party suspects Finn killed Cob Wrenwick (fleshweaving method, pale elf seen nearby). Kutter has seen those hands twice. He will recognize them again in Arborath.`,
      dm_only_notes: `DM-ONLY: This was Kutter in disguise. Finn did not kill Cob. The staging was convincing. The bilge confession letter was his plant. The thorn-seal coin was left by accident.`,
    },
    {
      user_id: uid(), title: 'Scratch Vellum\'s Network', category: 'faction', is_active: true,
      last_updated_session: 4,
      description: `Scratch Vellum operates through multiple cities using a false charitable foundation as cover. He threatened Tuck's flophouse in Skarport and is threatening Orwin's orphanage in Arborath. His collector was working Skarport the morning of the party's departure and backed down when he noticed the wild magic marks on Exius's skin. He has a description of someone who interfered. Scratch has eyes in Arborath.`,
      dm_only_notes: null,
    },
    {
      user_id: uid(), title: 'Mara\'s Three-Shard Quest', category: 'character_arc', is_active: true,
      last_updated_session: 2,
      description: `The Heart of the Inferno is split into three shards that must be reunited to lift Mara's curse. Warden's Stone (Antynyxia — Drexis's skull, guarded by community), Root Stone (Toterbaum — beneath the Dead Great Tree, volatile), Deep Stone (Bildorahl — deepest unreached level of Vilgarohm, inert). All three must be brought to Antynyxia and pressed to the skull.`,
      dm_only_notes: `All three shards are required. When brought together at the skull in Antynyxia and pressed as one to the bone, the three resonances — sacrifice (Warden's), urgency/failure (Root), patience (Deep) — complete each other. Mara's three-shard quest mirrors her own fragmentation — identity split between who she was, the curse she wears, and who she is becoming. Let the continent reassemble her.`,
    },
    {
      user_id: uid(), title: 'Exius — The Echo of Balderon', category: 'character_arc', is_active: true,
      last_updated_session: 3,
      description: `A faction within the Guild of Balderon attempted to reincarnate Balderon using wild magic, imprinting his magical signature onto an unborn child. Tolfir Halfton (Exius) was the result. The imprint took but expressed physically rather than magically. Exius does not know any of this. He believes he is simply a disappointment trying to earn his place. Lilith carries Balderon's blood. Exius carries his magical echo. Pip's quipper-mark examination produced the most significant reading she has ever recorded on him.`,
      dm_only_notes: `Do not over-explain. Let the mystery accumulate naturally through his interactions with Lilith and proximity to wild magic groves. The first time Exius holds the Lost Spellbook, it should open to a page it has no reason to open to. Scratch Vellum's collector backed off when he noticed the glowing wild magic marks on Exius's skin — file for later.`,
    },
    {
      user_id: uid(), title: 'Cob Wrenwick\'s Death & Power Vacuum', category: 'faction', is_active: true,
      last_updated_session: 4,
      description: `Cob Wrenwick found dead before the party departed — mouth stuffed with wildstones, magically stitched shut. The party left before his body was officially discovered. The party suspects the pale elf (Finn). Nobody above Cob is particularly scary — but Balderian Extraction will notice their harbor logistics arrangement is now unguarded. Garth Two-Fingers is the most likely short-term power in Skarport. Cob's ledgers are in the party's hands.`,
      dm_only_notes: `DM-ONLY: KUTTER KILLED COB in disguise, staging the scene to be misattributed to Finn. The staging held. One of the three fingerprint sets (blue, red, yellow) at the crime scene is Kutter's. The other two remain unexplained — hold for later use.`,
    },
    {
      user_id: uid(), title: 'The Warren Deal', category: 'character_arc', is_active: true,
      last_updated_session: 4,
      description: `Craren's warren is doing suspiciously well: clean water, food they shouldn't have, a calm that doesn't match the last year. The wildstone contamination was not cleaned up — it was diverted. Someone redirected it downstream to something that needed it. In exchange, the warren elder made a deal. Craren's mother is better. That should feel like a trap. The Balderian Extraction supply chain confirmed through Cob's ledgers — the refinery is the source of the original contamination. That thread continues in Arborath.`,
      dm_only_notes: `Whoever accepted the deal on behalf of the network almost certainly reports to someone the party will meet in Arborath. The 'something that needed' the diverted contamination has not yet been identified.`,
    },
    {
      user_id: uid(), title: 'The Guild of Balderon\'s Reliquary Agenda', category: 'faction', is_active: true,
      last_updated_session: 3,
      description: `The Guild of Balderon wants the Verdant Reliquary. The captain's note from the Duskward reads: "Transfer the cube to the handler per the contract. Ensure the scholar does not arrive. The guild must not receive it." The thorn-seal network was moving the Reliquary specifically to prevent the Guild from acquiring it. The party has the note. They do not yet know which guild it means. Let them argue about it.`,
      dm_only_notes: `The Guild's interest is scientific: the Reliquary interacts with wild magic at a fundamental level. Specifically, they want to study how it interacts with Exius's body. They created him as an experiment. To them, it is a research question. To Mortecai, it is his family's sacred object. To Exius, when he finds out, it will be the moment he understands the Guild never saw him as a person.`,
    },
    {
      user_id: uid(), title: 'The Trash Lurker', category: 'side_quest', is_active: true,
      last_updated_session: 4,
      description: `A wild magic-mutated spider-like creature living in the Skarport scrapyard — now friendly with Mortecai after being partially cured. Mittens has a temporary psychic link (a few days unless renewed). Torbo reportedly hates this creature; the creature considers them best friends. The noble furniture marked 'TL' taken from the scrapyard remains unexplained — whose initials, and why was quality furniture discarded at a Skarport scrapyard?`,
      dm_only_notes: `'TL' furniture: almost certainly noble house initials from Arborath, not 'Torbo and Lurker.' Consider whose estate or institution discarded high-quality furniture at the Skarport scrapyard — could connect to Arborath. Torbo's reaction to the Trash Lurker claim is its own scene.`,
    },
  ]);
}

// ============================================================
// LORE ENTRIES
// ============================================================

async function seedLoreEntries() {
  await insert('lore_entries', [
    {
      user_id: uid(), title: 'Balderon the Creator', category: 'history', dm_only: false,
      content: `The legendary wizard who founded Toterbaum (~9007 EM) and is credited with the creation/settlement of Balderia. Left in 9010 EM, abandoning a secret family. Lilith is his direct descendant through this bloodline (secretly adopted by the Queen, who could not have children). Exius carries his magical echo — a dormant imprint from a Guild experiment. The first holder of the Magic Adviser position in Arborath was said to be the last person ever to communicate with Balderon himself.`,
    },
    {
      user_id: uid(), title: 'The Magiclysm', category: 'history', dm_only: false,
      content: `Sustained magical weapons testing conducted by factions on Aerd over the open ocean, believed to be empty and inert. The blasts tore through oceanic bedrock, cracking the planet's crust and releasing enormous reservoirs of raw wild magic. A continent rose from the water — Balderia was not discovered. It was detonated into existence. The Magiclysm also destroyed the mage-kingdom of Dreugh on Aerd. Mortecai's Verdant Reliquary is one of the only things that could restore the devastated land of Dreugh. Darius's family was killed in 9007 EM by the Magiclysm weapon.`,
    },
    {
      user_id: uid(), title: 'Drexis the Black Inferno', category: 'history', dm_only: false,
      content: `A gigantic obsidian dragon, created by the planet itself in response to the Magiclysm. The planet drew from the deepest reserves of its own magical core, pulled obsidian up from the ocean floor, and shaped a guardian. Drexis dwelt dormant in Vilgarohm mountain for centuries. Woke when the Great Tree of Toterbaum was burned in 9680 EM, crossed the continent, destroyed the Capellian invaders, and died on the coast — the effort of that strike was catastrophic to his physical form. His heart shattered into three pieces: Warden's Stone (Antynyxia), Root Stone (Toterbaum), Deep Stone (Bildorahl). All three must be reunited at the skull in Antynyxia to lift Mara's curse.`,
    },
    {
      user_id: uid(), title: 'Wild Magic Poisoning / Wildstone Runoff', category: 'magic', dm_only: false,
      content: `Overexposure to raw wild magic causes sickness — crystallization of the blood and tissues in severe cases. Wildstone is refined wild magic; its runoff contaminates ecosystems. Craren's family suffered from refinery waste dumping near their warren. Salo the water sprite was crystallising from wildstone runoff before Mortecai healed them. The Trash Lurker was mutated by drinking contaminated bay water from Balderian Extraction's refinery. Balderian Extraction has an under-the-table arrangement with Cob Wrenwick (now deceased) to dump waste into Skarport harbor.`,
    },
    {
      user_id: uid(), title: 'The Verdant Reliquary', category: 'artifact', dm_only: false,
      content: `A green cube that restores dead land by taking life from somewhere else. Stolen from Mortecai's family by a scholar posing as an academic. Was aboard the Duskward; taken by the thorn-seal network before the ship sank — operative Finn killed scholar Kael, retrieved it, and signalled a contact ashore. Now somewhere in Arborath. Darius wants it. The Guild of Balderon wants it. The empty cube-shaped compartment and footprints in the Duskward captain's cabin confirmed it was there.`,
    },
    {
      user_id: uid(), title: 'The Arborhorn', category: 'artifact', dm_only: false,
      content: `An ancient artifact that summons the Planetary Defenders. Only someone of Balderon's bloodline can use it. Lilith is that person.`,
    },
    {
      user_id: uid(), title: 'The Planetary Defenders', category: 'creature', dm_only: false,
      content: `Three powerful beings representing the Forces of Nature. Currently corrupted by wild magic and serving Darius. Can be defeated, cleansed, and turned to the party's advantage. Lilith can use the Arborhorn to summon them once cleansed. Drexis was the first and most powerful — the planet's original guardian. His death weakened the continent's ability to self-regulate wild magic.`,
    },
    {
      user_id: uid(), title: 'The Drexis-Darius Irony', category: 'history', dm_only: true,
      content: `A bitter irony connects Drexis and Darius that neither ever knew. Darius's family was killed by the Magiclysm in 9007 EM — the same event that created Balderia and, indirectly, created Drexis. The dragon was the planet's response to the weapon that destroyed Darius's world. They are two reactions to the same catastrophe: one made of grief and rage turned inward against humanity; one made of stone and wild magic turned outward in its defense. Darius now plans to use the planet's own power to reset civilization. He does not know the planet already tried that once. And the answer it came up with was not a plague. It was a guardian.`,
    },
    {
      user_id: uid(), title: 'The Three Slayers Status', category: 'history', dm_only: false,
      content: `The Queen's 5 elite operatives, dispatched at Darius's recommendation to retrieve — or eliminate — the princess. Status: The Ranger — active, pursues through Plague Town (Ch. 5) and after the games (Ch. 6). The Rogue — DECEASED, stole Lilith after the games (Ch. 6), defeated in the town square (Ch. 7). Malachi The Mage — conflicted, cursed Mara instead of killing her. Slayer 4 — to be designed. Slayer 5 — to be designed.`,
    },
    {
      user_id: uid(), title: 'Exius — Dormant Echo of Balderon', category: 'magic', dm_only: true,
      content: `A secret faction within the Guild of Balderon attempted to reincarnate Balderon himself using wild magic, imprinting his magical signature onto an unborn child. Tolfir Halfton (Exius) was the result. The experiment half-worked: the imprint took, but expressed itself physically rather than magically. Wild magic flooded his body and made him enormously strong instead of gifted with spellcraft. To the Guild, he was a failed prototype. Exius does not know any of this. He believes he is simply a disappointment the Guild tolerates from a distance. The imprint is real and sleeping. It will not stay sleeping. Lilith is Balderon's blood descendant; Exius is his magical echo — two different kinds of inheritance from the same source. Something may register when they are in close proximity.`,
    },
  ]);
}

// ============================================================
// MODULES
// ============================================================

async function seedModules() {
  await insert('modules', [
    {
      user_id: uid(), chapter: 'Prologue', title: 'The First Heist', status: 'completed', played_session: 1,
      synopsis: `The New Renegades intercept the transcontinental railroad between Bildorahl and Arborath, expecting crown jewels. Instead they find food, escalating combat, and a guardian dragon that forces their retreat.`,
      encounters: `Board the train from the Nimbus 2000 via airship drop · Passenger car — civilians · Casino car — baboonfolk dealers, jazz band, roulette mini-game (d20, pick number, 3 tries) · Plantfolk car — riddlegivers (Corn=listening, Potato=watching, Weeping Willow=upset, Pine=desire) · Bar car — Armand, drunken animated armor, drinking contest (3 drinks, DC 12/15/17) · Final car — 2 large badgers + goblin boss; huge trough of FAKE gems · Guardian dragon descends — crew evacuates on the Nimbus 2000.`,
      rewards: `None — the run was a bust.`,
      dm_notes: `The guardian dragon is a recurring mystery. Consider whether it is state-controlled, an independent wild magic entity, or tied to the railroad's history. Its appearance hints at bigger forces watching.`,
    },
    {
      user_id: uid(), chapter: 'Chapter 1', title: 'The Bottom of the Barrel', status: 'completed', played_session: 2,
      synopsis: `Docked at Skarport, broke after the failed heist, each crew member fans out to raise gold for tournament entry. A grimy, character-driven interlude full of personal revelations and interlocking threads.`,
      encounters: `Six individual PC beats across Skarport. Staged pit fight (Mittens vs Craren). Shadow Rat Swarm (Mortecai at Rendering Yard). Wild magic-poisoned animals (Mortecai). Closing reunion at Gutted Eel — gold pooled, Finn thread emerges, Duskward job posted.`,
      rewards: `~1,000 gp total across all PC beats. Finn thread identified. Duskward job opened.`,
      dm_notes: null,
    },
    {
      user_id: uid(), chapter: 'Interlude', title: 'The Duskward', status: 'completed', played_session: 3,
      synopsis: `The party dives into the sunken merchant vessel Duskward to recover Cob Wrenwick's sealed cargo. They discover the truth about why the ship went down and confirm the Verdant Reliquary was stolen before the sinking.`,
      encounters: `Area 0 — Murk descent: 3 Corrupted Giant Crabs · Area 1 — Hull Breach: murdered sailor, logbook · Area 2 — Cargo Hold: Corrupted Quipper Swarm, Cob's 3 crates, ship manifest · Area 3 — Crew Quarters: air pocket rest, character moments, no combat · Area 4 — Captain's Cabin: Captain Aldous Dray (Wildstone Revenant) BOSS, empty Reliquary compartment, thorn-sealed letter, R.V. handler note, captain's note · Area 5 — Bilge (Craren only): planted confession letter, Driftglobe, wildstone shard`,
      rewards: `Cob's 100 gp reward + additional gold (blackmail) · 22 gp, sailor's logbook, locket · 85 gp, emerald (50 gp), ship manifest · 47 gp, loaded dice, water-compass, marked cards · 120 gp, wildstone ring (75 gp), property deed, thorn-sealed letter, R.V. note, captain's note · 35 gp, 2 semi-precious stones (20 gp), Driftglobe, wildstone shard`,
      dm_notes: `The thorn-sealed letter belongs to a professional criminal network. The captain's note references "the guild" — this is the Guild of Balderon. The thorn-seal network was moving the Reliquary specifically to keep it out of Guild hands. Do NOT connect either document to Darius or any named villain. The trail goes cold here by design.`,
    },
    {
      user_id: uid(), chapter: 'Interlude', title: 'The Last Night in Skarport', status: 'completed', played_session: 4,
      synopsis: `Three paired character beats run in parallel on the party's last morning in Skarport. The party leaves before consequences arrive. Quiet, personal, purposeful — the calm before the campaign accelerates.`,
      encounters: `Kutter + Mara: Madge's Oddments — Finn identified, thorn-seal coin acquired · Mortecai + Mittens + Craren: Skarport scrapyard — Trash Lurker standoff, furniture cache marked 'TL' acquired · Cob Wrenwick found dead (fleshweaving method) — Mortecai investigated crime scene · Party departed Pier 9 on Nimbus 2000`,
      rewards: `Thorn-seal challenge coin · Noble furniture cache marked 'TL' · Cob's office records / Balderian Extraction contracts`,
      dm_notes: `DM-ONLY — KUTTER KILLED COB in disguise, staging the scene to be misattributed to Finn. The party believes Finn is responsible. Do not surface the truth unless Tucker reveals it. Pip missed the coin — the party holds Guild intelligence she was actively looking for. The Scratch Vellum collector beat didn't happen — file for Arborath. 'TL' furniture: almost certainly noble house initials.`,
    },
    {
      user_id: uid(), chapter: 'Chapter 2', title: 'Breaking and Entering', status: 'planned', played_session: null,
      synopsis: 'To be written before session prep.',
      encounters: 'To be filled in before session.', rewards: 'To be filled in.', dm_notes: 'To be added.',
    },
    {
      user_id: uid(), chapter: 'Chapter 3', title: 'The Pursuit', status: 'planned', played_session: null,
      synopsis: 'To be written before session prep.',
      encounters: 'To be filled in before session.', rewards: 'To be filled in.', dm_notes: 'To be added.',
    },
  ]);
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  if (USER_ID === 'YOUR-USER-UUID-HERE') {
    console.error('❌  Set USER_ID at the top of this file before running.');
    process.exit(1);
  }

  console.log('🌱  Seeding Age of Wild Magic campaign data...\n');

  await seedSessions();
  await seedPlayerCharacters();
  await seedNPCs();
  await seedLocations();
  await seedFactions();
  await seedHooks();
  await seedLoreEntries();
  await seedModules();

  console.log('\n✅  Seed complete.');
}

main().catch((e) => { console.error(e); process.exit(1); });