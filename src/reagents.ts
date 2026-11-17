// Note: icon[2] === 'main' means assets/icons.png, icon[2] === 'custom' means assets/updatedSpriteSheet.png, icon[2] === 'garden' means assets/gardenPlants.png
// icon[0] is column count, icon[1] is row count, 0-indexed, top left is (0, 0), tile size is 48px*48px
export interface ReagentType {
    id: string;
    name: string;
    icon: [number, number, 'main' | 'custom' | 'garden'];
    flavor: string;
    gather: string;
    dropChance: number;
    unlocked?: boolean;
}
const REAGENTS: ReagentType[] = [
    {
        id: 'nectar_of_effort',
        name: "Nectar of Effort",
        icon: [11, 25, 'custom'],
        flavor: "Your hard work, rendered into a golden liquid. Somehow still unpaid, but you are having fun right?",
        gather: "Clicking the big cookie will sometimes reward you with the nectar of effort.",
        dropChance: 0.008,
        unlocked: true
    },
    {
        id: 'dragon_scales',
        name: "Dragon Scales",
        icon: [30, 14, 'main'],
        flavor: "Gathering dragon scales is risky business, but you are pretty sure Krumblor is your friend.",
        gather: "Vigorously petting your dragon has a chance to break off a scale.",
        dropChance: 0.02,
        unlocked: true
    },
    {
        id: 'golden_flour',
        name: "Golden Flour",
        icon: [2, 33, 'main'],
        flavor: "Shed from the shimmer of the elusive golden cookie. A fleeting but potent ingredient.",
        gather: "Golden cookies will occasionally leave behind some of their special flour when collected.",
        dropChance: 0.12,
        unlocked: true
    },
    {
        id: 'captured_auroras',
        name: "Captured Auroras",
        icon: [17, 16, 'custom'],
        flavor: "Captured Auroras!? At this time of year, at this time of day, in this part of the country, localized entirely within your vial!? May I see them?",
        gather: "Swap dragon auras for a chance to capture an aurora.",
        dropChance: 0.38,
    },
    {
        id: 'divine_extraction',
        name: "Divine Extraction",
        icon: [14, 12, 'custom'],
        flavor: "The holy residue of celestial paperwork.",
        gather: "Swap gods in the Pantheon for a chance to capture some divine extraction.",
        dropChance: 0.38,
    },
    {
        id: 'rabbit_feet',
        name: "Rabbit's Foot",
        icon: [13, 25, 'custom'],
        flavor: "Lucky for you, unlucky for at least one rabbit.",
        gather: "Collected by clicking on rabbit cookies during Easter.",
        dropChance: 0.15,
    },
    {
        id: 'cats_whiskers',
        name: "Cat's Whiskers",
        icon: [32, 3, 'main'],
        flavor: "Nine lives worth of mystical sensitivity, compressed into a tight bundle of strands.",
        gather: "Found on some spooky kitten cookies during the Halloween season.",
        dropChance: 0.15,
    },
    {
        id: 'culture_of_time',
        name: "Culture of Time",
        icon: [16, 6, 'main'],
        flavor: "Aged for several seconds over many years, or for several years in a few seconds. It's getting really hard to keep track.",
        gather: "Culture of time is found by advancing through seasons, naturally or artificially. It may also randomly appear as time passes.",
        dropChance: 0.25, //also randomly 1 in 60000 seconds or so.
    },
    {
        id: 'pure_cane_sugar',
        name: "Pure Cane Sugar",
        icon: [29, 16, 'main'],
        flavor: "Crystalline sweetness harvested from the source. Pure and unrefined.",
        gather: "Gain or spend sugar lumps through any manner for a chance to find pure cane sugar.",
        dropChance: 0.65,
    },
    {
        id: 'reindeer_fur',
        name: "Tuft of Reindeer Fur",
        icon: [12, 25, 'custom'],
        flavor: "Obtenu à partir de rennes, comme lors du combat dit Lumeçon du Doudou.",
        gather: "Each reindeer you find will have a chance to leave you with a tuft of their magical fur.",
        dropChance: 0.18,
    },
    {
        id: 'distilled_greed',
        name: "Distilled Greed",
        icon: [16, 14, 'custom'],
        flavor: "It is rumored it can also be obtained by squeezing billionaires in a vice over a cup.",
        gather: "Hire brokers, buy, or sell stocks in the Stock Market for a chance to collect distilled greed.",
        dropChance: 0.0003,
    },
    {
        id: 'sample_of_goo',
        name: "Sample of Goo",
        icon: [15, 8, 'main'],
        flavor: "Formerly part of a wrinkler, currently part of alchemy, which is like science.",
        gather: "Each wrinkler popped has a chance to leave behind a sample of, well lets just say \'goo\'.",
        dropChance: 0.08,
    },
    {
        id: 'wrath_sugar',
        name: "Wrath Sugar",
        icon: [14, 25, 'custom'],
        flavor: "Sweet, bitter, and slightly judgmental about your frequency of phone calls.",
        gather: "Wrath cookies will occasionally leave behind the deep red sugar used in their baking.",
        dropChance: 0.17,
    },
    {
        id: 'magical_blight',
        name: "Magical Blight",
        icon: [18, 6, 'main'],
        flavor: "The scorched residue of a spell gone wrong. At least there was a silver lining.",
        gather: "Experience spell backfires in Grimoire for a chance to capture pure magical blight.",
        dropChance: 0.4,
    },
    {
        id: 'magical_infusion',
        name: "Magical Infusion",
        icon: [14, 16, 'custom'],
        flavor: "By Merlin's shiny beard!",
        gather: "Successfully cast spells in Grimoire for a chance to harvest magical infusion.",
        dropChance: 0.18,
    },
    {
        id: 'terra',
        name: "Terra",
        icon: [0, 34, 'garden'],
        flavor: "Skeptics will call it just dirt, but you need to find dirt with high aspirations.",
        gather: "Harvesting mature plants and changing soil will leave you with terra.",
        dropChance: 0.03,
    },
    {
        id: 'flower_petals',
        name: "Flower Petals",
        icon: [4, 13, 'garden'],
        flavor: "Pressed petals from the garden's most benevolent blooms.",
        gather: "Found by harvesting mature Shimmerlily, Nursetulip, Chimrose, Everdaisy, or any clover variant in the Garden, or by finding lanterns in Lunar New Year.",
        dropChance: 0.07,
    },
    {
        id: 'roots',
        name: "Roots",
        icon: [0, 19, 'garden'],
        flavor: "Gnarled tubers that pulse with subterranean cookie energy.",
        gather: "Found by harvesting mature Chocoroots, Queenbeets, or Duketater in the Garden.",
        dropChance: 0.11,
    },
    {
        id: 'fungus_culture',
        name: "Fungus Culture",
        icon: [14, 24, 'custom'],
        flavor: "It has opinions now, rudimentary as they might be.",
        gather: "Found by harvesting any mature fungus in the Garden.",
        dropChance: 0.03,
    },
    {
        id: 'immortal_essence',
        name: "Immortal Essence",
        icon: [19, 7, 'main'],
        flavor: "Distilled from a plant that refused to die. Does harvesting it kill it? The question remains eternal.",
        gather: "Found by harvesting any mature immortal plant in the Garden, or from completeing a Clone Escape scenario.",
        dropChance: 0.25,
    },
    {
        id: 'extract_of_entrepreneurship',
        name: "Extract of Entrepreneurship",
        icon: [17, 6, 'main'],
        flavor: "Has also been called concentrate of hustle.",
        gather: "Performing any actions in the Downline or clipping Black Friday coupons has a chance to reward you with extract of entrepreneurship.",
        dropChance: 0.10,
    },
    {
        id: 'technojuice',
        name: "Technojuice",
        icon: [20, 24, 'custom'],
        flavor: "Compiled from caffeine and regrettable life choices.",
        gather: "Run programs in the Terminal for a chance to find pure technojuice.",
        dropChance: 0.30,
    }
];
export default REAGENTS;
export enum Reagent {
    NECTAR_OF_EFFORT = 0,
    DRAGON_SCALES = 1,
    GOLDEN_FLOUR = 2,
    CAPTURED_AURORAS = 3,
    DIVINE_EXTRACTION = 4,
    RABBITS_FOOT = 5,
    CATS_WHISKERS = 6,
    CULTURE_OF_TIME = 7,
    PURE_CANE_SUGAR = 8,
    TUFT_OF_REINDEER_FUR = 9,
    DISTILLED_GREED = 10,
    SAMPLE_GOO = 11,
    WRATH_SUGAR = 12,
    MAGICAL_BLIGHT = 13,
    MAGICAL_INFUSION = 14,
    TERRA = 15,
    FLOWER_PETALS = 16,
    ROOTS = 17,
    FUNGNUS_CULTURE = 18,
    IMMORTAL_ESSENCE = 19,
    EXTRACT_OF_ENTREPRENEURSHIP = 20,
    TECHNOJUICE = 21
}
export const ReagentCount = 22;
export const ReagentsSortedFromEasyToHard: Reagent[] = [
    Reagent.NECTAR_OF_EFFORT,
    Reagent.DRAGON_SCALES,
    Reagent.CAPTURED_AURORAS,
    Reagent.DISTILLED_GREED,
    Reagent.SAMPLE_GOO,
    Reagent.CULTURE_OF_TIME,
    Reagent.GOLDEN_FLOUR,
    Reagent.WRATH_SUGAR,
    Reagent.TERRA,
    Reagent.FLOWER_PETALS,
    Reagent.ROOTS,
    Reagent.IMMORTAL_ESSENCE,
    Reagent.FUNGNUS_CULTURE,
    Reagent.CATS_WHISKERS,
    Reagent.RABBITS_FOOT,
    Reagent.DIVINE_EXTRACTION,
    Reagent.TECHNOJUICE,
    Reagent.MAGICAL_INFUSION,
    Reagent.MAGICAL_BLIGHT,
    Reagent.TUFT_OF_REINDEER_FUR,
    Reagent.EXTRACT_OF_ENTREPRENEURSHIP,
    Reagent.PURE_CANE_SUGAR
];

/** How the player wants the solver to prioritize a reagent. */
export type ReagentPreference = 'preferred' | 'neutral' | 'avoid';

/** Display/interaction order of the three preference classifications. */
export const REAGENT_PREFERENCES: readonly ReagentPreference[] = [
    'preferred',
    'neutral',
    'avoid'
];

export const DEFAULT_REAGENT_PREFERENCE: ReagentPreference = 'neutral';

/**
 * Partitions {@link ReagentsSortedFromEasyToHard} by preference while keeping
 * the easy-to-hard order inside each group. This is the reagent order the
 * solver uses to pick recommendations: preferred first, then neutral, then
 * avoid.
 */
export function sortReagentsByPreference(
    preferences: readonly ReagentPreference[]
): Reagent[] {
    const groups: Record<ReagentPreference, Reagent[]> = {
        preferred: [],
        neutral: [],
        avoid: []
    };
    for (const reagent of ReagentsSortedFromEasyToHard) {
        const preference = preferences[reagent] ?? DEFAULT_REAGENT_PREFERENCE;
        groups[preference].push(reagent);
    }
    return [...groups.preferred, ...groups.neutral, ...groups.avoid];
}