// The champion's reader: turns what the player wrote ("likes to steal and manipulate", "a girl from another world") into
// things the champion DOES. A small rule-based language model that runs here, with no network:
//   * the text is split into clauses; each clause is read for what it is about (a behaviour or a backstory), how strongly
//     ("always", "loves to" > "likes to" > "sometimes") and whether it is denied ("never steals", "hates fighting")
//   * behaviours are verbs the champion carries out on other people (ai/behaviours.js): steal, manipulate, brawl, charity,
//     preach, teach, gossip, court, explore
//   * backstories are who the champion is: an outsider from another world, an amnesiac, an exile, a noble, a veteran...
//     they colour the whole day (ai/behaviours.js BACKSTORIES) and set starting stats
//   * name and sex are picked up too ("a girl called Mika")
// parseIntent(text) -> { behaviours: [{id, w}], backstory: [id], name, gender, summary: [phrases], stats }
export const BEHAVIOURS = {
  steal: { label: 'steals from others', words: ['steal', 'stole', 'thie', 'rob', 'pickpocket', 'swindl', 'burgl', 'loot', 'plunder', 'pilfer', 'klepto', 'bandit', 'lift valuables', 'sticky finger', 'take what', 'cutpurse'] },
  manipulate: { label: 'manipulates people', words: ['manipulat', 'deceiv', 'decept', 'liar', 'lie ', 'lies', 'lying', 'scheme', 'scheming', 'cunning', 'trick', 'persuad', 'gaslight', 'mislead', 'backstab', 'puppet', 'plot ', 'plots', 'plotting', 'machiavell', 'silver tongue', 'con ', 'conman', 'con artist', 'sly', 'devious', 'two-faced', 'charm people', 'sweet-talk', 'sweet talk', 'wrap people'] },
  brawl: { label: 'picks fights', words: ['fight', 'brawl', 'punch', 'duel', 'bully', 'bullies', 'attack', 'violent', 'beat up', 'beats up', 'thug', 'hit people', 'quarrel', 'spar'] },
  charity: { label: 'helps and gives to others', words: ['help', 'donate', 'charit', 'generous', 'give to the poor', 'share food', 'feed the', 'feeds the', 'kind to', 'selfless', 'caretaker', 'cares for', 'care for', 'nurse', 'heal', 'tends'] },
  preach: { label: 'preaches and converts', words: ['preach', 'convert', 'sermon', 'proselyt', 'spread the faith', 'missionar', 'evangel', 'testif', 'spread the word'] },
  teach: { label: 'teaches others', words: ['teach', 'educat', 'mentor', 'tutor', 'share knowledge', 'lectur', 'instruct', 'professor', 'explain things', 'inventor', 'inventions'] },
  gossip: { label: 'spreads gossip', words: ['gossip', 'rumou', 'rumor', 'spy', 'spies', 'eavesdrop', 'snoop', 'busybody', 'tattle', 'nosy', 'nosey'] },
  court: { label: 'romances people', words: ['flirt', 'seduc', 'romanc', 'court ', 'courts', 'courting', 'lover', 'heartbreak', 'charmer', 'womanis', 'lothario'] },
  explore: { label: 'roams and explores', words: ['explor', 'wander', 'adventur', 'travel', 'nomad', 'roam', 'curious about the world', 'discover'] }
};

// Who the champion is. `stats` are applied once when the text is read; `routine` is how it shows in the day.
export const BACKSTORIES = {
  outsider: {
    label: 'a stranger from another world',
    words: ['another world', 'other world', 'otherworld', 'another planet', 'another dimension', 'another universe', 'another realm', 'different world', 'isekai', 'transported', 'transmigrat', 'summoned', 'reincarnat', 'from earth', 'from the future', 'from the past', 'fell from the sky', 'from the stars', 'foreigner', 'stranger in', 'not from here', 'alien', 'portal', 'time traveller', 'time traveler', 'strange land', 'other dimension'],
    stats: { personality: { openness: 0.3, piety: -0.25, neuroticism: 0.1 }, proficiencies: { science: 25 } }
  },
  amnesiac: { label: 'someone who lost their memory', words: ['amnesia', 'amnesiac', 'cannot remember', "can't remember", 'forgot who', 'no memory', 'lost memory', 'lost their memory', 'lost her memory', 'lost his memory'], stats: { personality: { openness: 0.15, neuroticism: 0.2 } } },
  exile: { label: 'an exile', words: ['exile', 'banish', 'outcast', 'fugitive', 'runaway', 'run away', 'outlaw', 'wanted', 'pariah', 'disgraced'], stats: { personality: { agreeableness: -0.1, extraversion: -0.2 } } },
  noble: { label: 'of noble blood', words: ['noble', 'aristocrat', 'princess', 'prince', 'royal', 'heir', 'highborn', 'high-born', 'lady of', 'lord of', 'spoiled', 'blue blood'], stats: { proficiencies: { statesmanship: 20 } } },
  veteran: { label: 'a battle-scarred veteran', words: ['veteran', 'ex-soldier', 'former soldier', 'mercenary', 'battle-scarred', 'survivor of war', 'war hero', 'old soldier'], stats: { proficiencies: { warfare: 25 }, personality: { neuroticism: 0.1 } } },
  orphan: { label: 'a street orphan', words: ['orphan', 'street urchin', 'raised alone', 'grew up alone', 'street kid', 'foundling'], stats: { personality: { agreeableness: -0.05, conscientiousness: 0.1 } } }
};

const NEGATE = /\b(not|never|doesn'?t|does not|won'?t|will not|hates?|avoids?|refuses|can'?t|cannot|dislikes?|no|without|despises?|abhors?|against)\b/;
const STRONG = /\b(always|loves?|adores?|obsess\w*|constantly|addict\w*|can'?t stop|compulsive\w*|incurabl\w*|master|expert|born)\b/;
const WEAK = /\b(sometimes|occasionally|a little|slightly|rarely|barely|now and then)\b/;
const MEDIUM = /\b(likes?|enjoys?|tends? to|prone|inclined|fond|good at|skilled)\b/;

const MALE = /\b(boy|man|male|he|his|him|king|prince|lord|gentleman|father|brother|son|husband|sir|guy|dude)\b/;
const FEMALE = /\b(girl|woman|female|she|her|hers|queen|princess|lady|mother|sister|daughter|wife|maiden|madam)\b/;

function strengthOf(clause, at) {
  // the clause before the match is what modifies it
  const before = clause.slice(0, at + 12);
  if (STRONG.test(before)) return 1;
  if (WEAK.test(before)) return 0.35;
  if (MEDIUM.test(before)) return 0.7;
  return 0.65;
}

export function parseIntent(text) {
  const out = { behaviours: [], backstory: [], name: null, gender: null, summary: [], stats: { personality: {}, proficiencies: {} } };
  const raw = String(text || '').slice(0, 600);
  const lower = ` ${raw.toLowerCase()} `;
  const clauses = lower.split(/[.;!?\n]+|,| but | and then | while | yet /).map(c => ` ${c.trim()} `).filter(c => c.trim());
  const found = new Map();
  const add = (id, w, neg) => {
    const cur = found.get(id) || { w: 0, neg: false };
    if (neg) { cur.neg = true; cur.w = 0; } else if (!cur.neg) cur.w = Math.max(cur.w, w);
    found.set(id, cur);
  };
  for (const clause of clauses) {
    // "steal and manipulate": one verb phrase can carry several behaviours, so "and" is NOT split above
    for (const [id, b] of Object.entries(BEHAVIOURS)) {
      for (const w of b.words) {
        const at = clause.indexOf(w.length <= 3 ? ` ${w}` : w);
        if (at < 0) continue;
        const neg = NEGATE.test(clause.slice(0, at + 1));
        add(id, strengthOf(clause, at), neg);
        break;
      }
    }
    for (const [id, b] of Object.entries(BACKSTORIES)) {
      for (const w of b.words) {
        const at = clause.indexOf(w);
        if (at < 0) continue;
        if (!NEGATE.test(clause.slice(0, at + 1)) || id === 'outsider') add(`story:${id}`, 1, false);
        break;
      }
    }
  }
  for (const [id, f] of found) {
    if (f.neg || f.w <= 0) continue;
    if (id.startsWith('story:')) out.backstory.push(id.slice(6));
    else out.behaviours.push({ id, w: Math.round(f.w * 100) / 100 });
  }
  // sex and name
  const f = FEMALE.test(lower), m = MALE.test(lower);
  if (f && !m) out.gender = 'Female'; else if (m && !f) out.gender = 'Male';
  const named = /\b(?:named|called|name is|known as)\s+([a-z][a-z'-]{1,15})/.exec(lower);
  if (named) out.name = named[1][0].toUpperCase() + named[1].slice(1);
  // starting stats from backstories
  for (const s of out.backstory) {
    const st = BACKSTORIES[s].stats || {};
    for (const [k, d] of Object.entries(st.personality || {})) out.stats.personality[k] = (out.stats.personality[k] || 0) + d;
    for (const [k, d] of Object.entries(st.proficiencies || {})) out.stats.proficiencies[k] = (out.stats.proficiencies[k] || 0) + d;
  }
  // behaviours colour the numbers too
  const has = id => out.behaviours.find(b => b.id === id);
  const bump = (group, k, d) => { out.stats[group][k] = (out.stats[group][k] || 0) + d; };
  if (has('steal')) { bump('personality', 'agreeableness', -0.2); bump('personality', 'conscientiousness', -0.1); }
  if (has('manipulate')) { bump('personality', 'agreeableness', -0.2); bump('personality', 'extraversion', 0.1); bump('proficiencies', 'statesmanship', 15); }
  if (has('brawl')) { bump('personality', 'agreeableness', -0.25); bump('proficiencies', 'warfare', 20); }
  if (has('charity')) bump('personality', 'agreeableness', 0.25);
  if (has('preach')) { bump('personality', 'piety', 0.2); bump('proficiencies', 'mysticism', 15); }
  if (has('teach')) bump('proficiencies', 'science', 15);
  if (has('explore')) bump('personality', 'openness', 0.2);
  out.summary = [
    ...out.behaviours.map(b => `${BEHAVIOURS[b.id].label}${b.w >= 0.95 ? ' (compulsively)' : b.w <= 0.4 ? ' (now and then)' : ''}`),
    ...out.backstory.map(s => BACKSTORIES[s].label)
  ];
  return out;
}
