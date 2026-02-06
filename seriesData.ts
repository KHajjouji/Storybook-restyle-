import { SeriesPreset } from './types';

export const GLOBAL_STYLE_LOCK = `STYLE LOCK: Children’s picture-book illustration for ages 3–9. Simplified cute characters, rounded proportions, big expressive eyes, small noses and mouths, soft painterly shading, smooth gradients, warm gentle glow lighting, pastel-bright palette, clean uncluttered composition, friendly cozy mood, no photorealism, no gritty texture, no harsh contrast, minimal-to-no hard black outlines. High readability with large clear shapes. No text inside the illustration.
GLOBAL RULES: No readable text (no labels, signs, price tags, phone UI). No logos/watermarks. Keep faces consistent. Do not invent locations.`;

export const SERIES_PRESETS: SeriesPreset[] = [
  {
    id: 'story-1',
    title: 'Ramdan 9rib: mshina L aso9',
    description: 'The family visits a modern Spanish supermarket to prepare for Ramadan.',
    masterBible: `${GLOBAL_STYLE_LOCK}
LOCATION LOCK: Scenes 1-3 outside Spanish home; Scenes 4-13 inside modern Spanish supermarket. No souks.
WARDROBE LOCK (Outfit B): Mom (cream coat, light neck scarf, ponytail), Dad (navy jacket), Boy (blue hoodie + light jacket), Girl (yellow dress + pink cardigan + small jacket).`,
    characters: [
      { name: 'Mom', description: 'Spanish mother, cream coat, light neck scarf (not hijab), ponytail visible, friendly expressive face.' },
      { name: 'Dad', description: 'Moroccan father, navy jacket, jeans, warm kind eyes.' },
      { name: 'Boy', description: 'Narrator, blue hoodie, light jacket, curious and happy.' },
      { name: 'Girl', description: 'Little sister, yellow dress, pink cardigan, small light jacket, excited.' }
    ],
    scenes: [
      { id: 'S1-01', text: 'Lyum ghadi nmshiu L aso9. Ramdan 9rib, inshaAllah.', prompt: 'Spanish street outside family home. Family ready to shop. Mom holds list, Dad empty bag.', isSpread: false },
      { id: 'S1-02', text: 'Mama kat gol: "yallah n wejjdu rasna. Lebsu 7wejkum".', prompt: 'Inside home entryway. Mom adjusts children’s clothes; final check before leaving. No groceries.', isSpread: false },
      { id: 'S1-03', text: 'Mshina n t9daw.', prompt: 'Family walking together on a Spanish sidewalk in daytime. Mom holds list; Dad carries empty reusable bag.', isSpread: false },
      { id: 'S1-04', text: 'Mshina L aso9 m3a baba u mama.', prompt: 'Inside modern Spanish supermarket entrance. Dad pushes empty cart. Bright lights, wide aisles.', isSpread: true },
      { id: 'S1-05', text: 'Shrina tmar.', prompt: 'Supermarket dried fruits aisle. Mom selecting glossy dark brown dates into cart. Cart otherwise empty.', isSpread: false },
      { id: 'S1-06', text: 'Ana swwelt: "3lash tmar?"', prompt: 'Same aisle. Boy points at dates tray in cart. Mom leans down to listen warmly.', isSpread: false },
      { id: 'S1-07', text: 'Mama kat gol: "b tmar kan fatro f Ramdan."', prompt: 'Same aisle. Mom explains gently. Thought bubble (no text): plate with date and water at sunset.', isSpread: false },
      { id: 'S1-08', text: 'Shrina matesha.', prompt: 'Produce section. Mom selects red round tomatoes. Dates visible in cart.', isSpread: false },
      { id: 'S1-09', text: 'Mama: "matesha L l7rira."', prompt: 'Same spot. Mom points to tomatoes bag. Thought bubble (no text): reddish harira bowl with chickpeas.', isSpread: false },
      { id: 'S1-10', text: 'Shrina l3des u 7omms.', prompt: 'Legumes aisle. Mom holds lentils + chickpeas; Dad places into cart. Previous items visible.', isSpread: false },
      { id: 'S1-11', text: 'Mama: "Hadchi kulshi L l7rira."', prompt: 'Same aisle. Mom gestures to cart contents proudly. Kids nod.', isSpread: false },
      { id: 'S1-12', text: 'Shrina dgig, jljlan, 3sel u luz.', prompt: 'Baking aisle. Selecting flour, sesame, honey, almonds. Cart full of previous items.', isSpread: true },
      { id: 'S1-13', text: 'Mama: "hadchi L selo u L shebakia."', prompt: 'Same aisle. Mom explains. Thought bubbles (no text): sellou mound with almonds; chebakia honey rosettes.', isSpread: false }
    ]
  },
  {
    id: 'story-2',
    title: 'Video m3a Jedda',
    description: 'A cozy evening calling Grandma in Morocco to ask for recipes.',
    masterBible: `${GLOBAL_STYLE_LOCK}
LOCATION LOCK: Living room in Spain, evening cozy lamp light.
WARDROBE LOCK (Outfit A): Mom (beige sweater, denim skirt, ponytail), Dad (green hoodie), Boy (blue hoodie), Girl (yellow dress + pink cardigan).
GRANDMA RULE: Jedda appears ONLY on tablet/phone screen.`,
    characters: [
      { name: 'Mom', description: 'Beige sweater, long denim skirt, ponytail, no hijab.' },
      { name: 'Dad', description: 'Dark green hoodie, jeans.' },
      { name: 'Boy', description: 'Blue hoodie, looking at tablet.' },
      { name: 'Girl', description: 'Yellow dress, pink cardigan.' },
      { name: 'Jedda', description: 'Moroccan grandmother, friendly face, simple headscarf, visible only on screen.' }
    ],
    scenes: [
      { id: 'S2-01', text: 'Lyum Mama bghat t3yyet L lmuíma.', prompt: 'Living room, evening lamp. Mom holds tablet ready to call. Family gathers close.', isSpread: false },
      { id: 'S2-02', text: 'Kat gol: "Ramdan 9rreb. Yallah n3ayytu L muíma."', prompt: 'Mom suggests calling grandma; kids excited. Dad nods supportively.', isSpread: false },
      { id: 'S2-03', text: 'Alo muíma! labas 3lik? Twa7eshtek!', prompt: 'Tablet on stand showing smiling Jedda. Mom waves at screen. Kids lean in.', isSpread: true },
      { id: 'S2-04', text: 'Jedda: "Labas! Lhamdulah a wlidi. Ramdan mubarak!"', prompt: 'Grandma on tablet smiles with hand on chest. Family listens happily.', isSpread: false },
      { id: 'S2-05', text: 'Ana u khti golna: "Ramdan mubarak, a muíma!"', prompt: 'Kids wave excitedly at the tablet screen. Mom looks proud.', isSpread: false },
      { id: 'S2-06', text: 'Mama: "3afak, fakrini f lwesfa dial l7rira."', prompt: 'Mom holds a pen and blank notepad speaking to Jedda on screen. Kids watch.', isSpread: false },
      { id: 'S2-07', text: 'Jedda: "Matesha, le3des, krafs, 7emms… u ma3dnus."', prompt: 'Jedda on screen pointing. Table shows tomatoes, lentils, chickpeas, herbs. Mom points too.', isSpread: true },
      { id: 'S2-08', text: 'Mama: "u selo?"', prompt: 'Mom leans closer to tablet with curious expression, hands open. Kids wait.', isSpread: false },
      { id: 'S2-09', text: 'Jedda: "Khesna luz, jljlan, dgig u l3sel."', prompt: 'Showing baking ingredients on table: flour, sesame, honey, almonds. Jedda explains from screen.', isSpread: false },
      { id: 'S2-10', text: 'Jedda: "ghadda gha ndir video u nwrrik."', prompt: 'Grandma promises to teach tomorrow; family excited and relieved.', isSpread: false }
    ]
  },
  {
    id: 'story-3',
    title: 'Twjida dyal Ramdan',
    description: 'Women-only gathering to prepare traditional Ramadan sweets.',
    masterBible: `${GLOBAL_STYLE_LOCK}
LOCATION LOCK: Family home living room + kitchen only.
CAST RULE: Women-only gathering. No adult men anywhere.
WARDROBE LOCK (Outfit C): Mom (beige sweater, denim skirt, apron, ponytail), Boy (blue hoodie), Girl (yellow dress + pink cardigan).
FOOD: Sellou (sandy brown powder mound), Chebakia (honey rosettes).`,
    characters: [
      { name: 'Mom', description: 'Beige sweater, apron, ponytail.' },
      { name: 'Boy', description: 'Blue hoodie, only male child allowed.' },
      { name: 'Girl', description: 'Yellow dress, pink cardigan.' },
      { name: 'Guests', description: 'Neighbor women, mixed hijab/no-hijab.' }
    ],
    scenes: [
      { id: 'S3-01', text: 'Lyum 3endna bezaf d lkhedma.', prompt: 'Living room, big table prepared. Mom points to empty bowls. Kids curious.', isSpread: false },
      { id: 'S3-02', text: 'Jau 3endna s7abat dial Mama.', prompt: 'Home doorway. Mom welcomes women friends carrying ingredient bags/bowls. No men.', isSpread: true },
      { id: 'S3-03', text: 'Wa7da mohandisa. U wa7da f khedama f atelfaza.', prompt: 'Two women guests stand out by style: one in smart blazer; one elegant modest outfit.', isSpread: false },
      { id: 'S3-04', text: 'Kay de7ku u kay golu: "sh7al ma tshaufna".', prompt: 'Women reunion; laughing, hugs, hand-on-heart greetings. Kids smile.', isSpread: false },
      { id: 'S3-05', text: 'Tjem3u f wa7ed atabla kbira.', prompt: 'Wide shot of large table with women standing around it. Bowls ready.', isSpread: true },
      { id: 'S3-06', text: 'Kay kheltu dgig, jljlan u luz.', prompt: 'Women mixing flour, sesame, and almonds in a large bowl. Kids watch.', isSpread: false },
      { id: 'S3-07', text: 'Mama kat gol: "Hada selo."', prompt: 'Table center: plate with a mound of sandy brown sellou powder decorated with whole almonds.', isSpread: false },
      { id: 'S3-08', text: 'Men be3d kay wejjdu shebakia.', prompt: 'Women shaping raw chebakia dough into rosettes. Tray of raw flower shapes.', isSpread: false },
      { id: 'S3-09', text: 'Kay diruha f zit skhona.', prompt: 'Kitchen stove. Deep pan of bubbling oil. Woman lowers dough rosettes with tongs.', isSpread: false },
      { id: 'S3-10', text: 'Mama kat gol: "be3du shwiya!"', prompt: 'Mom protective arm holds kids back from stove. Kids wide-eyed.', isSpread: false },
      { id: 'S3-11', text: 'N9adro nshriwha, walakin kan bghiu ntjem3u…', prompt: 'Women talking warmly around trays of fried chebakia. Sense of community.', isSpread: false },
      { id: 'S3-12', text: 'Adar kat 3mar b lfar7a.', prompt: 'Wide final scene. Joyful women laughing around trays of sweets. Boy foreground smiling.', isSpread: true }
    ]
  },
  {
    id: 'story-4',
    title: 'Mama katwjed lftor',
    description: 'The whole family helps prepare the first Iftar of Ramadan.',
    masterBible: `${GLOBAL_STYLE_LOCK}
LOCATION LOCK: Home kitchen + dining room in Spain.
WARDROBE LOCK (Outfit A): Mom (beige sweater, apron), Dad (green hoodie), Boy (blue hoodie), Girl (yellow dress + pink cardigan).
FOOD LOCK: Dates, Harira (red soup, chickpeas), Batbot (round puffed bread).
SUNSET: Orange window light.`,
    characters: [
      { name: 'Mom', description: 'Beige sweater, apron, focused but happy.' },
      { name: 'Dad', description: 'Dark green hoodie, helping actively.' },
      { name: 'Boy', description: 'Blue hoodie, narrator.' },
      { name: 'Girl', description: 'Yellow dress, washing vegetables.' }
    ],
    scenes: [
      { id: 'S4-01', text: 'Lyum Mama ghadi t tyyeb lftor.', prompt: 'Kitchen, late afternoon. Counter with tomatoes, herbs, lentils. Pot on stove.', isSpread: true },
      { id: 'S4-02', text: 'Baba kay gol: "Ana ghadi n3awnek."', prompt: 'Dad offers help with friendly gesture. Mom smiles.', isSpread: false },
      { id: 'S4-03', text: 'Khti gha t ghsel lkhodra.', prompt: 'Girl washes green vegetables at the kitchen sink. Mom supervises.', isSpread: false },
      { id: 'S4-04', text: 'Baba kay 9tta3 lmatesha.', prompt: 'Dad carefully chopping tomatoes on cutting board. Kids watch.', isSpread: false },
      { id: 'S4-05', text: 'Mama kat 7ett kolshi f atanjra.', prompt: 'Mom pours chopped tomatoes, lentils, chickpeas into large pot.', isSpread: false },
      { id: 'S4-06', text: 'Mama: "Hadi hiyya l7rira."', prompt: 'Mom lifts pot lid; steam rises. Showing reddish soup. Kids impressed.', isSpread: false },
      { id: 'S4-07', text: 'N wejjdu atabla.', prompt: 'Boy helps set the table with bowls and spoons. Plate of batbot bread visible.', isSpread: false },
      { id: 'S4-08', text: 'Baba kay 7rrek b lm3el9a.', prompt: 'Dad stirs reddish harira soup with a big spoon. Mom smiles.', isSpread: false },
      { id: 'S4-09', text: 'Ri7a zwina.', prompt: 'Boy closes eyes and smiles, sniffing the air playfully. Pot simmers.', isSpread: false },
      { id: 'S4-10', text: 'Mlli addan lmghrib...', prompt: 'Dining table at sunset orange light. Tray of dates and water. Prayer cue.', isSpread: true },
      { id: 'S4-11', text: 'Ftarna b tmar.', prompt: 'Mom serves harira; dad hand on heart responding warmly. Kids eat.', isSpread: false },
      { id: 'S4-12', text: 'L7rira bnina.', prompt: 'Kids enjoy the meal; boy sips harira, girl holds batbot. Parents smile.', isSpread: false },
      { id: 'S4-13', text: 'Baba: "Ramdan kay 3llemna nkunu m3a ba3diyatna."', prompt: 'After-meal calm. Dad speaks warmly about togetherness. Table has finished bowls.', isSpread: false },
      { id: 'S4-14', text: 'Shukran Mama, Shukran Baba.', prompt: 'Boy smiles gratefully, hand on heart, looking at family. Cozy warm scene.', isSpread: false }
    ]
  }
];