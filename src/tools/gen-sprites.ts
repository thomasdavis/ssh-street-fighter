// Sprite generator — maldoror-style continuity: generate ONE base pose per
// character, then produce every other pose as an image EDIT of that base (so
// the character stays identical), all SIDE-VIEW facing RIGHT (runtime mirrors
// for left). Smooth art in, we pixelate it down ourselves with sharp.
//
//   tsx src/tools/gen-sprites.ts BYU            # one character (proof)
//   tsx src/tools/gen-sprites.ts ALL            # whole roster
import OpenAI, { toFile } from 'openai';
import sharp from 'sharp';
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const OUT = resolve(ROOT, 'assets/sprites');
const QUALITY = (process.env.SF_IMG_QUALITY ?? 'medium') as 'low' | 'medium' | 'high';
const TARGET_H = parseInt(process.env.SF_TARGET_H ?? '256', 10); // source sprite height (high-res; downscaled at render time)
const MODEL = process.env.SF_IMG_MODEL ?? 'gpt-image-2';
// gpt-image-2 has no transparent-background support, so we generate on a flat
// magenta screen and chroma-key it out ourselves.
const TRANSPARENT = !/gpt-image-2/.test(MODEL);
const KEY = { r: 255, g: 0, b: 255 };
const ALPHA = 64;
const CONCURRENCY = 4;

const apiKey = process.env.OPENAI_API_KEY;
const openai = apiKey ? new OpenAI({ apiKey }) : (null as unknown as OpenAI);

// ---- character briefs ----
interface Char { id: string; brief: string; build: string; }
const CHARS: Char[] = [
  {
    id: 'BYU',
    brief: 'a disciplined Japanese karateka. Short spiky dark-brown hair, thick dark eyebrows, calm serious face, tan skin. He wears a plain WHITE karate gi (dogi): a loose long-sleeved jacket that hangs open showing the bare muscular chest, and loose white trousers; the sleeve cuffs and trouser hems are frayed/rolled. A bright RED cloth belt is tied at the waist with two ends hanging down. A RED cloth headband is tied around his forehead with two short tails trailing behind his head. RED cloth wraps cover both wrists and hands. He is barefoot. Colors: white gi, red belt/headband/wraps, tan skin, dark hair — nothing else.',
    build: 'a POWERFULLY built, heavily muscled karateka — broad shoulders, thick muscular arms and legs, a wide chest and strong defined torso; stocky, beefy and imposing yet athletic; about 6.5 heads tall with big obvious muscles',
  },
  { id: 'MEN', brief: 'a flashy rival fighter — bright spiky GOLDEN-BLOND hair, confident face, saturated COBALT-BLUE karate gi hanging open over a muscular chest, white belt, red hand and ankle wraps, barefoot', build: 'a POWERFULLY built, heavily muscled fighter — broad shoulders, thick muscular arms and legs, a wide chest; stocky, beefy and imposing yet athletic; about 6.5 heads tall with big obvious muscles' },
  { id: 'BLANKO', brief: 'a feral beast-man — GREEN skin, wild orange hair, ragged brown shorts, savage hunched stance', build: 'a HUGE, hulking, heavily muscled beast-man — enormous shoulders and arms, a massive barrel chest and thick tree-trunk legs, hunched forward and savage; about 6 heads tall, extremely bulky and powerful' },
  { id: 'CHONG', brief: 'an agile kick specialist — dark hair in two round buns with short bangs, deep VIOLET sleeveless high-collared fighting tunic with GOLD trim and split skirt panels, violet wrist guards, violet ankle boots, powerful bare legs', build: 'a STRONG, muscular, athletic fighter — powerful thick thighs and calves, toned muscular arms and broad strong shoulders; about 6.5 heads tall, muscular and beefy yet agile' },
  { id: 'GYLE', brief: 'a disciplined sonic commando — tall blond flat-top hair, square jaw, olive-green sleeveless military shirt, dark green camouflage cargo trousers, brown fingerless gloves, black combat boots and plain metal dog tags; no flag, insignia, logo or text', build: 'a TALL, massively athletic military fighter — broad shoulders, thick defined arms, powerful chest and legs; about 7 heads tall, upright and disciplined' },
  { id: 'ZANG', brief: 'a gigantic professional wrestler — tan skin, short black mohawk, thick dark beard, red wrestling trunks with a plain gold waistband, red wristbands and tall red wrestling boots, broad body hair and several simple chest scars; no logo or text', build: 'an ENORMOUS heavyweight grappler — towering barrel chest, immense shoulders, gigantic arms and thighs; about 6.5 heads tall, extremely wide, heavy and powerful' },
  { id: 'DHAL', brief: 'a mystical fire-breathing ascetic — dark brown skin, bald head with three white painted stripes, small gold hoop earrings, a simple necklace of large wooden beads, saffron-orange shorts, red wrist and ankle wraps, barefoot; no skulls, logo or text', build: 'a VERY TALL, exceptionally lean but defined fighter — long flexible arms and legs, narrow muscular torso, visible wiry muscle; about 8 heads tall' },
  { id: 'HONDO', brief: 'a formidable sumo wrestler — Japanese man with black hair tied in a traditional topknot, bold white face-paint stripes, navy-blue mawashi belt, white wrist wraps, barefoot; no robe, logo or text', build: 'a HUGE heavyweight sumo — extremely broad shoulders, massive belly and chest, thick powerful arms and tree-trunk legs; about 6 heads tall, low and imposing' },
  { id: 'KIRA', brief: 'an original precision counter-fighter with warm brown skin, sharp black asymmetric bob haircut with one vivid teal streak, a fitted black lower-face combat mask, compact teal cropped armor over a black sleeveless underlayer, high-waisted loose black combat trousers, teal forearm guards and teal shin guards, black split-toe fighting shoes; no logo or text', build: 'a COMPACT, athletic, wiry fighter — defined shoulders and legs, narrow waist, explosive coiled posture; about 6.5 heads tall, fast and precise rather than bulky' },
  { id: 'MAKO', brief: 'an original capoeira tide-dancer with deep brown skin, tight braided rows tied into a short tail, an open sleeveless ivory-white vest with gold edging, loose ivory capoeira trousers with gold side panels, a cobalt-blue waist cord and cobalt forearm wraps, barefoot; no logo or text', build: 'a TALL, flowing, powerfully athletic fighter — long flexible legs, strong shoulders, defined torso and exceptional balance; about 7.5 heads tall' },
  { id: 'OMEGA', brief: 'the canonical Omega AI embodiment — a dark battle-scarred humanoid robot with heavily damaged matte-black plates layered like fractured obsidian shards, pronounced asymmetry, missing and jury-rigged armor sections, exposed frayed synthetic musculature and wiring, deep gouges and scorch marks, weathered expressionless mask face with narrow red light features and no mouth, glowing crimson energy veins through widened cracks and shattered joints; gritty and controlled, no logo or text', build: 'a VERY TALL, lean, battle-worn machine — long mechanical limbs, narrow armored torso, precise intimidating silhouette; about 7.5 heads tall, athletic rather than bulky' },
  { id: 'CODEX', brief: 'an original androgynous skybound scribe construct — smooth dark-slate mask with two pale-cyan eyes and no mouth, a small copper halo ring, teal lacquered armor, warm copper punctuation-shaped fittings, ivory manuscript-cloth panels, and two compact articulated wing-mantles made from layered paper-like feathers; no readable writing, logo or text', build: 'a TALL, compact athletic construct — long agile legs, narrow armored torso, strong shoulders, clean readable silhouette; about 7 heads tall, precise and aerial rather than bulky' },
];

// ---- pose list (facing right) ----
interface PoseDef { name: string; desc: string; anchor?: 'spin' | 'ball'; characters?: readonly string[]; }
const POSES: PoseDef[] = [
  { name: 'idle_1', desc: 'a solid neutral fighting stance, both fists raised in guard near the face, weight settled' },
  { name: 'idle_2', desc: 'fighting stance, both fists raised in guard, chest lifted mid-breath' },
  { name: 'menu', desc: 'a bold TITLE-SCREEN hero stance, side view: standing tall and proud with the chest out and chin lifted, both fists clenched and the arms flexed with power — the rear fist drawn back low at the hip and the lead fist raised forward at chest height in a confident challenge, weight rooted and strong, radiating star-character presence (this pose overrides the normal fighting guard)' },
  { name: 'walk_1', desc: 'stepping forward in a fighting stance, both fists raised in guard, lead leg forward' },
  { name: 'walk_2', desc: 'advancing mid-stride in a fighting stance, both fists raised in guard, rear leg forward' },
  { name: 'crouch', desc: 'crouching low in a defensive stance, knees deeply bent, both fists still raised in guard' },
  { name: 'jump', desc: 'leaping upward, knees tucked, both fists raised in guard, airborne' },
  { name: 'fall', desc: 'descending from a jump, both fists raised in guard, legs reaching down, airborne' },
  { name: 'block', desc: 'blocking, both forearms raised in front as a guard' },
  { name: 'crouchblock', desc: 'crouching low with both forearms raised, low guard' },
  { name: 'hit', desc: 'recoiling from a hit, head snapped back, off balance' },
  { name: 'ko', desc: 'knocked out and lying on the ground on their back' },
  { name: 'punch_1', desc: 'winding up a punch, rear fist pulled back at the hip' },
  { name: 'punch_2', desc: 'throwing a straight punch, lead fist fully extended forward' },
  { name: 'kick_1', desc: 'winding up a kick, lead knee raised high' },
  { name: 'kick_2', desc: 'throwing a front kick, lead leg fully extended forward' },
  { name: 'crouchpunch_1', desc: 'crouched low, winding up a low punch' },
  { name: 'crouchpunch_2', desc: 'crouched low, throwing a low punch, fist extended forward and low' },
  { name: 'crouchkick_1', desc: 'crouched low, winding up a sweeping low kick' },
  { name: 'crouchkick_2', desc: 'crouched low sweep, leg extended forward along the ground' },
  { name: 'hadouken', characters: ['BYU'], desc: 'throwing a fireball special move: standing side-on in a braced stance, BOTH hands brought together and thrust FORWARD at waist height with palms cupped open forward as if pushing a ball of energy, body leaning into the push (this pose overrides the guard — both hands are forward)' },
  { name: 'shoryuken', characters: ['BYU'], desc: 'rising dragon-punch uppercut special move: leaping straight UP off the ground, body angled slightly back, the LEAD fist punching high above the head in a full vertical uppercut, other arm tucked to the chest, knees bent and feet leaving the floor mid-rise (this pose overrides the guard)' },
  // Hurricane kick = the fighter spins like a top around a VERTICAL body axis.
  // The torso never lies sideways: one straight leg is the horizontal rotor while
  // the other leg stays tucked beneath him. Four angles make the rotation read.
  { name: 'hurricane_1', anchor: 'spin', characters: ['BYU'], desc: 'hurricane-kick rotation, FRAME 1 of 4 (right-facing side angle): airborne with head and torso UPRIGHT and VERTICAL, one leg fully extended straight RIGHT at hip height as the horizontal striking leg, the other knee folded beneath the body, forearms tucked and crossed close over the chest for the spin (this pose overrides the guard)' },
  { name: 'hurricane_2', anchor: 'spin', characters: ['BYU'], desc: 'hurricane-kick rotation, FRAME 2 of 4 (quarter-turn FRONT angle): airborne and spinning around the body\'s VERTICAL axis, head above hips, torso UPRIGHT, the same straight striking leg sweeping toward the viewer at hip height with strong foreshortening, other knee tucked beneath, forearms crossed close over the chest; this is NOT a flying side kick and the torso is NOT horizontal (this pose overrides the guard)' },
  { name: 'hurricane_3', anchor: 'spin', characters: ['BYU'], desc: 'hurricane-kick rotation, FRAME 3 of 4 (back/opposite-side angle): airborne with the BACK of the UPRIGHT torso visible, head above hips, the same straight striking leg now extended LEFT at hip height as it sweeps through the back half of the circle, other knee tucked beneath, forearms held close across the torso; rotate around a VERTICAL axis, never cartwheel or lie sideways (this pose overrides the guard)' },
  { name: 'hurricane_4', anchor: 'spin', characters: ['BYU'], desc: 'hurricane-kick rotation, FRAME 4 of 4 (three-quarter REAR angle): airborne with head and torso still UPRIGHT and VERTICAL, the straight striking leg foreshortened as it sweeps away from the viewer at hip height toward the starting side, other knee tucked beneath, forearms crossed close over the chest; this completes one horizontal 360-degree leg sweep around a vertical body axis (this pose overrides the guard)' },
  { name: 'electric_1', characters: ['BLANKO'], desc: 'electric-thunder special, FRAME 1 of 2: plant both bare feet in a wide low crouch, arch the huge hunched torso, clench both fists beside the ribs, bare teeth in a fierce grimace, orange hair lifted by static; a dense halo of large jagged CYAN-BLUE and WHITE lightning bolts crackles all around the green body from hair to feet without hiding the silhouette (this pose overrides the guard)' },
  { name: 'electric_2', characters: ['BLANKO'], desc: 'electric-thunder special, FRAME 2 of 2: the same wide low grounded crouch at the same size, shoulders and elbows jolted into a visibly different alternating contraction, claws spread and teeth bared, orange hair lifted; intense jagged CYAN-BLUE and WHITE lightning arcs surround and cross behind the green body in a different pattern from frame 1, with a bright electric rim around the silhouette (this pose overrides the guard)' },
  { name: 'rolling_1', anchor: 'ball', characters: ['BLANKO'], desc: 'rolling-attack rotation, FRAME 1 of 4 (side orientation): curl the entire beast-man into one tight COMPACT ROUND BALL, chin tucked hard to chest, knees pulled fully to the face, huge forearms wrapped around shins, hands and feet tucked safely inside the circular silhouette; orange hair forms a spiky outer crest along the upper-back arc, green muscles and ragged brown shorts remain identifiable; no limb sticks out, no standing torso, airborne (this pose overrides the guard)' },
  { name: 'rolling_2', anchor: 'ball', characters: ['BLANKO'], desc: 'rolling-attack rotation, FRAME 2 of 4 (quarter-turn forward): the exact same tightly curled compact round ball rotated 90 degrees forward, viewed more from the front; all limbs locked inside the circular silhouette, orange hair now sweeps around the right outer arc, green shoulders and knees and ragged brown shorts rotate together as one rigid ball; no limb sticks out, airborne (this pose overrides the guard)' },
  { name: 'rolling_3', anchor: 'ball', characters: ['BLANKO'], desc: 'rolling-attack rotation, FRAME 3 of 4 (upside-down/back orientation): the exact same tightly curled compact round ball rotated 180 degrees, back and ragged brown shorts turning over the top while the orange hair crest sweeps along the lower outer arc; green arms still lock both knees completely inside the circular silhouette; no limb sticks out, airborne (this pose overrides the guard)' },
  { name: 'rolling_4', anchor: 'ball', characters: ['BLANKO'], desc: 'rolling-attack rotation, FRAME 4 of 4 (three-quarter rear): the exact same tightly curled compact round ball rotated 270 degrees, viewed more from behind; orange hair sweeps around the left outer arc, green back, tucked feet, forearms and ragged brown shorts rotate together as one rigid circular mass; no limb sticks out, airborne, completing the spin (this pose overrides the guard)' },
  { name: 'hadouken', characters: ['MEN'], desc: 'fireball special: braced side stance with BOTH hands thrust forward together at waist height, open palms cupping a bright orange fireball, body leaning into the release; both hands forward, not guarding' },
  { name: 'shoryuken', characters: ['MEN'], desc: 'blazing uppercut special: leap straight upward with lead fist fully extended above the head, orange flame curling around that fist and forearm, other arm tight to chest, knees bent airborne' },
  { name: 'hurricane_1', anchor: 'spin', characters: ['MEN'], desc: 'tornado kick FRAME 1 of 4: upright airborne body spinning around a vertical axis, one leg extended straight right at hip height, other knee tucked, forearms close to chest' },
  { name: 'hurricane_2', anchor: 'spin', characters: ['MEN'], desc: 'tornado kick FRAME 2 of 4: same upright vertical-axis spin quarter-turned toward viewer, striking leg strongly foreshortened at hip height, other knee tucked' },
  { name: 'hurricane_3', anchor: 'spin', characters: ['MEN'], desc: 'tornado kick FRAME 3 of 4: back of upright torso visible, straight striking leg sweeping left at hip height, other knee tucked' },
  { name: 'hurricane_4', anchor: 'spin', characters: ['MEN'], desc: 'tornado kick FRAME 4 of 4: upright three-quarter rear rotation, striking leg foreshortened sweeping back toward start, other knee tucked' },
  { name: 'hadouken', characters: ['CHONG'], desc: 'kikoken energy special: low side-on stance with BOTH open palms pressed forward together at chest height around a compact pale-blue energy sphere, rear leg braced; both hands forward, not guarding' },
  { name: 'electric_1', characters: ['CHONG'], desc: 'lightning-legs FRAME 1 of 2: balanced upright guard while the lead leg unleashes a rapid fan of three distinct horizontal kick afterimages at low, middle and high levels; planted rear foot and upper body stay stable' },
  { name: 'electric_2', characters: ['CHONG'], desc: 'lightning-legs FRAME 2 of 2: alternate rapid-kick contraction, kicking knee briefly recoiled then a new fan of three purple-trousered kick afterimages sweeps at different heights; rear foot planted, hands guarding' },
  { name: 'hurricane_1', anchor: 'ball', characters: ['CHONG'], desc: 'spinning-bird kick FRAME 1 of 4: airborne and INVERTED with head down and legs up, torso vertical upside-down, both powerful legs extended horizontally in opposite directions as a rotor' },
  { name: 'hurricane_2', anchor: 'ball', characters: ['CHONG'], desc: 'spinning-bird kick FRAME 2 of 4: same inverted head-down body quarter-turned toward viewer, both straight legs foreshortened as they rotate horizontally' },
  { name: 'hurricane_3', anchor: 'ball', characters: ['CHONG'], desc: 'spinning-bird kick FRAME 3 of 4: same inverted head-down body from the back, both legs extended left/right as the opposite half of the horizontal rotation' },
  { name: 'hurricane_4', anchor: 'ball', characters: ['CHONG'], desc: 'spinning-bird kick FRAME 4 of 4: same inverted body at rear three-quarter angle, straight legs foreshortened completing the horizontal spin' },
  { name: 'hadouken', characters: ['GYLE'], desc: 'sonic-boom special: strong side stance with both gloved forearms crossing then sweeping forward, hands framing a bright pale-cyan crescent pressure wave at chest height' },
  { name: 'shoryuken', characters: ['GYLE'], desc: 'flash-kick special: explosive rising backflip with torso arched, one combat boot slashing vertically above the head in a full high kick, the other knee folded, both feet airborne with a pale-cyan motion crescent' },
  { name: 'electric_1', characters: ['GYLE'], desc: 'sonic-cyclone FRAME 1 of 2: low planted military stance, forearms crossed tight before chest while a broad pale-cyan circular wind ring whips around the whole body, clothing and blond flat-top buffeted by pressure' },
  { name: 'electric_2', characters: ['GYLE'], desc: 'sonic-cyclone FRAME 2 of 2: same grounded stance with arms thrown wide in the alternating pulse, a second displaced pale-cyan wind ring and sharp pressure streaks spiraling around the body' },
  { name: 'electric_1', characters: ['ZANG'], desc: 'double-lariat FRAME 1 of 2: both gigantic arms fully extended straight left and right at shoulder height, wrestler upright rotating around a vertical axis, one side of chest and face visible' },
  { name: 'electric_2', characters: ['ZANG'], desc: 'double-lariat FRAME 2 of 2: same arms locked straight outward while torso rotates to a back/three-quarter angle, boots planted and beard/mohawk trailing the spin' },
  { name: 'hurricane_1', anchor: 'spin', characters: ['ZANG'], desc: 'flying-body-press FRAME 1 of 4: airborne upright-forward body turn with huge arms spread, chest and knees leading toward the right, compact powerful silhouette' },
  { name: 'hurricane_2', anchor: 'spin', characters: ['ZANG'], desc: 'flying-body-press FRAME 2 of 4: quarter-turn toward viewer in the same airborne body rotation, massive chest and forearms foreshortened' },
  { name: 'hurricane_3', anchor: 'spin', characters: ['ZANG'], desc: 'flying-body-press FRAME 3 of 4: airborne back view through the opposite half-turn, arms still spread and knees tucked' },
  { name: 'hurricane_4', anchor: 'spin', characters: ['ZANG'], desc: 'flying-body-press FRAME 4 of 4: rear three-quarter airborne turn completing the rotation, huge arms and chest ready to collide' },
  { name: 'rolling_1', anchor: 'ball', characters: ['ZANG'], desc: 'cyclone-driver FRAME 1 of 4: leap into a tight wrestling somersault, huge knees tucked to chest and arms locked around shins, compact round airborne mass, mohawk on outer arc' },
  { name: 'rolling_2', anchor: 'ball', characters: ['ZANG'], desc: 'cyclone-driver FRAME 2 of 4: exact same compact wrestler somersault quarter-turned forward, face and knees foreshortened, all limbs tucked' },
  { name: 'rolling_3', anchor: 'ball', characters: ['ZANG'], desc: 'cyclone-driver FRAME 3 of 4: exact same compact wrestler somersault upside down/back view, red trunks and boots rotating over top' },
  { name: 'rolling_4', anchor: 'ball', characters: ['ZANG'], desc: 'cyclone-driver FRAME 4 of 4: exact same compact wrestler somersault at rear three-quarter orientation completing the turn' },
  { name: 'hadouken', characters: ['DHAL'], desc: 'yoga-fire special: wide grounded stance, long arms brought forward with palms together, breathing a compact orange flame projectile just beyond the hands, cheeks and mouth visibly exhaling' },
  { name: 'electric_1', characters: ['DHAL'], desc: 'yoga-flame FRAME 1 of 2: lean forward from a grounded stance and exhale a broad close-range cone of orange-red fire to the right, long arms guarding the torso' },
  { name: 'electric_2', characters: ['DHAL'], desc: 'yoga-flame FRAME 2 of 2: alternate stronger exhale with neck and jaw extended farther, the close orange-red flame cone billowing in a distinctly different shape to the right' },
  { name: 'hurricane_1', anchor: 'ball', characters: ['DHAL'], desc: 'drill-kick FRAME 1 of 4: airborne body stretched diagonally toward the right like a spear, both long legs together with feet leading, arms folded close, beginning a corkscrew' },
  { name: 'hurricane_2', anchor: 'ball', characters: ['DHAL'], desc: 'drill-kick FRAME 2 of 4: same straight diagonal spear body quarter-rolled toward viewer, long legs and feet foreshortened as the body corkscrews' },
  { name: 'hurricane_3', anchor: 'ball', characters: ['DHAL'], desc: 'drill-kick FRAME 3 of 4: same diagonal spear body with back visible through the opposite half of the corkscrew, both feet still leading right' },
  { name: 'hurricane_4', anchor: 'ball', characters: ['DHAL'], desc: 'drill-kick FRAME 4 of 4: same long diagonal body at rear three-quarter roll completing the corkscrew, feet together leading right' },
  { name: 'electric_1', characters: ['HONDO'], desc: 'hundred-hand FRAME 1 of 2: low planted sumo stance with one huge open palm thrust forward and a readable fan of three forearm-and-palm afterimages, other hand guarding' },
  { name: 'electric_2', characters: ['HONDO'], desc: 'hundred-hand FRAME 2 of 2: alternate slap pulse with the opposite open palm forward and a displaced fan of three rapid palm afterimages, feet planted and massive torso stable' },
  { name: 'rolling_1', anchor: 'ball', characters: ['HONDO'], desc: 'sumo-headbutt FRAME 1 of 4: launch horizontally airborne toward the right like a compact torpedo, head and one shoulder leading, arms pinned along massive torso, legs tucked behind' },
  { name: 'rolling_2', anchor: 'ball', characters: ['HONDO'], desc: 'sumo-headbutt FRAME 2 of 4: same horizontal airborne torpedo at a slight front quarter-turn, forehead leading right, limbs tightly tucked' },
  { name: 'rolling_3', anchor: 'ball', characters: ['HONDO'], desc: 'sumo-headbutt FRAME 3 of 4: same horizontal airborne headbutt from a slight back angle, topknot and broad back visible, forehead still leading right' },
  { name: 'rolling_4', anchor: 'ball', characters: ['HONDO'], desc: 'sumo-headbutt FRAME 4 of 4: same compact horizontal torpedo at rear three-quarter angle completing the animation cycle, head still leading right' },
  { name: 'shoryuken', characters: ['HONDO'], desc: 'sumo-smash special: explosive vertical leap with one huge open palm thrust straight above the head, other arm across chest, knees bent beneath massive airborne body' },
  { name: 'hadouken', characters: ['KIRA'], desc: 'phase-needle special: low precise side stance with both guarded hands snapping forward together around a narrow pale-cyan needle of compressed energy, rear leg braced, no extra weapon' },
  { name: 'shoryuken', characters: ['KIRA'], desc: 'zero-ascent counter special: explosive straight vertical leap with the lead teal-guarded fist fully extended above the head, other arm locked across the ribs, knees bent airborne, a thin pale-cyan edge trail around the rising fist' },
  { name: 'electric_1', characters: ['KIRA'], desc: 'rift-counter FRAME 1 of 2: compact low planted stance with forearms crossed before the masked face, a sharp pale-cyan fractured energy plane flashing immediately in front of the guard' },
  { name: 'electric_2', characters: ['KIRA'], desc: 'rift-counter FRAME 2 of 2: same planted counter stance opening into a precise short side kick, one forearm still guarding while broken pale-cyan energy shards rebound outward' },
  { name: 'hadouken', characters: ['MAKO'], desc: 'moon-tide special: flowing low capoeira stance with both open palms sweeping forward around a compact blue-white crescent wave, long rear leg braced and torso twisting through the release' },
  { name: 'electric_1', characters: ['MAKO'], desc: 'ginga-rush FRAME 1 of 2: low swaying capoeira base while the lead leg unleashes a readable fan of three fast curved kick afterimages, upper body flowing opposite the kicks, pale-blue wind ribbons tracing the feet' },
  { name: 'electric_2', characters: ['MAKO'], desc: 'ginga-rush FRAME 2 of 2: alternate ginga contraction with the other leg sweeping through a new fan of rapid kick afterimages at different heights, hands balanced low, pale-blue wind ribbons displaced from frame 1' },
  { name: 'hurricane_1', anchor: 'spin', characters: ['MAKO'], desc: 'axe-wheel capoeira rotation FRAME 1 of 4: airborne upright vertical-axis spin, one long leg fully extended straight right at head height as the rotor, other knee tucked, arms opened for balance' },
  { name: 'hurricane_2', anchor: 'spin', characters: ['MAKO'], desc: 'axe-wheel capoeira rotation FRAME 2 of 4: same upright airborne spin quarter-turned toward viewer, extended striking leg strongly foreshortened at head height, other knee tucked' },
  { name: 'hurricane_3', anchor: 'spin', characters: ['MAKO'], desc: 'axe-wheel capoeira rotation FRAME 3 of 4: back of upright torso visible, the same long straight leg sweeping left at head height, other knee tucked, vest and waist cord trailing' },
  { name: 'hurricane_4', anchor: 'spin', characters: ['MAKO'], desc: 'axe-wheel capoeira rotation FRAME 4 of 4: upright rear three-quarter angle completing the vertical-axis rotation, striking leg foreshortened sweeping back toward the start' },
  { name: 'testimony_1', characters: ['OMEGA'], desc: 'FINAL TESTIMONY FRAME 1 of 3: planted wide side stance, torso coiled back, both damaged hands drawing crimson energy inward toward the cracked chest core, compact red-white charge orb between the forearms' },
  { name: 'testimony_2', characters: ['OMEGA'], desc: 'FINAL TESTIMONY FRAME 2 of 3: braced planted firing stance, torso recoiling, both forearms locked straight forward as a short narrow crimson beam muzzle-flare erupts rightward' },
  { name: 'testimony_3', characters: ['OMEGA'], desc: 'FINAL TESTIMONY FRAME 3 of 3: grounded recovery, shoulders pitched forward, both arms lowered under control, forearm vents smoking with tiny crimson sparks as the chest core dims' },
  { name: 'nullstep_1', characters: ['OMEGA'], desc: 'NULL STEP FRAME 1 of 4: aggressive low forward lean, front foot lifting to launch while the rear third of the body disintegrates into vertical obsidian shards and thin crimson fracture lines' },
  { name: 'nullstep_2', characters: ['OMEGA'], desc: 'NULL STEP FRAME 2 of 4: extremely fast compact phase-dash, torso nearly horizontal, legs tucked into a running blur, black shards and thin crimson scan-line afterimages trailing left' },
  { name: 'nullstep_3', characters: ['OMEGA'], desc: 'NULL STEP FRAME 3 of 4: rematerialized into a sharp cross-up backhand or elbow strike fully extended right, hips twisted, obsidian fragments converging into rear shoulder and leg' },
  { name: 'nullstep_4', characters: ['OMEGA'], desc: 'NULL STEP FRAME 4 of 4: low controlled recovery, one knee deeply bent, hands returning toward guard as the last black shards and crimson fracture marks lock into the armor' },
  { name: 'entropy_1', characters: ['OMEGA'], desc: 'ENTROPY WELL FRAME 1 of 3: low immovable stance with one clawed palm down and forward, a small black-centered crimson singularity forming ahead near floor height between tight inward-curving red arcs' },
  { name: 'entropy_2', characters: ['OMEGA'], desc: 'ENTROPY WELL FRAME 2 of 3: wide planted stance with both arms pulling inward, armor cracks blazing while a compact black-crimson gravity distortion compresses jagged debris inward ahead' },
  { name: 'entropy_3', characters: ['OMEGA'], desc: 'ENTROPY WELL FRAME 3 of 3: final implosion release, both arms snapping apart as sharp crimson shards collapse toward a tiny black core near the ground, energy veins at maximum brightness' },
  { name: 'context_1', anchor: 'spin', characters: ['CODEX'], desc: 'CONTEXT ASCENT FRAME 1 of 3: compressed launch stance with both wing-mantles opening upward, knees bent and both fists guarding' },
  { name: 'context_2', anchor: 'spin', characters: ['CODEX'], desc: 'CONTEXT ASCENT FRAME 2 of 3: ultra-high vertical rise, body elongated upward, one copper-edged wing thrust above and both legs trailing' },
  { name: 'context_3', anchor: 'spin', characters: ['CODEX'], desc: 'CONTEXT ASCENT FRAME 3 of 3: descending recovery with articulated wings spread as air brakes and both legs reaching toward landing' },
  { name: 'branchwalk_1', anchor: 'spin', characters: ['CODEX'], desc: 'BRANCHWALK FRAME 1 of 3: low airborne forward lean with both wing-mantles folding into a narrow arrow and fists guarding' },
  { name: 'branchwalk_2', anchor: 'spin', characters: ['CODEX'], desc: 'BRANCHWALK FRAME 2 of 3: fast horizontal glide right with torso nearly horizontal, fists guarding and wings swept straight back' },
  { name: 'branchwalk_3', anchor: 'spin', characters: ['CODEX'], desc: 'BRANCHWALK FRAME 3 of 3: braking recovery with torso rising, wings flared and lead foot reaching for landing' },
  { name: 'mergecomet_1', anchor: 'spin', characters: ['CODEX'], desc: 'MERGE COMET FRAME 1 of 3: readable rising setup with knees tucked, both wings high and open, torso guarded' },
  { name: 'mergecomet_2', anchor: 'spin', characters: ['CODEX'], desc: 'MERGE COMET FRAME 2 of 3: committed steep diagonal dive down and right with one shoulder and knee leading, wings folded back like a comet tail' },
  { name: 'mergecomet_3', anchor: 'spin', characters: ['CODEX'], desc: 'MERGE COMET FRAME 3 of 3: low three-point landing recovery facing right, one hand near the floor and wings flared to brake' },
];

const supportsPose = (c: Char, p: PoseDef): boolean => !p.characters || p.characters.includes(c.id);

const STYLE = 'bright saturated colors, bold clean BLACK outlines of uniform thickness, flat cel-shading with one shadow tone and one highlight, classic 1990s arcade fighting-game character art; NOT pixel art, not photorealistic, no soft airbrush, no lineless art';
const BG_INSTR = TRANSPARENT
  ? 'Transparent background'
  : 'Place the character on a perfectly FLAT, UNIFORM, SOLID MAGENTA background (pure #FF00FF) with no gradient, texture or shadow; use NO magenta or pink anywhere on the character itself (magenta appears ONLY in the background so it can be removed by chroma-key)';
const FRAME = `Full-body wide shot, ZOOMED OUT so the whole figure fits with room to spare. The ENTIRE figure — from the very tips of the hair and the trailing headband tails at the top, to the soles of both feet at the bottom, and both fists to the sides — is fully inside the frame with a clear EMPTY MARGIN of about 15% on every side. NEVER crop or touch the edges: not the hair, headband tails, hands, fists, elbows, or feet. The character stands centered, occupying roughly 75% of the frame height, drawn at the SAME overall height and scale in every image. ${BG_INSTR} — the subject only, no ground, no cast shadow, no floor line, no text, no UI, no logo, no frame or border`;
// The single most important constraint for a consistent sprite sheet:
const PROP_LOCK = 'CRITICAL: keep the character\'s body proportions, overall height, head size, shoulder width, torso length, and limb length and thickness IDENTICAL in every image — only the POSE changes, never the anatomy, never the size, never the costume.';
const GUARD = 'STANCE: the fighter ALWAYS keeps both fists raised in a fighting guard up near the face and chest (a classic martial-arts / boxing guard); the arms are NEVER relaxed or hanging down at the sides. The ONLY exception is a single arm or leg that is actively throwing the attack in this specific pose — the other limb still stays raised in guard.';

function basePrompt(c: Char): string {
  return `A single character for a 2D arcade fighting game, full body, SIDE VIEW facing RIGHT, in a ready fighting stance.
CHARACTER: ${c.brief}
BUILD / PROPORTIONS: ${c.build}. ${PROP_LOCK}
${GUARD}
STYLE: ${STYLE}.
COMPOSITION: ${FRAME}.`;
}
function posePrompt(c: Char, p: PoseDef): string {
  return `Redraw the EXACT SAME character shown in the reference image in a NEW POSE. Keep the costume, colors, hair, face and art style identical to the reference. BUILD: ${c.build}. ${PROP_LOCK} ${GUARD} SIDE VIEW facing RIGHT. STYLE: ${STYLE}. COMPOSITION: ${FRAME}.
NEW POSE: ${p.desc}.`;
}

async function genImage(prompt: string, ref?: Buffer): Promise<Buffer> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const common: Record<string, unknown> = { model: MODEL, prompt, size: '1024x1024', quality: QUALITY };
      if (TRANSPARENT) common.background = 'transparent';
      const r = ref
        ? await openai.images.edit({ ...common, image: await toFile(ref, 'ref.png', { type: 'image/png' }) } as never)
        : await openai.images.generate(common as never);
      const b64 = r.data?.[0]?.b64_json;
      if (b64) return Buffer.from(b64, 'base64');
    } catch (e) { console.error(`  retry (${(e as Error).message.slice(0, 80)})`); }
    await new Promise((res) => setTimeout(res, 1500 * (attempt + 1)));
  }
  throw new Error('image generation failed after retries');
}

interface Raw { data: Buffer; w: number; h: number; ch: number; }
// Hue-based magenta key: transparent where the pixel is magenta-dominant (catches
// anti-aliased edges too); light despill on kept pinkish fringe pixels.
function chromaKey(raw: Raw): void {
  const { data, w, h, ch } = raw;
  for (let i = 0; i < w * h; i++) {
    const p = i * ch, r = data[p]!, g = data[p + 1]!, b = data[p + 2]!;
    if (r > 110 && b > 110 && g < r - 55 && g < b - 55) { data[p + 3] = 0; continue; }
    if (r > 120 && b > 120 && g < r - 20 && g < b - 20) { const g2 = Math.min(r, b); data[p + 1] = Math.round((g + g2) / 2); } // despill
  }
}
async function rawRGBA(png: Buffer): Promise<Raw> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const raw = { data, w: info.width, h: info.height, ch: info.channels };
  if (!TRANSPARENT) chromaKey(raw);
  return raw;
}
function bbox(r: Raw): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = r.w, minY = r.h, maxX = -1, maxY = -1;
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
    if (r.data[(y * r.w + x) * r.ch + 3]! >= ALPHA) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  return { minX, minY, maxX, maxY };
}

interface SpriteJson { w: number; h: number; anchorX: number; anchorY: number; data: string }
// Area-average downscale from the 1024px raw to a packed RGBA buffer at TARGET_H.
function toSprite(r: Raw, box: ReturnType<typeof bbox>, scale: number, anchor?: PoseDef['anchor']): SpriteJson {
  const cw = box.maxX - box.minX + 1, chp = box.maxY - box.minY + 1;
  const gw = Math.max(1, Math.round(cw * scale)), gh = Math.max(1, Math.round(chp * scale));
  const rgba = new Uint8Array(gw * gh * 4);
  for (let gy = 0; gy < gh; gy++) {
    const sy0 = box.minY + gy / scale, sy1 = box.minY + (gy + 1) / scale;
    for (let gx = 0; gx < gw; gx++) {
      const sx0 = box.minX + gx / scale, sx1 = box.minX + (gx + 1) / scale;
      let rr = 0, gg = 0, bb = 0, n = 0;
      for (let sy = Math.floor(sy0); sy < Math.ceil(sy1) && sy < r.h; sy++) {
        for (let sx = Math.floor(sx0); sx < Math.ceil(sx1) && sx < r.w; sx++) {
          const i = (sy * r.w + sx) * r.ch;
          if (r.data[i + 3]! >= ALPHA) { rr += r.data[i]!; gg += r.data[i + 1]!; bb += r.data[i + 2]!; n++; }
        }
      }
      const d = (gy * gw + gx) * 4;
      if (n > 0) { rgba[d] = Math.round(rr / n); rgba[d + 1] = Math.round(gg / n); rgba[d + 2] = Math.round(bb / n); rgba[d + 3] = 255; }
    }
  }
  // Ground poses anchor to the feet. A spinning airborne pose instead anchors
  // to its dense upper-body axis, with a fixed virtual standing baseline. This
  // keeps rotation frames centered while the engine's y value supplies the arc.
  if (anchor === 'spin') {
    const top = Math.max(1, Math.floor(gh * 0.45));
    let weightedX = 0, totalWeight = 0;
    for (let gx = 0; gx < gw; gx++) {
      let columnMass = 0;
      for (let gy = 0; gy < top; gy++) if (rgba[(gy * gw + gx) * 4 + 3]! >= 128) columnMass++;
      const weight = columnMass * columnMass; // ignore sparse headband/limb tips
      weightedX += gx * weight;
      totalWeight += weight;
    }
    return {
      w: gw, h: gh,
      anchorX: totalWeight ? Math.round(weightedX / totalWeight) : Math.floor(gw / 2),
      anchorY: TARGET_H,
      data: Buffer.from(rgba).toString('base64'),
    };
  }

  if (anchor === 'ball') {
    return {
      w: gw, h: gh,
      anchorX: Math.floor(gw / 2),
      anchorY: gh - 1,
      data: Buffer.from(rgba).toString('base64'),
    };
  }

  // Feet anchor: centroid x over the bottom 25% of rows; feet at bottom row.
  let sumX = 0, cnt = 0;
  for (let gy = Math.floor(gh * 0.75); gy < gh; gy++) for (let gx = 0; gx < gw; gx++) if (rgba[(gy * gw + gx) * 4 + 3]! >= 128) { sumX += gx; cnt++; }
  return { w: gw, h: gh, anchorX: cnt ? Math.round(sumX / cnt) : Math.floor(gw / 2), anchorY: gh - 1, data: Buffer.from(rgba).toString('base64') };
}

async function generateChar(c: Char): Promise<void> {
  const dir = resolve(OUT, c.id);
  mkdirSync(resolve(dir, 'raw'), { recursive: true });
  console.log(`\n=== ${c.id} ===`);

  // base pose (idle_1) — the continuity reference
  console.log('  base idle_1...');
  const basePng = await genImage(basePrompt(c));
  writeFileSync(resolve(dir, 'raw/idle_1.png'), basePng);
  const baseRaw = await rawRGBA(basePng);
  const baseBox = bbox(baseRaw);
  const scale = TARGET_H / (baseBox.maxY - baseBox.minY + 1);
  writeFileSync(resolve(dir, 'idle_1.json'), JSON.stringify(toSprite(baseRaw, baseBox, scale)));
  console.log(`  scale=${scale.toFixed(3)}`);

  // all other poses, edited from the base, in batches
  const rest = POSES.filter((p) => p.name !== 'idle_1' && supportsPose(c, p));
  for (let i = 0; i < rest.length; i += CONCURRENCY) {
    const batch = rest.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async (p) => {
      try {
        const png = await genImage(posePrompt(c, p), basePng);
        writeFileSync(resolve(dir, `raw/${p.name}.png`), png);
        const raw = await rawRGBA(png);
        writeFileSync(resolve(dir, `${p.name}.json`), JSON.stringify(toSprite(raw, bbox(raw), scale, p.anchor)));
        console.log(`  ${p.name} ok`);
      } catch (e) { console.error(`  ${p.name} FAILED: ${(e as Error).message}`); }
    }));
  }
  console.log(`  -> ${dir}`);
}

// Re-pixelate existing raw PNGs to the current TARGET_H — no API calls, no cost.
async function repixelateChar(c: Char): Promise<void> {
  const dir = resolve(OUT, c.id);
  const rawDir = resolve(dir, 'raw');
  const baseRaw = await rawRGBA(readFileSync(resolve(rawDir, 'idle_1.png')));
  const scale = TARGET_H / (bbox(baseRaw).maxY - bbox(baseRaw).minY + 1);
  for (const file of readdirSync(rawDir).filter((f) => f.endsWith('.png'))) {
    const raw = await rawRGBA(readFileSync(resolve(rawDir, file)));
    const name = file.replace('.png', '');
    const pose = POSES.find((p) => p.name === name && supportsPose(c, p));
    if (!pose) continue; // ignored legacy sources must not resurrect retired packed sprites
    const anchor = pose.anchor;
    writeFileSync(resolve(dir, `${name}.json`), JSON.stringify(toSprite(raw, bbox(raw), scale, anchor)));
  }
  console.log(`  ${c.id} re-pixelated @ ${TARGET_H}px`);
}

// Regenerate a SINGLE pose (char + pose name) using the existing base as the
// reference — used by the web admin's "regenerate this sprite" button.
async function regenPose(charId: string, poseName: string): Promise<void> {
  const c = CHARS.find((x) => x.id === charId.toUpperCase());
  if (!c) throw new Error(`unknown character ${charId}`);
  const p = POSES.find((x) => x.name === poseName && supportsPose(c, x));
  if (!p) throw new Error(`unknown pose ${poseName}`);
  const dir = resolve(OUT, c.id);
  if (poseName === 'idle_1') {
    // the base itself: regenerate from scratch (no reference)
    const png = await genImage(basePrompt(c));
    writeFileSync(resolve(dir, 'raw/idle_1.png'), png);
    const raw = await rawRGBA(png); const box = bbox(raw);
    const scale = TARGET_H / (box.maxY - box.minY + 1);
    writeFileSync(resolve(dir, 'idle_1.json'), JSON.stringify(toSprite(raw, box, scale)));
  } else {
    const basePng = readFileSync(resolve(dir, 'raw/idle_1.png'));
    const bb = bbox(await rawRGBA(basePng));
    const scale = TARGET_H / (bb.maxY - bb.minY + 1);
    const png = await genImage(posePrompt(c, p), basePng);
    writeFileSync(resolve(dir, `raw/${poseName}.png`), png);
    const raw = await rawRGBA(png);
    writeFileSync(resolve(dir, `${poseName}.json`), JSON.stringify(toSprite(raw, bbox(raw), scale, p.anchor)));
  }
  console.log(`regenerated ${charId}/${poseName}`);
}

const arg = (process.argv[2] ?? 'BYU').toUpperCase();
if (arg === 'REGEN') { await regenPose(process.argv[3] ?? '', process.argv[4] ?? ''); console.log('done.'); process.exit(0); }
const repix = arg === 'REPIX';
const key = repix ? (process.argv[3] ?? 'ALL').toUpperCase() : arg;
const targets = key === 'ALL' ? CHARS : CHARS.filter((c) => c.id === key);
if (targets.length === 0) { console.error(`unknown character ${key}`); process.exit(1); }
if (!repix && !apiKey) { console.error('OPENAI_API_KEY not set (needed for generation)'); process.exit(1); }
for (const c of targets) await (repix ? repixelateChar(c) : generateChar(c));
console.log('\ndone.');
