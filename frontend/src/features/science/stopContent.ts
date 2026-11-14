/**
 * Display content for the science stop cards, keyed by the mission's stop and base ids.
 * Frontend only: nothing here is sent to the planner or shared with the backend.
 * Images are NASA/JPL public images, cropped and stored in public/images/stops (see public/images/CREDITS.md).
 */

export interface SourceLink {
  label: string
  url: string
}

export interface StopContent {
  image: {
    src: string
    alt: string
    credit: string
    /** NASA page for the original image. */
    page: string
    /** CSS object-position for the cover crop in the inspector header. */
    position?: string
  }
  /** Overrides the mission's observation objective in the card, when set. */
  objective?: string
  /** Short plain-language points. */
  points: string[]
  sources: SourceLink[]
}

const CREDIT = 'NASA/JPL-Caltech/ASU/MSSS'
const image = (name: string) => `${import.meta.env.BASE_URL}images/stops/${name}.webp`

const SOURCES = {
  arrivesAtDelta: { label: 'NASA, "Perseverance Rover Arrives at Delta for New Science Campaign" (2022)', url: 'https://www.jpl.nasa.gov/news/nasas-perseverance-rover-arrives-at-delta-for-new-science-campaign/' },
  completesDepot: { label: 'NASA, "Perseverance Rover Completes Mars Sample Depot" (2023)', url: 'https://www.jpl.nasa.gov/news/nasas-perseverance-rover-completes-mars-sample-depot/' },
  williams: { label: 'Williams et al., LPSC 2023 (Delta Front overview)', url: 'https://ntrs.nasa.gov/api/citations/20230000588/downloads/Williams%20et%20al_LPSC%202023%20Delta%20Front%20Overview%20abstract_v5.pdf' },
  stack: { label: 'Stack et al., LPSC 2023 (delta front sedimentology)', url: 'https://ntrs.nasa.gov/api/citations/20230000582/downloads/Stacketal_DeltaFront_Sedstrat_LPSC2023_v4.pdf' },
  amalik: { label: 'NASA, "Perseverance Activities at Amalik Outcrop" (2022)', url: 'https://science.nasa.gov/blog/perseverance-activities-at-amalik-outcrop/' },
  russell: { label: 'Russell et al., LPSC 2023 (RIMFAX)', url: 'https://ntrs.nasa.gov/api/citations/20230000557/downloads/Russelletal_LPSC2023_DeltaCraterFloorContactRimfax-submit.pdf' },
  benison: { label: 'Benison et al., JGR Planets 2024', url: 'https://doi.org/10.1029/2023JE008155' },
  broz: { label: 'Broz et al., JGR Planets (Purdue news release, April 2025)', url: 'https://www.eaps.purdue.edu/news/articles/2025/0417_hogwallow_broz.html' },
  mangold: { label: 'Mangold et al., Science 2021', url: 'https://doi.org/10.1126/science.abl4051' },
  caravaca: { label: 'Caravaca et al., JGR Planets 2024', url: 'https://doi.org/10.1029/2023JE008205' },
} satisfies Record<string, SourceLink>

export const stopContent: Record<string, StopContent> = {
  'three-forks-base': {
    image: {
      src: image('three-forks-base'),
      alt: 'Rover tracks and a sample tube on flat ground at the Three Forks sample depot, with a butte on the horizon.',
      credit: CREDIT,
      page: 'https://science.nasa.gov/photojournal/perseverances-portrait-of-the-sample-depot/',
      position: '50% 40%',
    },
    points: [
      'Named for the spot where three route options up to the delta meet.',
      'Perseverance left a backup set of 10 sample tubes here between December 2022 and January 2023, each 5–15 m apart.',
      'The delta rises about 40 m above this flat ground.',
    ],
    sources: [SOURCES.arrivesAtDelta, SOURCES.completesDepot],
  },
  'cape-nukshak': {
    image: {
      src: image('cape-nukshak'),
      alt: 'The front of the Jezero delta below the crater wall, seen across the crater floor.',
      credit: CREDIT,
      page: 'https://science.nasa.gov/photojournal/jezero-craters-delta-is-getting-closer/',
      position: '50% 55%',
    },
    points: [
      'The western lobe of the delta front, where the lowest delta layers are exposed.',
      'Alternating sandstone and siltstone, laid down underwater by dense, sediment-laden flows into the lake.',
      'Perseverance cored two samples here, "Shuyak" and "Mageik", in 2022.',
    ],
    sources: [SOURCES.williams, SOURCES.stack, SOURCES.amalik, SOURCES.russell],
  },
  'hawksbill-gap': {
    image: {
      src: image('hawksbill-gap'),
      alt: 'Light-toned, fine-grained rock slabs of Hogwallow Flats.',
      credit: CREDIT,
      page: 'https://science.nasa.gov/photojournal/perseverances-mastcam-z-views-hogwallow-flats/',
    },
    objective: 'Compare the layers on both sides of the gap and find the light-toned, sulfate-rich siltstone.',
    points: [
      'The notch Perseverance used to climb the delta.',
      '"Hogwallow Flats" here is a fine-grained, sulfate-rich rock that scientists rank as high priority for returning to Earth.',
      'At its base, loose material — wind-blown sand and debris from the delta front — hides the contact with the crater floor.',
    ],
    sources: [SOURCES.completesDepot, SOURCES.benison, SOURCES.broz, SOURCES.russell],
  },
  'kodiak-butte': {
    image: {
      src: image('kodiak-butte'),
      alt: 'Kodiak butte, a flat-topped hill with tilted layers, in front of the delta scarp.',
      credit: CREDIT,
      page: 'https://science.nasa.gov/photojournal/perseverance-captures-image-of-kodiak/',
      position: '50% 45%',
    },
    objective: 'From the viewpoint, trace the tilted delta layers and where they flatten out.',
    points: [
      'An isolated piece of the delta, about 1 km south of the main fan.',
      'Its layers show a classic river delta building into a standing lake.',
      'They record the lake level rising and falling by 5–10 m at least four times.',
    ],
    sources: [SOURCES.mangold, SOURCES.caravaca],
  },
}
