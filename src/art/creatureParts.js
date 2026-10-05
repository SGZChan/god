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
  ['..ssssss', '.sssssss', '.ssbbbbb', '.sobwebb', '.sobbbbb', '.s.obbbb', '.s..obbk', '.....ooo'],
  // 12 dwarf: a braided beard in the hair colour
  ['...sssss', '..ssssss', '.sbbbbbb', '.obwebbb', '.obbbbbb', '.ossssss', '.osssssl', '..osssss'],
  // 13 orc: heavy brow, tusks
  ['........', '..oooooo', '.obbbbbb', 'obwwebbb', 'obbbbbbb', 'obbbbbbk', '.ohbbbbk', '..oooooo'],
  // 14 deer: a long narrow muzzle
  ['........', '...ooooo', '..obbbbb', '.obwebbb', '.obbbbbb', '..obbllk', '...obllk', '....oooo'],
  // 15 rodent: round face, buck teeth
  ['........', '..oooooo', '.obbbbbb', 'obwebbbb', 'obbbbbbb', 'obbbllll', '.obbhhlk', '..oooooo'],
  // 16 bear: round ears and a pale muzzle
  ['..oo.ooo', '.obobbbb', '.obbbbbb', 'obwebbbb', 'obbbbbbb', 'obblllll', '.oblllkk', '..oooooo'],
  // 17 insectoid: big compound eyes and mandibles
  ['........', '..oooooo', '.obeebbb', 'obeeeebb', 'obeeeebb', 'obbbbbbb', '.ohbbhbb', '..oo.oo.'],
  // 18 grey alien: a big smooth head, huge dark slanted eyes, a tiny mouth
  ['..oooooo', '.obbbbbb', 'obbbbbbb', 'obkkkkbb', 'obkkkkbb', 'obbbbbbb', '.obbbbbb', '..oo.ooo'],
  // 19 goblin: pointed brow and a big nose
  ['........', '.o.ooooo', 'obobbbbb', 'obbbbbbb', 'obwebbbb', 'obbbbbkk', '.obbbbbb', '..oobbbb']
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
  ['..oooooo', '.ohhhhhh', 'ohshshsh', 'ohhhhhhh', 'ohshshsh', 'ohhhhhhh', '.obbbbbb', '..oooooo'],
  // 9 dwarf: broad, belted tunic
  ['.ooooooo', 'osssssss', 'obsssssl', 'obosssss', 'obosssss', 'obskkkkk', 'obsssssl', '.ooooooo'],
  // 10 robed: a long robe to the ground (priests, mages)
  ['...ooooo', '..osssss', '.osssssl', '.osssssl', 'osssssss', 'osssssss', 'osssslss', 'oooooooo'],
  // 11 insect thorax: segmented
  ['...ooooo', '..obbbbb', '..osssss', '..obbbbb', '..osssss', '..obbbbb', '...obbbb', '....oooo'],
  // 12 lanky alien: a thin torso
  ['.....ooo', '....obbb', '....obbb', '...obbbb', '...obbbl', '....obbb', '....obbb', '.....ooo']
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
  [['........', '........', '..ss....', '.sss....'], ['........', '........', '...ss...', '..sss...']],
  // 7 stilt legs: long and thin (deer, aliens)
  [['...ob...', '...ob...', '...ob...', '..ooo...'], ['........', '...ob...', '...ob...', '..ooo...']],
  // 8 insect legs: many thin legs
  [['o.o.o...', '.o.o.o..', 'o..o..o.', 'o..o..o.'], ['.o.o.o..', 'o.o.o.o.', '.o.o..o.', 'o..o..o.']]
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
  ['........', '........', '........', 'ob......', '.ob.....'],
  // 7 tall rabbit ears
  ['.ob.....', 'obb.....', 'obb.....', 'obl.....', '.ob.....'],
  // 8 tufted ears
  ['.o.o....', '.bob....', '.b......', '........', '........']
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
  ['.......h', '.......h', '......oh', '........'],
  // 7 ram horns: curled
  ['.hh.....', 'hhhh....', 'h..h....', '.hh.....']
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
  ['ll..', 'lsl.', 'lll.', '.ll.', 'lsl.', 'll..', '....'],
  // 6 insect wings: translucent
  ['.ll.', 'lll.', 'lsl.', 'lll.', '.ll.', '....', '....'],
  // 7 great feathered wings
  ['..ww', '.www', 'wwww', 'wwlw', 'wwww', '.www', '..ww']
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
  ['..ol', '.obl', 'obbl', 'obl.', 'ol..', '....'],
  // 7 thin rat tail
  ['....', '....', '....', '...o', '..o.', '.o..'],
  // 8 stinger: a curved tail with a dark tip
  ['..o.', '.ob.', '.ob.', '.ob.', '..ob', '...k']
];

// ---- alien mutations: pixel overlays on the finished sprite (rare, dominant: see life/genome.js 'mutation').
// Each returns [x, y, letter] pixels; `g` glows (palette: opposite the eye colour), `a` is the alien accent. ----
export const MUTATION_NAMES = ['none', 'third eye', 'eye stalks', 'tentacles', 'spines', 'crystals', 'many eyes', 'glow spots'];
const mirror = (list, w = 19) => list.flatMap(([x, y, c]) => [[x, y, c], [w - x, y, c]]);
export const MUTATIONS = [
  () => [],
  // 1 third eye on the forehead
  (bob) => [[9, 2 + bob, 'g'], [10, 2 + bob, 'g']],
  // 2 eye stalks: antennae with glowing tips
  (bob) => mirror([[7, 1 + bob, 'a'], [6, 0 + bob, 'a'], [5, 0 + bob, 'g']]),
  // 3 tentacles hanging from the shoulders, swaying with the walk
  (bob, frame) => mirror([[1 + frame, 10 + bob, 'a'], [1, 11 + bob, 'a'], [1 + frame, 12 + bob, 'a'], [1, 13 + bob, 'g']]),
  // 4 a ridge of spines along the back
  (bob) => [[5, 7 + bob, 'a'], [8, 6 + bob, 'a'], [8, 7 + bob, 'a'], [11, 6 + bob, 'a'], [11, 7 + bob, 'a'], [14, 7 + bob, 'a']],
  // 5 crystals growing from the shoulders
  (bob) => mirror([[3, 6 + bob, 'g'], [3, 7 + bob, 'g'], [2, 8 + bob, 'g'], [3, 8 + bob, 'g'], [4, 8 + bob, 'g']]),
  // 6 many eyes: extra glowing eyes on the cheeks and brow
  (bob) => mirror([[4, 3 + bob, 'g'], [5, 5 + bob, 'g'], [3, 6 + bob, 'g']]),
  // 7 bioluminescent spots on the body (only where there is body)
  (bob) => [[5, 10 + bob, 'g'], [8, 12 + bob, 'g'], [11, 10 + bob, 'g'], [14, 13 + bob, 'g'], [6, 14 + bob, 'g'], [13, 9 + bob, 'g']]
];
