// The improv kit: names by culture and a quick NPC (role, voice, one trait) for
// when the players talk to someone who wasn't in the notes. Plain data and
// pure functions with an injectable rng, so results can be tested.

export type Rng = () => number;

const pick = <T,>(list: readonly T[], rng: Rng): T => list[Math.floor(rng() * list.length) % list.length];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

interface Culture {
  label: string;
  /** Given names are built from a start, sometimes a middle, and an end. */
  starts: string[];
  middles: string[];
  ends: string[];
  /** Family names, built from two halves; none for cultures that don't use them. */
  family?: [string[], string[]];
}

export const CULTURES = {
  human: {
    label: 'Human',
    starts: ['al', 'bren', 'cor', 'dar', 'el', 'gar', 'hal', 'is', 'jor', 'ka', 'lin', 'mar', 'ned', 'os', 'per', 'ros', 'sel', 'tam', 'wil', 'yv'],
    middles: ['a', 'e', 'i', 'o', 'an', 'ri', 'el'],
    ends: ['ric', 'wen', 'a', 'on', 'eth', 'is', 'ard', 'ine', 'win', 'ett', 'mund', 'ra'],
    family: [['ash', 'black', 'brook', 'cold', 'fair', 'green', 'hart', 'mill', 'red', 'stone', 'thorn', 'west'], ['ford', 'well', 'wood', 'ley', 'ton', 'more', 'gate', 'field', 'ridge', 'water']],
  },
  dwarf: {
    label: 'Dwarf',
    starts: ['bar', 'dur', 'gim', 'har', 'kil', 'mor', 'nor', 'rur', 'thar', 'brom', 'dag', 'orn'],
    middles: ['', '', 'a', 'i', 'u'],
    ends: ['ak', 'din', 'grim', 'li', 'rek', 'run', 'dra', 'gath', 'mir', 'nor', 'unn'],
    family: [['anvil', 'axe', 'coal', 'deep', 'flint', 'forge', 'gold', 'iron', 'oak', 'rock'], ['beard', 'fist', 'hammer', 'heart', 'shield', 'delver', 'brow', 'mantle', 'born']],
  },
  elf: {
    label: 'Elf',
    starts: ['ae', 'cael', 'el', 'fae', 'gal', 'ith', 'lae', 'mir', 'nae', 'syl', 'thal', 'vael'],
    middles: ['a', 'e', 'i', 'ia', 'ae', 'ri', 'le'],
    ends: ['dir', 'wyn', 'thas', 'riel', 'lis', 'nor', 'sar', 'vyre', 'ion', 'ael', 'eth'],
    family: [['moon', 'star', 'silver', 'dawn', 'leaf', 'mist', 'river', 'willow', 'amber'], ['whisper', 'song', 'glade', 'bough', 'runner', 'veil', 'shade', 'bloom']],
  },
  halfling: {
    label: 'Halfling',
    starts: ['ben', 'cal', 'dod', 'fen', 'lil', 'mer', 'pip', 'pom', 'ros', 'tam', 'wil', 'bree'],
    middles: ['', '', 'a', 'i', 'o'],
    ends: ['by', 'kin', 'lo', 'ny', 'ric', 'sy', 'wick', 'ella', 'ot', 'ie'],
    family: [['apple', 'barley', 'brandy', 'butter', 'goodbarrel', 'hill', 'honey', 'tea', 'under', 'warm'], ['foot', 'bottle', 'bough', 'leaf', 'hearth', 'toes', 'kettle', 'burrow']],
  },
  gnome: {
    label: 'Gnome',
    starts: ['bim', 'dab', 'fiz', 'gim', 'nim', 'orl', 'pock', 'quill', 'sni', 'tink', 'wren', 'zan'],
    middles: ['', 'a', 'el', 'i', 'o'],
    ends: ['ble', 'bo', 'dle', 'ix', 'kin', 'nik', 'pip', 'sy', 'wick', 'zle'],
    family: [['cog', 'fizz', 'gear', 'glimmer', 'nack', 'puzzle', 'spark', 'tinker', 'whistle'], ['bottom', 'button', 'nozzle', 'sprocket', 'wobble', 'whirr', 'spindle']],
  },
  orc: {
    label: 'Orc',
    starts: ['bru', 'dra', 'gha', 'gro', 'kru', 'mog', 'ra', 'sha', 'thu', 'ug', 'vor', 'zug'],
    middles: ['', '', 'r', 'g', 'k'],
    ends: ['ak', 'ash', 'dul', 'gar', 'kk', 'mak', 'nok', 'rag', 'tha', 'uk', 'zog'],
  },
  tiefling: {
    label: 'Tiefling',
    starts: ['ak', 'ba', 'da', 'ka', 'lev', 'me', 'nem', 'ori', 'sa', 'ver', 'za', 'ul'],
    middles: ['', 'e', 'i', 'mo', 'ra', 'ze'],
    ends: ['ael', 'ias', 'kos', 'meth', 'nia', 'phine', 'ros', 'thra', 'xis', 'zar'],
  },
  dragonborn: {
    label: 'Dragonborn',
    starts: ['ar', 'bal', 'dor', 'ghe', 'kav', 'med', 'nar', 'pan', 'sar', 'tor', 'vrak', 'zor'],
    middles: ['', 'a', 'e', 'ja', 'sh'],
    ends: ['ash', 'ax', 'ghar', 'jhan', 'kor', 'nar', 'rash', 'thyr', 'vos', 'zith'],
    family: [['ash', 'cinder', 'ember', 'flame', 'iron', 'scale', 'storm', 'thunder'], ['clan', 'claw', 'crest', 'fang', 'hide', 'horn', 'wing']],
  },
} satisfies Record<string, Culture>;

export type CultureKey = keyof typeof CULTURES;

/** A name from a culture: a given name, and a family name where the culture uses one. */
export function makeName(culture: CultureKey, rng: Rng = Math.random): string {
  const c: Culture = CULTURES[culture];
  const given = cap(pick(c.starts, rng) + (rng() < 0.4 ? pick(c.middles, rng) : '') + pick(c.ends, rng));
  if (!c.family) return given;
  return `${given} ${cap(pick(c.family[0], rng) + pick(c.family[1], rng))}`;
}

export const ROLES = [
  'innkeeper', 'guard', 'merchant', 'priest', 'farmer', 'smith', 'sailor', 'scholar', 'thief', 'noble',
  'beggar', 'hunter', 'herbalist', 'courier', 'miner', 'bard', 'ferryman', 'cook', 'gravedigger', 'tax collector',
] as const;

/** How they sound: enough to start talking in character. */
export const VOICES = [
  'low and gravelly, never in a hurry', 'quick and breathless, trails off mid-sentence', 'sing-song; every statement sounds like a question',
  'clipped and formal, like a soldier reporting', 'whispers, as if someone might be listening', 'booming, and laughs at their own jokes',
  'nasal and precise; corrects your grammar', 'a slow drawl that chews on every word', 'warm and fussing, like a worried parent',
  'flat and bored, sighs before answering', 'a rasping croak, clears the throat a lot', 'stammers when nervous, which is often',
  'over-polite; uses everyone’s full title', 'hums between sentences', 'talks about themself in the third person',
  'a tiny, high voice that doesn’t match their size', 'lilting and poetic, fond of a metaphor', 'gruff; answers in as few words as possible',
  'a fast-talking salesperson’s patter', 'a wheezy laugh after every sentence',
] as const;

/** One thing to remember them by. */
export const TRAITS = [
  'owes money to the wrong people', 'collects buttons', 'is terrified of birds', 'lies about small things for no reason',
  'is fiercely loyal to a mentor who died', 'is always eating something', 'secretly can’t read', 'wants out of this town',
  'is devout but quietly doubting', 'keeps a written list of slights', 'is missing two fingers', 'smells faintly of the sea',
  'won’t make eye contact', 'names their tools and talks to them', 'loses at cards and keeps playing', 'misquotes scripture with confidence',
  'is hiding a runaway sibling', 'trusts strangers far too easily', 'bets on everything', 'polishes a lucky coin when thinking',
  'claims to hear the dead', 'is freshly heartbroken', 'knows everyone’s business', 'is plotting to marry rich',
] as const;

export interface QuickNpc { name: string; role: string; voice: string; trait: string }

/** Someone to play right now: a name, what they do, how they sound and one trait. */
export function quickNpc(culture: CultureKey, rng: Rng = Math.random): QuickNpc {
  return { name: makeName(culture, rng), role: pick(ROLES, rng), voice: pick(VOICES, rng), trait: pick(TRAITS, rng) };
}

/** How a quick NPC reads as an idea in the Inbox, to flesh out later. */
export const npcIdeaText = (n: QuickNpc) =>
  `${n.name}, ${n.role}. Voice: ${n.voice}. Trait: ${n.trait}.`;
