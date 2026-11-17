import { readFileSync, writeFileSync, existsSync } from 'fs';
const FIX = {
'deadhang':'dead-hang','fingerboard-20-mm-edge':'dead-hang',
'facepull':'face-pull','face-pulls-with-yellow-green-band':'face-pull','pullback':'face-pull',
'long-pulley-low-row':'seated-row','long-pulley-narrow':'seated-row','seated-one-arm-cable-pulley-rows':'seated-row',
'remo-maquina-agarre-estrecho':'machine-row','remo-maquina-agarre-estrecho-supino':'machine-row','remo-alto-polea-alta':'face-pull',
'perpendicular-unilateral-landmine-row':'meadows-row','bent-over-two-arm-long-bar-row':'t-bar-row',
'horizontal-traction-isometry':'seated-row','alternative-db-gorilla-rows':'dumbbell-bent-over-row','pendelay-rows':'pendlay-row',
'side-to-side-chins':'commando-pull-up','neutral-grip-pull-ups-or-trx-rows':'neutral-grip-pull-up',
'jal-n-al-pecho-con-agarre-ancho':'wide-grip-lat-pulldown',
'benchpress-dumbbells':'dumbbell-bench-press','incline-ohp-db':'incline-dumbbell-press','supino-inclinado':'incline-bench-press',
'high-incline-smith-machine-press':'smith-incline-bench-press','dumbbell-bradford-press':'overhead-press','standing-bradford-press':'overhead-press',
'pin-ohp':'overhead-press','kreis-press-db':'arnold-press','two-arm-kettlebell-military-press':'overhead-press',
'two-arm-kettlebell-jerk':'push-press','kettlebell-seesaw-press':'arnold-press','see-saw-press-alternating-side-press':'arnold-press',
'kettlebell-halo-with-overhead-extension':'overhead-press','shoulder-dumbbell-pendular-exercise':'arm-circles',
'car-drivers':'plate-front-raise','bus-drivers':'plate-front-raise','crucifix':'reverse-snow-angel',
'one-arm-side-laterals':'single-arm-dumbbell-shoulder-press','bent-over-low-pulley-side-lateral':'rear-delt-fly','back-flyes-with-bands':'rear-delt-fly',
'standing-dumbbell-straight-arm-front-delt-raise-above-head':'front-raise',
'dumbbells-on-scott-machine':'dumbbell-preacher-curl','one-handed-kettlebell-curls':'single-arm-cable-curl',
'high-cable-cross-tricep-extention-nb':'overhead-tricep-extension','seated-bent-over-two-arm-dumbbell-triceps-extension':'overhead-tricep-extension',
'standing-bent-over-two-arm-dumbbell-triceps-extension':'overhead-tricep-extension','standing-low-pulley-one-arm-triceps-extension':'single-arm-dumbbell-tricep-extension',
'flexbar-wrist-flexion':'wrist-curl','flexbar-tyler-twist':'wrist-extension','curl-de-mu-eca-con-barra':'wrist-curl',
'exercise-band-plantarflexion':'band-calf-raise','plantarflexion-stretch-with-band':'wall-calf-stretch','ankle-dorsiflexion-rocks':'rocking-calf-raise',
'calf-raises-on-hackenschmitt-machine':'standing-calf-raise','calf-machine-shoulder-shrug':'shrug','smith-machine-behind-the-back-shrug':'shrug',
'kettlebell-one-legged-deadlift':'single-leg-romanian-deadlift','kickstand-rdl':'single-leg-romanian-deadlift','arabesque':'single-leg-romanian-deadlift',
'single-leg-lunge-with-kettlebell':'split-squat','3d-lunge-warmup':'walking-lunge','prowler-sprint':'walking-lunge','backward-drag':'walking-lunge',
'single-leg-soft-landing-holds':'single-leg-box-squat','one-half-locust':'superman','skydiver-with-arms-in-t-position':'superman',
'lying-prone-quadriceps':'standing-quad-stretch',
'floor-glider-hamstring-curls':'nordic-hamstring-curl','prone-leg-kickback-custom':'machine-glute-kickback','kneeling-kickbacks':'machine-glute-kickback','patadas-traseras':'machine-glute-kickback',
'smith-machine-stiff-legged-deadlift':'romanian-deadlift','atlas-stones':'deadlift','atlas-stone-trainer':'deadlift','circus-bell':'deadlift','conan-s-wheel':'deadlift',
'rickshaw-carry':'farmer-carry','hercules-pillars':'farmer-carry','sled-drag-harness':'walking',
'balance-board':'single-leg-box-squat','box-squat-with-chains':'squat','rocket-jump':'squat','stride-jump-crossover':'squat','butchers-block-stretch':'toe-touch',
'hip-out-and-hip-in-lateral-steps':'banded-lateral-walk','climbmill':'stair-climber','bicycling-stationary':'assault-bike',
'cocoons':'v-up','otis-up':'v-up','roll-overs-into-v-sits':'v-up','splinter-sit-ups':'v-up','suspended-fallout':'ab-wheel',
'bent-knee-hip-raise':'captains-chair-knee-raise','knee-hip-raise-on-parallel-bars':'captains-chair-knee-raise','feet-assisted-straight-bar-support':'captains-chair-knee-raise',
'abdominal-draw-in':'plank','plank-to-elbow-extension':'plank','incline-plank-with-alternate-floor-touch':'plank-shoulder-tap',
'cable-woodchoppers':'russian-twist','rotary-torso-machine':'russian-twist','seated-corkscrew':'russian-twist','medicine-ball-scoop-throw':'russian-twist',
'bosu-ball-cable-crunch-with-side-bends':'ball-side-bend','one-arm-high-pulley-cable-side-bends':'dumbbell-side-bend',
'london-bridges':'barbell-glute-bridge','physioball-hip-bridge':'single-leg-glute-bridge','90-90-hip-switches':'butterfly-stretch','happy-baby':'dead-bug',
'anterior-tibialis-smr':'wall-calf-stretch','peroneals-smr':'wall-calf-stretch','foot-smr':'wall-calf-stretch','foam-roller-anterior-tibialis':'wall-calf-stretch','posterior-tibialis-stretch':'wall-calf-stretch','shinbox-ir-stretch':'wall-calf-stretch',
'brachialis-smr':'cross-body-shoulder-stretch','quadriceps-smr':'standing-quad-stretch','iliotibial-tract-smr':'side-lying-leg-raise','latissimus-dorsi-smr':'childs-pose',
'lower-back-smr':'cat-cow-stretch','rhomboids-smr':'cat-cow-stretch','neck-smr':'childs-pose','piriformis-smr':'butterfly-stretch','blackroll':'cat-cow-stretch',
'intermediate-groin-stretch':'butterfly-stretch','groiners':'worlds-greatest-stretch','adductor-rock-backs':'cat-cow-stretch','adductor-groin':'butterfly-stretch',
'bent-knee-iron-cross':'worlds-greatest-stretch','1-2-kneeling-thoracic-rotation':'cat-cow-stretch','quadruped-thoracic-rotation-left':'cat-cow-stretch','quadruped-thoracic-rotation-right':'cat-cow-stretch',
'side-laying-interior-rotation':'cable-internal-rotation','shoulder-dislocates':'band-pull-apart','serratus-wall-slide-stretch':'scapular-push-up',
'prone-scapular-retraction-arms-at-side':'reverse-snow-angel','upper-back-leg-grab':'worlds-greatest-stretch','lento-avanti-seduto':'toe-touch','standing-pancake':'toe-touch','toe-touchers':'toe-touch',
'isometria-alle-parallele':'captains-chair-knee-raise','wall-hold-rotation':'pallof-press',
'talons-fesses':'running','elephant-walks':'walking','carioca-quick-step':'running','side-hop-sprint':'lateral-lunge','single-cone-sprint-drill':'running',
'black-widow-knee-slides':'mountain-climber','schwimmen':'swimming','exhale-and-body-position-swim-drill':'swimming','side-kick-breathing-kickboard':'swimming','kick-with-board':'swimming','stroke-and-roll-drill':'swimming','recovery-bobbing':'swimming','bobbing-exhale-drill':'swimming',
'rest-for-timed-workouts':'childs-pose','guided-or-free-meditation':'childs-pose','gentle-reverse-kegels':'childs-pose',
'radio-taiso':'arm-circles','claps-over-the-head':'arm-circles','moving-claw-series':'arm-circles','power-partials':'bicep-curl','pendular-hack':'arm-circles',
'quadriped-arm-and-leg-raise':'bird-dog','ywts':'prone-y-raise','hyper-y-w-combo':'prone-y-raise','trap-3-raise':'prone-y-raise','trx-rings-y-raise':'prone-y-raise',
'vpushup':'pike-push-up','suspended-crossess':'cable-fly','low-cable-cross-over-nb':'cable-fly','omni-cable-cross-over':'cable-fly','bodyweight-flyes':'cable-fly',
'two-arm-kettlebell-clean':'push-press','kettlebell-pirate-ships':'push-press','bottoms-up-clean-from-the-hang-position':'overhead-press',
'spell-caster':'landmine-press','isometric-chest-squeezes':'pec-deck','neck-cars':'childs-pose','seated-head-harness-neck-resistance':'plank',
'linear-3-part-start-technique':'running','pyramid':'childs-pose','shoulder-y-pull-cable':'band-pull-apart','ice-cream-maker':'l-sit-hold','military-press-mit-sz-bar':'overhead-press',
'seated-dumbbell-palms-down-wrist-curl':'wrist-extension','seated-dumbbell-palms-up-wrist-curl':'wrist-curl','seated-one-arm-dumbbell-palms-down-wrist-curl':'wrist-extension',
'seated-one-arm-dumbbell-palms-up-wrist-curl':'wrist-curl','seated-palm-up-barbell-wrist-curl':'wrist-curl','seated-palms-down-barbell-wrist-curl':'wrist-extension',
'seated-two-arm-palms-up-low-pulley-wrist-curl':'wrist-curl','standing-palms-up-barbell-behind-the-back-wrist-curl':'wrist-curl','sled-overhead-backward-walk':'walking',
'hammercurls-on-cable':'rope-hammer-curl','barbell-curls-lying-against-an-incline':'spider-curl','isometric-wrist-rising-hold':'wrist-curl','dumbbell-wrist-rising':'wrist-curl','kettlebell-wrist-turnover':'wrist-extension','isometric-dumbbell-pronation-hold':'wrist-curl','cable-cupping':'wrist-curl','bronco':'squat-thrust','medicine-ball-booklet-crunch':'weighted-crunch','shoulder-width-three-point-push-up':'wide-push-up'
};
let src = readFileSync('src/lib/workout/exercise-art-map.ts','utf8');
let n = 0; const missed = [];
for (const [slug, art] of Object.entries(FIX)) {
  if (!existsSync('public/exercise-art/' + art + '.txt')) missed.push('NOART ' + art);
  const re = new RegExp('(  "' + slug + '": ")[a-z0-9-]+(")');
  if (re.test(src)) { src = src.replace(re, '$1' + art + '$2'); n++; }
  else missed.push('NOKEY ' + slug);
}
writeFileSync('src/lib/workout/exercise-art-map.ts', src);
console.log('fixed', n, '| missed:', missed.join(', ') || 'none');
