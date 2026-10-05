// Pixel-art parts for creatures. Every creature sprite is a combination of one variant of each part,
// chosen by the creature's body-plan genes (see life/genome.js PART_COUNTS).
//
// Parts are drawn as the LEFT HALF only (8 columns) and mirrored, so creatures are symmetric; tails are
// the exception and are drawn on the right.
//
// Legend: . empty   o outline   b base colour   l light   s secondary colour
//         e pupil   w eye white   h horn / bone   k dark accent (nose, claws, hooves)

// ---- heads: 8 rows each, placed with the top row at y = 1 ----
export const HEADS = [
  // 0 round
  ['........', '..oooooo', '.obbbbbb', 'obbbbbbb', 'obwebbbb', 'obbbbbbb', '.obbbbbk', '..oooooo'],
  // 1 snout
  ['........', '..oooooo', '.obbbbbb', 'obwebbbb', 'obbbbbbb', '.obssssk', '.obssssk', '..oooooo'],
  // 2 beak
  ['........', '..oooooo', '.obbbbbb', 'obwebbbb', 'obbbbbbb', '.obbbbhh', '..oobbhh', '....oooo'],
  // 3 wide (toad-like), eyes high on the sides
  ['........', '........', '.ooooooo', 'owebbbbb', 'obbbbbbb', 'obbbbbbb', 'obsssssk', '.ooooooo'],
  // 4 tall
  ['...ooooo', '..obbbbb', '.obbbbbb', '.obwebbb', '.obbbbbb', '.obbbbbb', '..obbbbk', '...ooooo'],
  // 5 cyclops
  ['........', '..oooooo', '.obbbbbb', 'obbbbbwe', 'obbbbbwe', 'obbbbbbb', '.obbbbbk', '..oooooo'],
  // 6 human face: hair (secondary colour) over a skin-coloured face, eyes, nose and mouth
  ['...sssss', '..ssssss', '..sbbbbb', '..obwebb', '..obbbbb', '..obbbbl', '...obbkk', '....oooo'],
  // 7 feline beastfolk: a light muzzle with a dark nose
  ['........', '..oooooo', '.obbbbbb', 'obwebbbb', 'obbbbbbb', 'obbbllll', '.obblllk', '..oooooo'],
  // 8 dragon / reptile: a long snout with teeth
  ['........', '...ooooo', '..obbbbb', '.obwebbb', 'obbbbbbb', 'obsssssk', '.ohbhbhb', '..oooooo'],
  // 9 raptor: big eyes and a hooked beak
  ['..oooooo', '.obbbbbb', 'owwebbbb', 'obwebbbb', 'obbbbbhh', '.obbbbhh', '..oobbbh', '....oooh'],
  // 10 fish: a round eye and gill stripes
  ['........', '...ooooo', '..obbbbb', '.obwwbbb', '.obebbbb', '.obbbbss', '..obbbss', '...ooooo'],
  // 11 elven face: long hair framing a narrow face
  ['..ssssss', '.sssssss', '.ssbbbbb', '.sobwebb', '.sobbbbb', '.s.obbbb', '.s..obbk', '.....ooo']
];

// ---- bodies: 8 rows each, placed with the top row at y = 8 ----
export const BODIES = [
  // 0 round
  ['...ooooo', '..obbbbb', '.obbbbbb', 'obbbbsss', 'obbbbsss', 'obbbbsss', '.obbbbbb', '..oooooo'],
  // 1 slim torso
  ['....oooo', '...obbbb', '...obbbb', '..obbbbb', '..obbbbs', '..obbbbs', '..obbbbb', '...ooooo'],
  // 2 stocky
  ['..oooooo', '.obbbbbb', 'obbbbbbb', 'obbbbbbb', 'obbbssss', 'obbbssss', '.obbbbbb', '..oooooo'],
  // 3 low and long
  ['........', '........', '..oooooo', '.obbbbbb', 'obbbbbss', 'obbbbbss', '.obbbbbb', '..oooooo'],
  // 4 blob
  ['..oooooo', '.obbbbbb', 'obbbbbbb', 'obbbbbbb', 'obbbbbbb', 'obbbbbbb', '.obbbbbb', '..oooooo'],
  // 5 humanoid in a tunic: bare arms at the sides, clothes in the secondary colour, hands
  ['...ooooo', '..osssss', '.obsssss', 'obosssss', 'obosssss', 'obosssss', '.k.sssss', '...ooooo'],
  // 6 fish: streamlined with a light belly
  ['........', '..oooooo', '.obbbbbb', 'obbbbsbb', 'obblllll', '.obbllll', '..oooooo', '........'],
  // 7 serpent coils
  ['........', '....oooo', '...obbbb', '..obsssb', '.obbbbbb', '.obssbbb', 'obbbbbbb', '.ooooooo'],
  // 8 armoured shell (tortoise, beetle)
  ['..oooooo', '.ohhhhhh', 'ohshshsh', 'ohhhhhhh', 'ohshshsh', 'ohhhhhhh', '.obbbbbb', '..oooooo']
];

// ---- legs: [frameA, frameB], 4 rows each, placed at y = 16. The right side uses the other frame, so the
// two sides alternate as the creature walks. ----
export const LEGS = [
  // 0 none (slithers)
  [['........', '........', '........', '........'], ['........', '........', '........', '........']],
  // 1 two legs
  [['........', '..obbo..', '..obbo..', '..oooo..'], ['........', '........', '..obbo..', '..oooo..']],
  // 2 four legs
  [['........', 'ob..ob..', 'ob..ob..', 'oo..oo..'], ['........', '........', 'ob..ob..', 'oo..oo..']],
  // 3 six legs
  [['........', 'o..o..o.', 'o..o..o.', 'o..o..o.'], ['........', '.o..o..o', 'o..o..o.', 'o..o..o.']],
  // 4 hooves
  [['........', '..obbo..', '..obbo..', '.kkkkk..'], ['........', '........', '..obbo..', '.kkkkk..']],
  // 5 tentacles
  [['.b..b..b', '.b..b..b', 'b..b..b.', '.o..o..o'], ['b..b..b.', '.b..b..b', '.b..b..b', 'o..o..o.']],
  // 6 fins (swimmers): a small ventral fin
  [['........', '........', '..ss....', '.sss....'], ['........', '........', '...ss...', '..sss...']]
];

// ---- ears: 5 rows, placed at y = 0 ----
export const EARS = [
  // 0 none
  ['........', '........', '........', '........', '........'],
  // 1 pointed
  ['.o......', '.bo.....', 'obbo....', '........', '........'],
  // 2 round
  ['.oo.....', 'obbo....', '.oo.....', '........', '........'],
  // 3 long
  ['o.......', 'bo......', 'bo......', 'bo......', 'obo.....'],
  // 4 fins / frills
  ['........', '........', 'ss......', 'sso.....', 'ss......'],
  // 5 cat ears
  ['.oo.....', '.obo....', 'oblo....', '........', '........'],
  // 6 elven ears, long and pointed sideways
  ['........', '........', '........', 'ob......', '.ob.....']
];

// ---- horns and crests: 4 rows, placed at y = 0 ----
export const HORNS = [
  // 0 none
  ['........', '........', '........', '........'],
  // 1 small horns
  ['..h.....', '..ho....', '........', '........'],
  // 2 big curved horns
  ['h.......', 'hh......', '.hho....', '..hh....'],
  // 3 crest
  ['......ss', '......ss', '.....oss', '........'],
  // 4 antennae
  ['..s.....', '..k.....', '...k....', '........'],
  // 5 antlers
  ['h.h.....', '.hh.h...', '..hhh...', '...h....'],
  // 6 unicorn horn
  ['.......h', '.......h', '......oh', '........']
];

// ---- wings: 7 rows x 4 columns, placed at x = 0 (the margin), y = 5, drawn behind the body ----
export const WINGS = [
  // 0 none
  ['....', '....', '....', '....', '....', '....', '....'],
  // 1 small feathered
  ['..s.', '.ss.', 'sss.', 'ssl.', '.ss.', '....', '....'],
  // 2 bat wings
  ['s...', 'ss..', 'sss.', 'slss', 's.ss', '..ss', '...s'],
  // 3 fairy
  ['ll..', 'lll.', 'llll', 'lll.', '.ll.', '....', '....'],
  // 4 dragon wings
  ['s...', 'ss..', 'sss.', 'ssss', 'sl.s', 's..s', 's...'],
  // 5 butterfly wings
  ['ll..', 'lsl.', 'lll.', '.ll.', 'lsl.', 'll..', '....']
];

// ---- tails: 6 rows x 4 columns, placed at x = 16 (right side), y = 11, drawn behind the body ----
export const TAILS = [
  // 0 none
  ['....', '....', '....', '....', '....', '....'],
  // 1 short
  ['....', '....', '..oo', '..bo', '..oo', '....'],
  // 2 long curl
  ['....', '..oo', '.obo', '..bo', '..bo', '...o'],
  // 3 bushy
  ['..oo', '.obb', '.obl', '.obb', '..bo', '...o'],
  // 4 spiked
  ['....', '..hk', '.obk', '..bh', '.obk', '..oo'],
  // 5 fish tail fin
  ['....', '..ss', '.sss', '.sss', '..ss', '....'],
  // 6 long bushy tail (fox, cat-folk)
  ['..ol', '.obl', 'obbl', 'obl.', 'ol..', '....']
];
