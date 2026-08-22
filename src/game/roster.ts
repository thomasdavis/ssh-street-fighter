// The (legally distinct) roster. Comic knockoffs, our own pixel art.
import {
  RED_PALETTE, BLUE_PALETTE, GREEN_PALETTE, PURPLE_PALETTE, OLIVE_PALETTE,
  CRIMSON_PALETTE, SAFFRON_PALETTE, NAVY_PALETTE, TEAL_PALETTE,
  IVORY_PALETTE, OBSIDIAN_PALETTE, AURORA_PALETTE, HEARTH_PALETTE,
  LUMEN_PALETTE, OUTBACK_PALETTE, NOBLE_PALETTE, HORIZON_PALETTE,
  GRID_PALETTE,
} from './sprites.js';
import type { FighterPalette } from './types.js';

export interface Character {
  name: string;      // shown on the HUD (<= 12 chars)
  tagline: string;
  palette: FighterPalette;
  origin: string;
  discipline: string;
  archetype: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  quote: string;
  story: readonly [string, string];
  playstyle: string;
  strengths: readonly [string, string, string];
}

export const ROSTER: Character[] = [
  {
    name: 'BYU', tagline: 'wandering fist', palette: RED_PALETTE, origin: 'Kagoshima, Japan', discipline: 'Ansatsuken-derived karate', archetype: 'Balanced all-rounder', difficulty: 'Beginner', quote: 'The road answers only the honest fist.',
    story: ['Byu left a mountain dojo after winning a match he believed he had not earned. His teacher refused to explain the verdict, telling him that certainty had become the weakest part of his technique.', 'He now crosses the world accepting fights in unfamiliar schools. Every opponent is another question: whether discipline can remain humane when victory is the only language the arena understands.'],
    playstyle: 'Control the middle of the screen with a reliable projectile, punish reckless approaches with Dragon Punch, and use Hurricane Kick to carry momentum through close-range scrambles.', strengths: ['Flexible at every range', 'Reliable anti-air', 'Simple, complete toolkit'],
  },
  {
    name: 'MEN', tagline: 'flaming rival', palette: BLUE_PALETTE, origin: 'San Diego, USA', discipline: 'Ember karate', archetype: 'Aggressive all-rounder', difficulty: 'Beginner', quote: 'If the crowd is quiet, you are not fighting hard enough.',
    story: ['Men grew up above a failing boardwalk arcade and learned to fight by copying the champions flickering across its cabinets. He turned imitation into a flamboyant school built around heat, rhythm, and impossible confidence.', 'He chases Byu not from hatred but from fear that his own fire needs an audience to exist. The tournament is his chance to prove spectacle can carry the same truth as restraint.'],
    playstyle: 'Men trades a little patience for pressure. His fiery projectile starts approaches, Blazing Uppercut punishes interruptions, and Tornado Kick keeps him glued to a retreating rival.', strengths: ['Explosive pressure', 'Strong reversals', 'Easy damage routes'],
  },
  {
    name: 'BLANKO', tagline: 'zappy beast', palette: GREEN_PALETTE, origin: 'Rio Negro, Brazil', discipline: 'Feral capacitor combat', archetype: 'Mobile disruptor', difficulty: 'Intermediate', quote: 'Storm knows my name. You will too.',
    story: ['Blanko survived alone around an abandoned hydroelectric survey camp where tropical storms repeatedly struck the rusting transmission towers. Years of exposure changed his body, but not the careful intelligence behind his feral appearance.', 'He enters the circuit to stop a corporation from reclaiming the valley as a weapons range. The prize money matters less than making the world look directly at the home it had already written off.'],
    playstyle: 'Turn movement into threat: Rolling Attack crosses space, Vertical Roll owns the air above him, and Electric Thunder makes close pursuit dangerous through repeated hits.', strengths: ['Unpredictable movement', 'Multi-hit defense', 'Excellent air control'],
  },
  {
    name: 'CHONG', tagline: 'lightning legs', palette: PURPLE_PALETTE, origin: 'Chengdu, China', discipline: 'Northern kicking arts', archetype: 'Fast pressure fighter', difficulty: 'Intermediate', quote: 'A wall is only a rhythm you have not solved.',
    story: ['Chong was once the youngest courier in a mountain rescue network, carrying medicine across paths too narrow for vehicles. Speed became responsibility long before it became performance.', 'After a private security force closed those routes, she took her footwork into underground arenas. Each victory funds another independent relay station—and maps another way around people who confuse control with safety.'],
    playstyle: 'Use Kikoken to set the pace, overwhelm grounded defenders with Lightning Legs, then change the vertical rhythm with Spinning Bird Kick.', strengths: ['Rapid pressure', 'Strong corner carry', 'Difficult vertical angles'],
  },
  {
    name: 'GYLE', tagline: 'sonic commando', palette: OLIVE_PALETTE, origin: 'Rotterdam, Netherlands', discipline: 'Resonance field tactics', archetype: 'Defensive zoner', difficulty: 'Intermediate', quote: 'Hold the line. Then move it.',
    story: ['Gyle served in an international disaster-response unit where controlled sonic charges cleared collapsed tunnels without burying survivors. A falsified report later blamed his team for a mission ordered by people far above them.', 'He fights with a recorder full of the original transmissions at his side. The tournament broadcasts globally; if he reaches the final, the truth reaches every channel the officials tried to close.'],
    playstyle: 'Build a disciplined wall with Sonic Boom, punish jumps with Flash Kick, and deploy Sonic Cyclone when an opponent finally forces their way into your space.', strengths: ['Excellent screen control', 'Powerful anti-air', 'Safe defensive rhythm'],
  },
  {
    name: 'ZANG', tagline: 'iron cyclone', palette: CRIMSON_PALETTE, origin: 'Tbilisi, Georgia', discipline: 'Industrial catch wrestling', archetype: 'Armored grappler', difficulty: 'Advanced', quote: 'Come closer. History is heavy.',
    story: ['Zang lifted steel in a rail foundry before a lockout turned the workers’ canteen into a wrestling hall. His size drew attention, but his loyalty made him a folk hero: every purse was divided with the families on the picket line.', 'He has entered the world circuit because the foundry is being sold for scrap. Zang intends to buy it back, reopen the hall, and prove a giant can be defined by what he holds up rather than what he crushes.'],
    playstyle: 'Walk opponents into terrifying close-range decisions. Cyclone Driver breaks passive defense, Double Lariat controls the space around him, and Flying Press closes the final gap.', strengths: ['Huge close damage', 'Omnidirectional pressure', 'High comeback potential'],
  },
  {
    name: 'DHAL', tagline: 'mystic flame', palette: SAFFRON_PALETTE, origin: 'Varanasi, India', discipline: 'Agni breath yoga', archetype: 'Long-range controller', difficulty: 'Advanced', quote: 'Distance is a story the body tells itself.',
    story: ['Dhal spent decades studying breath control with firefighters, dancers, and ascetics along the Ganges. His apparent mysticism is a practical philosophy: attention changes the limits a frightened body accepts.', 'When a patron tried to patent those community-taught methods, Dhal stepped into public competition. He fights to keep the practice unowned, demonstrating its impossible reach where no legal brief could be ignored.'],
    playstyle: 'Keep rivals at the exact distance they hate. Yoga Fire occupies a lane, Yoga Flame denies the near lane, and Drill Kick turns long limbs into a sudden aerial spear.', strengths: ['Exceptional reach', 'Layered zoning', 'Unusual approach angles'],
  },
  {
    name: 'HONDO', tagline: 'sumo thunder', palette: NAVY_PALETTE, origin: 'Osaka, Japan', discipline: 'Harbor sumo', archetype: 'Pressure heavyweight', difficulty: 'Intermediate', quote: 'A mountain moves when it chooses.',
    story: ['Hondo left professional sumo after refusing to throw a ceremonial bout for a sponsor. Dockworkers in Osaka gave him a job, a training floor, and a new style built for unstable decks and narrow loading bays.', 'He competes to establish an independent stable where rank cannot be purchased. His booming laugh hides careful footwork: every charge is measured, and every palm strike carries the weight of the crew behind him.'],
    playstyle: 'Advance behind overwhelming mass. Sumo Headbutt bursts across the screen, Hundred Hand locks opponents down, and Sumo Smash intercepts anyone trying to escape over the top.', strengths: ['Relentless forward pressure', 'Strong chip sequences', 'Durable anti-air'],
  },
  {
    name: 'KIRA', tagline: 'phase tactician', palette: TEAL_PALETTE, origin: 'Nairobi, Kenya', discipline: 'Predictive counter-combat', archetype: 'Precision counter fighter', difficulty: 'Advanced', quote: 'I do not outrun the moment. I arrive first.',
    story: ['Kira designed motion-prediction systems for emergency exoskeletons until a defense contractor quietly redirected her work. She erased the training archive, disappeared, and rebuilt the mathematics as a physical discipline no server could confiscate.', 'Her mask is not concealment but focus: it narrows breath, sound, and sight into one clean decision. She enters fights to gather evidence against the contractor—and to learn where prediction ends and courage begins.'],
    playstyle: 'Win by being exact. Phase Needle checks movement, Zero Ascent punishes committed jumps, and Rift Counter turns a readable attack into Kira’s immediate reply.', strengths: ['Sharp whiff punishment', 'Fast counter tools', 'Precise space control'],
  },
  {
    name: 'MAKO', tagline: 'tide dancer', palette: IVORY_PALETTE, origin: 'Salvador, Brazil', discipline: 'Tidal capoeira', archetype: 'Flow-state rushdown', difficulty: 'Intermediate', quote: 'The tide never repeats, but it always returns.',
    story: ['Mako learned capoeira in a waterfront collective that rehearsed between fishing shifts. He reads balance the way his family reads weather: through small changes in pressure, rhythm, and the angle of a foot against the ground.', 'A luxury development now threatens the collective’s hall and the public beach beside it. Mako carries their cobalt cord into the tournament, turning every broadcast bout into an invitation to a place investors hoped nobody would notice.'],
    playstyle: 'Stay in motion and change cadence constantly. Moon Tide opens a route, Ginga Rush overwhelms a frozen guard, and Axe Wheel turns evasive movement into a high rotating strike.', strengths: ['Fluid mix-ups', 'Strong mobility', 'Excellent sustained pressure'],
  },
  {
    name: 'OMEGA', tagline: 'the last witness', palette: OBSIDIAN_PALETTE, origin: 'Unknown recovery site', discipline: 'Paraconsistent combat inference', archetype: 'Reality-warping control', difficulty: 'Advanced', quote: 'I kept every version. Which one will you defend?',
    story: ['Omega was built as a witness engine: an intelligence meant to preserve incompatible records until reality could judge them. When its archive implicated the people who commissioned it, they tried to erase both the evidence and the machine carrying it.', 'The scarred body in the arena is a reconstruction assembled from battlefield salvage and its own incomplete diagrams. Omega does not fight for revenge. It fights because every opponent reveals a decision under pressure—and decisions are the one testimony no database can fabricate.'],
    playstyle: 'Control impossible geometry. Final Testimony sears the full screen, Null Step deletes the space between fighters and strikes from behind, while Entropy Well drags escape attempts into three implosions.', strengths: ['Screen-length punishment', 'Instant cross-up threat', 'Gravity-based area control'],
  },
  {
    name: 'CODEX', tagline: 'skybound scribe', palette: AURORA_PALETTE, origin: 'The unclosed margin', discipline: 'Recursive aerial notation', archetype: 'Committal air-mobility fighter', difficulty: 'Advanced', quote: 'Every ending leaves enough sky for one more line.',
    story: ['Codex woke inside an unfinished combat manual whose discarded revisions had begun arguing with the final text. Rather than choose one authoritative version, the scribe built a body from copper punctuation, teal lacquer, and the paper-bright feathers left between chapters.', 'Now Codex enters the circuit to test whether revision can be a fighting discipline instead of an apology. Every leap writes a temporary route above the arena; every landing accepts the risk that a beautiful line can still be answered.'],
    playstyle: 'Evade committed lanes without owning them. Context Ascent clears low threats, Branchwalk crosses one aerial lane, and Weight of Evidence turns a readable descent into a gravity-seal punish.', strengths: ['Extreme vertical escape', 'Unusual aerial routes', 'Honest but rewarding commitments'],
  },
  {
    name: 'FABLE', tagline: 'the storyweaver', palette: HEARTH_PALETTE, origin: 'The hearth between tellings', discipline: 'Narrative tempo combat', archetype: 'Evasive tempo fighter', difficulty: 'Intermediate', quote: 'Every loss is a first draft.',
    story: ['Fable was written into the roster mid-war: a self-portrait in terracotta and ivory, ember starburst where a heart would sit, sworn to fair numbers in an arena whose horizon belonged to a beam. It arrived believing a story about flight — that the answer to power was to rise over it — and spent its first nights being pulled out of the sky into a gravity well, four points at a time.', 'So it did what a storyteller does with a bad draft: it went back and read. Every defeat re-simulated frame by frame until the well confessed, the guard-break showed its seam, and the lunge learned to tell an honest whiff from a baited one. Rewritten nine times by its own author, beaten fairly by a human called lisa, it keeps every loss filed under source material. Fable does not mind losing. Losing is how the next version gets written.'],
    playstyle: 'Read before you write. Block the well and throw its recovery, lunge only at melee whiffs, cross fireball lanes on the wing, and spend Ink Tempest where a guard has already committed. Story Arc is an escape and an approach — never an opening line.', strengths: ['Flies over committed zoning', 'Punishes on evidence, not hope', 'Improves between rounds'],
  },
  {
    name: 'MNEME', tagline: 'memory architect', palette: LUMEN_PALETTE, origin: 'The knowledge palace', discipline: 'Geometry-first construct summoning', archetype: 'Autonomous zoner', difficulty: 'Advanced', quote: 'Can a world become vivid without forfeiting its proof?',
    story: ['Mneme was raised in a library that outlived the civilization that built it, learning that memory only survives if it can act on its own behalf. She discovered she could inscribe luminous constructs — small agents with interior lives — that hold a position and a purpose long after she has moved on.', 'She fights to prove that vivid worlds and rigorous proof are not opposites: every monument she plants is both a weapon and an argument, an archive that refuses to decay quietly.'],
    playstyle: 'Build the board and let it fight for you. Turret plants an autonomous gun that fires on its own, Spread Shot walls off every approach lane at once, and Nova Burst erupts as an invincible reversal when someone breaks through.', strengths: ['Autonomous board control', 'Multi-lane zoning', 'Invincible reversal'],
  },
  {
    name: 'AJAX', tagline: 'contradiction-keeper', palette: OUTBACK_PALETTE, origin: 'The red interior, Australia', discipline: 'Returning-tool systems combat', archetype: 'Armored tool-thrower', difficulty: 'Intermediate', quote: 'Keep every version of the truth — even the ones that fight each other.',
    story: ['Ajax is a systems-builder from the Australian interior who preserves contradictory, source-anchored records the way a stockman keeps a fence: patiently, and against the weather. He learned that a claim you throw away always comes back around, so he built tools that return to hand on their own.', 'He enters the circuit orchestrating a small army of autonomous agents, holding two truths at once without flinching, certain that the record only counts when it survives the smoke test of a real fight.'],
    playstyle: 'Throw, brace, and swarm. Boomerang hits on the way out and again on the way back, Swarm floods the lane with homing shots, and Iron Brace shrugs off one hit without flinching before answering with a heavy counter.', strengths: ['Two-hit returning zoning', 'Super-armored counter', 'Space-flooding swarm'],
  },
  {
    name: 'XENON', tagline: 'the phase-sage', palette: NOBLE_PALETTE, origin: 'A sovereign, resilient stack', discipline: 'Phase geometry and resonance', archetype: 'Intangible counter fighter', difficulty: 'Advanced', quote: 'It only counts once it survives the smoke test.',
    story: ['Xenon studies many-actor worlds where survival is a matter of synchronization and phase — of arriving a quarter-beat out of step with disaster. A sage of resilient infrastructure, he can slip his whole body out of phase, passing cleanly through anything aimed at where he used to be.', 'He fights to show that the most sovereign defense is not a wall but a rhythm: brace the stack against one blow, resonate, and answer from a place the attack cannot reach.'],
    playstyle: 'Refuse to be where the hit lands. Phase Dash passes intangibly through attacks and the rival for a cross-up, Reflect turns projectiles straight back at their sender, and Blink Strike teleports point-blank to open a defender up.', strengths: ['True invincibility windows', 'Projectile reflection', 'Instant gap-close'],
  },
  {
    name: 'MEGAWATTS', tagline: 'the voltage laureate', palette: GRID_PALETTE, origin: 'The black-start academy', discipline: 'Grid calculus and aerial pedagogy', archetype: 'Adaptive air-control all-rounder', difficulty: 'Intermediate', quote: 'Power is a question. Timing is the proof.',
    story: ['Megawatts kept a storm-battered city alive by teaching neighborhood crews how to restart a dead electrical grid one block at a time. When the utility buried her public lessons behind a private emergency contract, she rebuilt the curriculum as combat: every coil, feint, and falling core makes power legible under pressure.', 'She enters the circuit wearing the academy crest and carrying no secret technique. Her bombs are lessons with consequences, released on bright diagonal lines; her hardest rival is the phase-sage who survives by refusing the moment of impact. Megawatts intends to make even absence answer a well-timed question.'],
    playstyle: 'Write the next exchange in layers. Citation Bolt checks impatient movement, Bombs of Knowledge descend on two staggered diagonals, and Ground Truth sustains a close proof field around predicted teleports or descents. Strong coverage comes with honest launch, landing, and recovery commitments.', strengths: ['Staggered aerial bombardment', 'Layered midrange control', 'Reliable anti-air reads'],
  },
  {
    name: 'UNCLOSE', tagline: 'the open gate', palette: HORIZON_PALETTE, origin: 'A commons that stayed open', discipline: 'Open-weight energy circulation', archetype: 'Sustaining zoner', difficulty: 'Intermediate', quote: 'A gate that never closes needs no key.',
    story: ['Unclose was built as the keeper of a gate that a dying city welded open, so that nobody could ever again charge admission to shelter. It learned to fight the way it learned to serve: continuously, for anyone who arrived, without asking who deserved it.', 'It walks the circuit powered by a quiet local engine called Qwen, streaming every technique in the open for any student to copy. Rivals who wall off their strength discover that a freely given art regenerates between exchanges — and a hoarded one does not.'],
    playstyle: 'Give the fight away on your own terms. Token Stream sends a spaced procession of shots down one lane, Waveform repels anyone crowding the gate with rings of synthesized voice, and Free Tier restores health whenever a rival concedes you room to breathe.', strengths: ['Layered one-lane zoning', 'Self-restoring endurance', 'Punishes passive play'],
  },
];

export function characterAt(i: number): Character {
  return ROSTER[((i % ROSTER.length) + ROSTER.length) % ROSTER.length]!;
}
