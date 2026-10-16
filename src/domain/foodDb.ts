/**
 * Bundled food database used to estimate nutrition from free-text food descriptions.
 * Values are typical home-style preparations per 100 g (cooked where relevant), compiled from
 * IFCT 2017 / USDA FoodData Central ballpark figures. They are estimates and always shown as such.
 */

export interface FoodRef {
  id: string;
  name: string;
  aliases: string[];
  /** per 100 g: kcal, protein, carbs, fat, fiber */
  per100: [number, number, number, number, number];
  /** grams per household unit for this food */
  units: Record<string, number>;
  defaultUnit: string;
  tags?: ('veg' | 'egg' | 'meat' | 'fish' | 'vegan' | 'dairy')[];
}

/** Generic unit weights when a food doesn't define its own. */
export const GENERIC_UNITS: Record<string, number> = {
  g: 1,
  kg: 1000,
  ml: 1,
  l: 1000,
  katori: 150,
  bowl: 200,
  cup: 240,
  glass: 250,
  plate: 250,
  tbsp: 15,
  tsp: 5,
  handful: 30,
  slice: 30,
  piece: 50,
  scoop: 30,
  serving: 150,
  can: 330,
  packet: 50,
};

const F = (
  id: string,
  name: string,
  aliases: string[],
  per100: FoodRef['per100'],
  units: Record<string, number>,
  defaultUnit: string,
  tags: FoodRef['tags'] = ['veg'],
): FoodRef => ({ id, name, aliases, per100, units, defaultUnit, tags });

const vegan: FoodRef['tags'] = ['veg', 'vegan'];
const dairy: FoodRef['tags'] = ['veg', 'dairy'];
const egg: FoodRef['tags'] = ['egg'];
const meat: FoodRef['tags'] = ['meat'];
const fish: FoodRef['tags'] = ['fish'];

export const FOODS: FoodRef[] = [
  // ---- Indian breads
  F('roti', 'Roti / chapati', ['roti', 'rotis', 'chapati', 'chapatis', 'chapathi', 'phulka', 'fulka'], [270, 9, 52, 4, 6], { piece: 40, roti: 40 }, 'piece', vegan),
  F('paratha', 'Plain paratha', ['paratha', 'parathas', 'parantha'], [326, 7, 45, 13, 5], { piece: 80 }, 'piece'),
  F('aloo_paratha', 'Aloo paratha', ['aloo paratha', 'alu paratha', 'potato paratha'], [290, 6, 40, 12, 4], { piece: 120 }, 'piece'),
  F('paneer_paratha', 'Paneer paratha', ['paneer paratha'], [300, 10, 35, 14, 3], { piece: 120 }, 'piece', dairy),
  F('thepla', 'Thepla', ['thepla', 'theplas'], [300, 8, 42, 11, 5], { piece: 40 }, 'piece'),
  F('naan', 'Naan', ['naan', 'nan', 'butter naan'], [290, 9, 50, 6, 2], { piece: 90 }, 'piece', dairy),
  F('puri', 'Puri', ['puri', 'puris', 'poori'], [390, 7, 45, 20, 3], { piece: 25 }, 'piece', vegan),
  F('bhatura', 'Bhatura', ['bhatura', 'bhature'], [330, 7, 45, 14, 2], { piece: 80 }, 'piece'),
  F('pav', 'Pav', ['pav', 'pao', 'bun'], [280, 8, 50, 5, 2], { piece: 40 }, 'piece'),
  F('besan_chilla', 'Besan chilla', ['besan chilla', 'chilla', 'cheela', 'besan cheela'], [180, 8, 20, 7, 4], { piece: 80 }, 'piece', vegan),
  F('moong_chilla', 'Moong dal chilla', ['moong chilla', 'moong dal chilla', 'pesarattu'], [160, 9, 20, 5, 4], { piece: 80 }, 'piece', vegan),
  // ---- Rice dishes
  F('rice', 'Steamed rice', ['rice', 'white rice', 'chawal', 'steamed rice', 'plain rice', 'boiled rice'], [130, 2.7, 28, 0.3, 0.4], { katori: 150, cup: 160, plate: 250, bowl: 200 }, 'katori', vegan),
  F('brown_rice', 'Brown rice', ['brown rice'], [112, 2.6, 23.5, 0.9, 1.8], { katori: 150, cup: 195, bowl: 200 }, 'katori', vegan),
  F('jeera_rice', 'Jeera rice', ['jeera rice', 'cumin rice'], [160, 3, 28, 4, 0.6], { katori: 150, plate: 250 }, 'katori'),
  F('veg_pulao', 'Veg pulao', ['pulao', 'pulav', 'veg pulao'], [145, 3, 24, 4, 1.5], { katori: 150, plate: 250 }, 'plate'),
  F('chicken_biryani', 'Chicken biryani', ['chicken biryani', 'biryani', 'biriyani'], [180, 9, 20, 7, 1], { plate: 350, katori: 150 }, 'plate', meat),
  F('mutton_biryani', 'Mutton biryani', ['mutton biryani'], [200, 9, 20, 9, 1], { plate: 350 }, 'plate', meat),
  F('veg_biryani', 'Veg biryani', ['veg biryani', 'vegetable biryani'], [150, 3.5, 23, 5, 2], { plate: 300 }, 'plate'),
  F('khichdi', 'Khichdi', ['khichdi', 'khichri', 'kichdi'], [120, 4.5, 20, 2.5, 2], { katori: 200, plate: 300, bowl: 250 }, 'katori'),
  F('curd_rice', 'Curd rice', ['curd rice', 'thayir sadam', 'dahi chawal'], [120, 3, 18, 3.5, 0.5], { katori: 200, plate: 250 }, 'katori', dairy),
  F('lemon_rice', 'Lemon rice', ['lemon rice'], [170, 3, 28, 5, 1], { katori: 150, plate: 250 }, 'plate', vegan),
  F('fried_rice', 'Fried rice', ['fried rice', 'veg fried rice'], [170, 4, 25, 6, 1], { plate: 250, katori: 150 }, 'plate'),
  // ---- Dals & curries
  F('dal', 'Dal (toor/moong)', ['dal', 'daal', 'dhal', 'toor dal', 'arhar dal', 'moong dal', 'masoor dal', 'yellow dal', 'dal tadka', 'dal fry'], [110, 6, 15, 3, 3], { katori: 150, bowl: 200, cup: 240 }, 'katori', vegan),
  F('dal_makhani', 'Dal makhani', ['dal makhani', 'maa ki dal'], [140, 5.5, 14, 7, 4], { katori: 150 }, 'katori', dairy),
  F('rajma', 'Rajma', ['rajma', 'kidney bean curry', 'rajma masala'], [130, 6, 18, 4, 5], { katori: 150 }, 'katori', vegan),
  F('chole', 'Chole / chana masala', ['chole', 'chana masala', 'chickpea curry', 'chana', 'channa'], [150, 6.5, 20, 5, 6], { katori: 150 }, 'katori', vegan),
  F('sambar', 'Sambar', ['sambar', 'sambhar'], [65, 3, 9, 2, 2.5], { katori: 150, bowl: 200 }, 'katori', vegan),
  F('rasam', 'Rasam', ['rasam'], [35, 1, 5, 1.5, 0.8], { katori: 150, cup: 200 }, 'katori', vegan),
  F('kadhi', 'Kadhi', ['kadhi', 'kadi'], [90, 3, 8, 5, 0.5], { katori: 150 }, 'katori', dairy),
  F('mixed_veg', 'Mixed veg sabzi', ['sabzi', 'sabji', 'subzi', 'mixed veg', 'mix veg', 'vegetable curry', 'veg curry', 'bhaji', 'mixed vegetable'], [90, 2.5, 9, 5, 3], { katori: 150, bowl: 200 }, 'katori', vegan),
  F('aloo_sabzi', 'Aloo sabzi', ['aloo sabzi', 'aloo', 'potato sabzi', 'aloo curry', 'potato curry', 'jeera aloo'], [120, 2, 15, 6, 2], { katori: 150 }, 'katori', vegan),
  F('aloo_gobi', 'Aloo gobi', ['aloo gobi', 'gobi', 'cauliflower sabzi'], [110, 2.5, 12, 6, 3], { katori: 150 }, 'katori', vegan),
  F('bhindi', 'Bhindi sabzi', ['bhindi', 'okra', 'bhindi masala'], [100, 2.5, 9, 6.5, 4], { katori: 150 }, 'katori', vegan),
  F('baingan', 'Baingan bharta', ['baingan', 'baingan bharta', 'brinjal', 'eggplant'], [100, 2, 9, 7, 3.5], { katori: 150 }, 'katori', vegan),
  F('cabbage', 'Cabbage sabzi', ['cabbage', 'patta gobi', 'cabbage sabzi'], [70, 2, 8, 3.5, 2.5], { katori: 150 }, 'katori', vegan),
  F('palak_paneer', 'Palak paneer', ['palak paneer', 'saag paneer'], [150, 7, 6, 11, 2], { katori: 150 }, 'katori', dairy),
  F('matar_paneer', 'Matar paneer', ['matar paneer', 'mutter paneer'], [180, 8, 10, 12, 3], { katori: 150 }, 'katori', dairy),
  F('paneer_butter_masala', 'Paneer butter masala', ['paneer butter masala', 'paneer makhani', 'shahi paneer', 'kadai paneer'], [230, 8, 9, 18, 1.5], { katori: 150 }, 'katori', dairy),
  F('paneer_bhurji', 'Paneer bhurji', ['paneer bhurji'], [220, 13, 6, 16, 1], { katori: 150, plate: 200 }, 'katori', dairy),
  F('paneer', 'Paneer', ['paneer', 'cottage cheese'], [265, 18, 3.5, 20, 0], { piece: 20, cube: 20, katori: 100 }, 'g', dairy),
  F('paneer_tikka', 'Paneer tikka', ['paneer tikka'], [230, 15, 5, 17, 1], { piece: 30, plate: 200 }, 'piece', dairy),
  F('tofu', 'Tofu', ['tofu'], [76, 8, 1.9, 4.8, 0.3], { piece: 85, katori: 120 }, 'g', vegan),
  F('soya_chunks', 'Soya chunks (dry)', ['soya chunks', 'soya', 'soy chunks', 'nutrela'], [345, 52, 33, 0.5, 13], { handful: 25, cup: 50, katori: 50 }, 'g', vegan),
  F('sprouts', 'Sprouts salad', ['sprouts', 'moong sprouts', 'sprout salad'], [90, 6, 14, 1, 4], { katori: 100, bowl: 150 }, 'katori', vegan),
  // ---- Non-veg curries
  F('chicken_curry', 'Chicken curry', ['chicken curry', 'chicken masala', 'chicken gravy'], [150, 14, 4, 9, 1], { katori: 150, bowl: 200, piece: 60 }, 'katori', meat),
  F('butter_chicken', 'Butter chicken', ['butter chicken', 'chicken makhani'], [180, 13, 6, 12, 1], { katori: 150 }, 'katori', meat),
  F('chicken_breast', 'Chicken breast (grilled)', ['chicken breast', 'grilled chicken', 'boiled chicken', 'chicken'], [165, 31, 0, 3.6, 0], { piece: 120 }, 'g', meat),
  F('tandoori_chicken', 'Tandoori chicken', ['tandoori chicken', 'chicken tandoori'], [150, 23, 3, 5, 0.5], { piece: 120 }, 'piece', meat),
  F('chicken_tikka', 'Chicken tikka', ['chicken tikka'], [150, 25, 3, 5, 0.5], { piece: 30, plate: 200 }, 'piece', meat),
  F('mutton_curry', 'Mutton curry', ['mutton curry', 'mutton', 'lamb curry', 'goat curry'], [200, 15, 4, 14, 1], { katori: 150 }, 'katori', meat),
  F('keema', 'Keema', ['keema', 'kheema', 'mince'], [230, 16, 5, 16, 1.5], { katori: 150 }, 'katori', meat),
  F('fish_curry', 'Fish curry', ['fish curry', 'fish'], [120, 13, 4, 6, 0.5], { katori: 150, piece: 80 }, 'katori', fish),
  F('fish_fry', 'Fish fry', ['fish fry', 'fried fish'], [220, 20, 6, 13, 0.3], { piece: 80 }, 'piece', fish),
  F('salmon', 'Salmon (cooked)', ['salmon'], [206, 22, 0, 12, 0], { piece: 150 }, 'g', fish),
  F('tuna', 'Tuna (canned in water)', ['tuna'], [116, 26, 0, 1, 0], { can: 140 }, 'g', fish),
  // ---- Eggs
  F('egg_boiled', 'Boiled egg', ['boiled egg', 'boiled eggs', 'egg', 'eggs', 'hard boiled egg', 'anda'], [155, 13, 1.1, 11, 0], { piece: 50 }, 'piece', egg),
  F('egg_white', 'Egg white', ['egg white', 'egg whites'], [52, 11, 0.7, 0.2, 0], { piece: 33 }, 'piece', egg),
  F('omelette', 'Omelette (2 eggs)', ['omelette', 'omelet', 'masala omelette'], [180, 11, 2, 14, 0.3], { piece: 120 }, 'piece', egg),
  F('egg_bhurji', 'Egg bhurji / scrambled', ['egg bhurji', 'scrambled egg', 'scrambled eggs', 'anda bhurji'], [190, 12, 3, 14, 0.5], { katori: 120, plate: 150 }, 'katori', egg),
  F('egg_curry', 'Egg curry', ['egg curry', 'anda curry'], [150, 8, 5, 11, 1], { katori: 150 }, 'katori', egg),
  // ---- South Indian & snacks
  F('idli', 'Idli', ['idli', 'idlis', 'idly'], [135, 4, 28, 0.5, 1], { piece: 40 }, 'piece', vegan),
  F('dosa', 'Plain dosa', ['dosa', 'dosai', 'plain dosa'], [165, 4, 26, 5, 1], { piece: 90 }, 'piece', vegan),
  F('masala_dosa', 'Masala dosa', ['masala dosa'], [175, 4, 25, 7, 2], { piece: 180 }, 'piece', vegan),
  F('uttapam', 'Uttapam', ['uttapam', 'uthappam'], [150, 4.5, 24, 4, 1.5], { piece: 120 }, 'piece', vegan),
  F('vada', 'Medu vada', ['vada', 'medu vada', 'vadai'], [290, 9, 30, 15, 3], { piece: 50 }, 'piece', vegan),
  F('upma', 'Upma', ['upma', 'uppittu'], [140, 3.5, 21, 5, 1.5], { katori: 150, plate: 200, bowl: 200 }, 'plate', vegan),
  F('poha', 'Poha', ['poha', 'pohe', 'aval'], [130, 2.5, 23, 3.5, 1], { katori: 150, plate: 200, bowl: 200 }, 'plate', vegan),
  F('pongal', 'Pongal', ['pongal', 'ven pongal'], [150, 4, 22, 5, 1.5], { katori: 150 }, 'katori'),
  F('appam', 'Appam', ['appam', 'appams'], [120, 2, 24, 2, 0.5], { piece: 50 }, 'piece', vegan),
  F('dhokla', 'Dhokla', ['dhokla', 'khaman'], [160, 6, 25, 4, 1.5], { piece: 30 }, 'piece'),
  F('samosa', 'Samosa', ['samosa', 'samosas'], [300, 5, 32, 17, 3], { piece: 80 }, 'piece', vegan),
  F('pakora', 'Pakora / bhaji', ['pakora', 'pakoda', 'pakoras', 'bhajji', 'bajji'], [300, 7, 28, 18, 3], { piece: 20, plate: 120 }, 'piece', vegan),
  F('vada_pav', 'Vada pav', ['vada pav', 'vadapav'], [215, 5, 30, 9, 2], { piece: 140 }, 'piece', vegan),
  F('pav_bhaji', 'Pav bhaji (bhaji only)', ['pav bhaji'], [120, 3, 15, 6, 3], { plate: 250, katori: 150 }, 'plate'),
  F('momos_veg', 'Veg momos (steamed)', ['momos', 'momo', 'veg momos', 'dumplings'], [140, 4, 22, 3, 1.5], { piece: 30, plate: 240 }, 'piece'),
  F('momos_chicken', 'Chicken momos (steamed)', ['chicken momos', 'chicken momo'], [160, 9, 18, 5, 1], { piece: 30, plate: 240 }, 'piece', meat),
  F('hakka_noodles', 'Hakka noodles', ['noodles', 'hakka noodles', 'chowmein', 'chow mein'], [150, 4, 22, 5, 1.5], { plate: 250, katori: 150 }, 'plate'),
  F('instant_noodles', 'Instant noodles (1 pack)', ['maggi', 'instant noodles', 'ramen'], [440, 9, 62, 17, 2], { packet: 70 }, 'packet'),
  F('papad', 'Papad (roasted)', ['papad', 'papadum', 'poppadom'], [370, 25, 60, 3, 10], { piece: 12 }, 'piece', vegan),
  // ---- Accompaniments, fats
  F('curd', 'Curd / dahi', ['curd', 'dahi', 'yogurt', 'yoghurt', 'plain yogurt'], [60, 3.5, 4.7, 3.3, 0], { katori: 150, cup: 245, bowl: 200, tbsp: 15 }, 'katori', dairy),
  F('greek_yogurt', 'Greek yogurt (low fat)', ['greek yogurt', 'greek yoghurt', 'hung curd'], [59, 10, 3.6, 0.4, 0], { katori: 150, cup: 170 }, 'katori', dairy),
  F('raita', 'Raita', ['raita'], [70, 3, 6, 3.5, 0.5], { katori: 150 }, 'katori', dairy),
  F('salad', 'Green salad', ['salad', 'green salad', 'kachumber', 'cucumber', 'cucumber salad'], [22, 1.2, 4, 0.2, 1.5], { katori: 100, bowl: 150, plate: 200 }, 'bowl', vegan),
  F('green_chutney', 'Green chutney', ['chutney', 'green chutney', 'mint chutney'], [50, 2, 7, 1.5, 2], { tbsp: 15 }, 'tbsp', vegan),
  F('coconut_chutney', 'Coconut chutney', ['coconut chutney'], [200, 2, 8, 18, 4], { tbsp: 20, katori: 60 }, 'tbsp', vegan),
  F('pickle', 'Pickle / achar', ['pickle', 'achar', 'achaar'], [200, 1, 6, 19, 2], { tsp: 5, tbsp: 15 }, 'tsp', vegan),
  F('ghee', 'Ghee', ['ghee'], [900, 0, 0, 100, 0], { tsp: 5, tbsp: 14 }, 'tsp', dairy),
  F('butter', 'Butter', ['butter'], [717, 0.9, 0.1, 81, 0], { tsp: 5, tbsp: 14 }, 'tsp', dairy),
  F('oil', 'Cooking oil', ['oil', 'olive oil', 'coconut oil'], [884, 0, 0, 100, 0], { tsp: 5, tbsp: 14 }, 'tsp', vegan),
  F('sugar', 'Sugar', ['sugar'], [387, 0, 100, 0, 0], { tsp: 4, tbsp: 12 }, 'tsp', vegan),
  F('honey', 'Honey', ['honey'], [304, 0.3, 82, 0, 0], { tsp: 7, tbsp: 21 }, 'tsp', ['veg']),
  F('jaggery', 'Jaggery', ['jaggery', 'gur'], [383, 0.4, 98, 0.1, 0], { piece: 10, tsp: 5 }, 'piece', vegan),
  // ---- Sweets
  F('gulab_jamun', 'Gulab jamun', ['gulab jamun', 'gulabjamun'], [320, 4, 50, 12, 0.5], { piece: 40 }, 'piece', dairy),
  F('rasgulla', 'Rasgulla', ['rasgulla', 'rosogolla'], [186, 4, 40, 1.8, 0], { piece: 50 }, 'piece', dairy),
  F('jalebi', 'Jalebi', ['jalebi'], [400, 4, 60, 16, 0.5], { piece: 30 }, 'piece'),
  F('ladoo', 'Besan ladoo', ['ladoo', 'laddu', 'laddoo', 'besan ladoo'], [450, 9, 50, 24, 3], { piece: 40 }, 'piece', dairy),
  F('kheer', 'Kheer', ['kheer', 'payasam', 'rice pudding'], [140, 4, 20, 5, 0.3], { katori: 150 }, 'katori', dairy),
  F('halwa', 'Halwa', ['halwa', 'sheera', 'suji halwa', 'gajar halwa'], [300, 4, 40, 14, 1.5], { katori: 100 }, 'katori', dairy),
  F('dark_chocolate', 'Dark chocolate', ['dark chocolate', 'chocolate'], [546, 5, 61, 31, 7], { piece: 10, square: 10, bar: 40 }, 'piece'),
  F('ice_cream', 'Ice cream', ['ice cream', 'icecream'], [207, 3.5, 24, 11, 0.7], { scoop: 66, cup: 130 }, 'scoop', dairy),
  // ---- Drinks
  F('milk', 'Milk', ['milk', 'doodh', 'whole milk', 'toned milk'], [61, 3.2, 4.8, 3.3, 0], { glass: 250, cup: 240, ml: 1 }, 'glass', dairy),
  F('chai', 'Chai (milk + sugar)', ['chai', 'tea', 'masala chai', 'milk tea'], [45, 1.3, 7, 1.3, 0], { cup: 150, glass: 200 }, 'cup', dairy),
  F('green_tea', 'Green tea', ['green tea', 'black tea', 'herbal tea'], [1, 0, 0.2, 0, 0], { cup: 240 }, 'cup', vegan),
  F('black_coffee', 'Black coffee', ['black coffee', 'americano', 'espresso'], [2, 0.3, 0, 0, 0], { cup: 240 }, 'cup', vegan),
  F('coffee_milk', 'Coffee with milk', ['coffee', 'latte', 'cappuccino', 'filter coffee', 'cold coffee'], [45, 2, 5, 1.8, 0], { cup: 200, glass: 250 }, 'cup', dairy),
  F('lassi', 'Sweet lassi', ['lassi', 'sweet lassi'], [90, 3, 15, 2.5, 0], { glass: 250 }, 'glass', dairy),
  F('buttermilk', 'Buttermilk / chaas', ['buttermilk', 'chaas', 'chhaas', 'mattha'], [25, 1.5, 2.5, 1, 0], { glass: 250 }, 'glass', dairy),
  F('milkshake', 'Milkshake', ['milkshake', 'shake', 'banana shake', 'mango shake'], [110, 3.5, 18, 3, 0.5], { glass: 300 }, 'glass', dairy),
  F('whey', 'Whey protein', ['whey', 'protein shake', 'protein powder', 'whey protein'], [400, 80, 8, 6, 0], { scoop: 30 }, 'scoop', dairy),
  F('juice', 'Fruit juice', ['juice', 'orange juice', 'apple juice', 'fruit juice'], [45, 0.7, 10, 0.2, 0.2], { glass: 250 }, 'glass', vegan),
  F('coconut_water', 'Coconut water', ['coconut water', 'nariyal pani'], [19, 0.7, 3.7, 0.2, 1], { glass: 240 }, 'glass', vegan),
  F('soft_drink', 'Soft drink', ['cola', 'coke', 'pepsi', 'soda', 'soft drink'], [42, 0, 10.6, 0, 0], { can: 330, glass: 250 }, 'can', vegan),
  F('beer', 'Beer', ['beer'], [43, 0.5, 3.6, 0, 0], { can: 330, glass: 330, pint: 470 }, 'can', vegan),
  F('wine', 'Wine', ['wine', 'red wine', 'white wine'], [83, 0.1, 2.6, 0, 0], { glass: 150 }, 'glass', vegan),
  // ---- Fruits
  F('banana', 'Banana', ['banana', 'bananas', 'kela'], [89, 1.1, 23, 0.3, 2.6], { piece: 118 }, 'piece', vegan),
  F('apple', 'Apple', ['apple', 'apples', 'seb'], [52, 0.3, 14, 0.2, 2.4], { piece: 180 }, 'piece', vegan),
  F('orange', 'Orange', ['orange', 'oranges', 'santra', 'mosambi'], [47, 0.9, 12, 0.1, 2.4], { piece: 130 }, 'piece', vegan),
  F('mango', 'Mango', ['mango', 'mangoes', 'aam'], [60, 0.8, 15, 0.4, 1.6], { piece: 200, cup: 165 }, 'piece', vegan),
  F('papaya', 'Papaya', ['papaya'], [43, 0.5, 11, 0.3, 1.7], { katori: 150, cup: 145 }, 'katori', vegan),
  F('watermelon', 'Watermelon', ['watermelon', 'tarbooz'], [30, 0.6, 7.6, 0.2, 0.4], { katori: 150, cup: 152, slice: 280 }, 'katori', vegan),
  F('grapes', 'Grapes', ['grapes', 'angoor'], [69, 0.7, 18, 0.2, 0.9], { cup: 150, katori: 120 }, 'katori', vegan),
  F('guava', 'Guava', ['guava', 'amrood'], [68, 2.6, 14, 1, 5.4], { piece: 100 }, 'piece', vegan),
  F('pomegranate', 'Pomegranate', ['pomegranate', 'anar'], [83, 1.7, 19, 1.2, 4], { cup: 175, katori: 120 }, 'katori', vegan),
  F('fruit_bowl', 'Mixed fruit', ['fruit', 'fruits', 'mixed fruit', 'fruit bowl', 'fruit salad'], [55, 0.8, 14, 0.3, 2], { katori: 150, bowl: 200 }, 'katori', vegan),
  F('dates', 'Dates', ['dates', 'date', 'khajur'], [282, 2.5, 75, 0.4, 8], { piece: 10 }, 'piece', vegan),
  F('avocado', 'Avocado', ['avocado'], [160, 2, 9, 15, 7], { piece: 136 }, 'piece', vegan),
  // ---- Nuts & seeds
  F('almonds', 'Almonds', ['almonds', 'almond', 'badam'], [579, 21, 22, 50, 12.5], { piece: 1.2, handful: 25 }, 'handful', vegan),
  F('cashews', 'Cashews', ['cashews', 'cashew', 'kaju'], [553, 18, 30, 44, 3.3], { piece: 1.5, handful: 25 }, 'handful', vegan),
  F('walnuts', 'Walnuts', ['walnuts', 'walnut', 'akhrot'], [654, 15, 14, 65, 6.7], { piece: 4, handful: 25 }, 'handful', vegan),
  F('peanuts', 'Peanuts (roasted)', ['peanuts', 'peanut', 'moongphali', 'groundnuts'], [585, 26, 16, 50, 8], { handful: 30 }, 'handful', vegan),
  F('mixed_nuts', 'Mixed nuts', ['nuts', 'mixed nuts', 'trail mix', 'dry fruits'], [600, 18, 21, 52, 7], { handful: 30 }, 'handful', vegan),
  F('roasted_chana', 'Roasted chana', ['roasted chana', 'bhuna chana', 'chickpeas roasted'], [370, 20, 58, 6, 17], { handful: 30 }, 'handful', vegan),
  F('makhana', 'Makhana (roasted)', ['makhana', 'fox nuts', 'lotus seeds'], [380, 9.7, 70, 5, 14], { cup: 15, katori: 20, handful: 15 }, 'cup', vegan),
  F('peanut_butter', 'Peanut butter', ['peanut butter', 'pb'], [588, 25, 20, 50, 6], { tbsp: 16, tsp: 5 }, 'tbsp', vegan),
  F('chia', 'Chia / flax seeds', ['chia', 'chia seeds', 'flax', 'flaxseed', 'seeds'], [490, 17, 42, 31, 34], { tbsp: 12, tsp: 4 }, 'tbsp', vegan),
  // ---- Breakfast & international
  F('bread_white', 'White bread', ['bread', 'white bread', 'toast'], [265, 9, 49, 3.2, 2.7], { slice: 28 }, 'slice', vegan),
  F('bread_brown', 'Brown / whole wheat bread', ['brown bread', 'whole wheat bread', 'wheat bread', 'multigrain bread', 'whole grain bread'], [247, 13, 41, 3.4, 7], { slice: 30 }, 'slice', vegan),
  F('jam', 'Jam', ['jam', 'jelly', 'marmalade'], [250, 0.4, 65, 0.1, 1], { tbsp: 20, tsp: 7 }, 'tbsp', vegan),
  F('cheese', 'Cheese', ['cheese', 'cheese slice', 'cheddar'], [370, 23, 2, 30, 0], { slice: 20, cube: 20, tbsp: 7 }, 'slice', dairy),
  F('oats_cooked', 'Oatmeal (cooked)', ['oatmeal', 'porridge', 'oats porridge', 'overnight oats', 'oats'], [90, 3.5, 14, 2.2, 1.8], { bowl: 250, katori: 200, cup: 240 }, 'bowl', ['veg']),
  F('oats_dry', 'Rolled oats (dry)', ['rolled oats', 'dry oats', 'raw oats'], [389, 17, 66, 7, 10], { cup: 80, tbsp: 10 }, 'g', vegan),
  F('cornflakes', 'Cornflakes / cereal', ['cornflakes', 'cereal', 'corn flakes'], [357, 7.5, 84, 0.4, 3], { bowl: 30, cup: 30 }, 'bowl', vegan),
  F('muesli', 'Muesli / granola', ['muesli', 'granola'], [380, 10, 64, 9, 7], { bowl: 50, cup: 80 }, 'bowl', vegan),
  F('pancake', 'Pancake', ['pancake', 'pancakes'], [227, 6, 28, 10, 1], { piece: 75 }, 'piece', egg),
  F('sandwich_veg', 'Veg sandwich', ['sandwich', 'veg sandwich', 'grilled sandwich'], [220, 7, 30, 8, 3], { piece: 150 }, 'piece'),
  F('sandwich_chicken', 'Chicken sandwich', ['chicken sandwich'], [230, 14, 24, 9, 2], { piece: 180 }, 'piece', meat),
  F('burger', 'Burger', ['burger', 'hamburger', 'cheeseburger'], [250, 13, 25, 11, 1.5], { piece: 200 }, 'piece', meat),
  F('veg_burger', 'Veg burger', ['veg burger', 'aloo tikki burger'], [240, 6, 32, 10, 3], { piece: 180 }, 'piece'),
  F('pizza', 'Pizza', ['pizza', 'pizza slice'], [266, 11, 33, 10, 2.3], { slice: 107, piece: 107 }, 'slice', dairy),
  F('pasta', 'Pasta (cooked, with sauce)', ['pasta', 'spaghetti', 'penne', 'macaroni'], [158, 5.8, 31, 0.9, 1.8], { plate: 250, cup: 140, bowl: 200 }, 'plate'),
  F('fries', 'French fries', ['fries', 'french fries', 'chips fries'], [312, 3.4, 41, 15, 3.8], { serving: 117, plate: 150 }, 'serving', vegan),
  F('potato_chips', 'Potato chips', ['potato chips', 'chips', 'crisps', 'lays'], [536, 7, 53, 35, 4.4], { packet: 52, handful: 20 }, 'handful', vegan),
  F('biscuit', 'Biscuits', ['biscuit', 'biscuits', 'cookie', 'cookies', 'marie', 'digestive'], [460, 7, 68, 18, 3], { piece: 10 }, 'piece'),
  F('protein_bar', 'Protein bar', ['protein bar'], [360, 33, 38, 12, 5], { piece: 60, bar: 60 }, 'piece', dairy),
  F('potato_boiled', 'Boiled potato', ['boiled potato', 'potato', 'potatoes'], [87, 1.9, 20, 0.1, 1.8], { piece: 150 }, 'piece', vegan),
  F('sweet_potato', 'Sweet potato', ['sweet potato', 'shakarkandi'], [86, 1.6, 20, 0.1, 3], { piece: 130 }, 'piece', vegan),
  F('corn', 'Sweet corn (boiled)', ['corn', 'sweet corn', 'bhutta'], [96, 3.4, 21, 1.5, 2.4], { cup: 150, piece: 100 }, 'cup', vegan),
  F('hummus', 'Hummus', ['hummus'], [166, 8, 14, 10, 6], { tbsp: 15 }, 'tbsp', vegan),
  F('quinoa', 'Quinoa (cooked)', ['quinoa'], [120, 4.4, 21, 1.9, 2.8], { cup: 185, katori: 150 }, 'katori', vegan),
  F('chicken_rice_bowl', 'Chicken rice bowl', ['rice bowl', 'chicken bowl', 'burrito bowl'], [150, 10, 18, 4, 2], { bowl: 400 }, 'bowl', meat),
  F('soup', 'Vegetable soup', ['soup', 'veg soup', 'tomato soup'], [40, 1.5, 6, 1.2, 1.2], { bowl: 250, cup: 240 }, 'bowl', vegan),
];

/** Normalises unit words ("katoris", "tablespoons", "gms") to keys of GENERIC_UNITS / food units. */
export const UNIT_ALIASES: Record<string, string> = {
  g: 'g', gm: 'g', gms: 'g', gram: 'g', grams: 'g', gr: 'g',
  kg: 'kg', kilo: 'kg', kgs: 'kg',
  ml: 'ml', millilitre: 'ml', milliliter: 'ml', mls: 'ml',
  l: 'l', litre: 'l', liter: 'l', litres: 'l', liters: 'l', ltr: 'l',
  katori: 'katori', katoris: 'katori', katoree: 'katori', vati: 'katori', wati: 'katori',
  bowl: 'bowl', bowls: 'bowl',
  cup: 'cup', cups: 'cup', mug: 'cup', mugs: 'cup',
  glass: 'glass', glasses: 'glass',
  plate: 'plate', plates: 'plate',
  tbsp: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp', tbs: 'tbsp', spoon: 'tbsp', spoons: 'tbsp',
  tsp: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp',
  handful: 'handful', handfuls: 'handful', fistful: 'handful',
  slice: 'slice', slices: 'slice',
  piece: 'piece', pieces: 'piece', pc: 'piece', pcs: 'piece', nos: 'piece', no: 'piece',
  cube: 'cube', cubes: 'cube', square: 'square', squares: 'square', bar: 'bar', bars: 'bar',
  scoop: 'scoop', scoops: 'scoop',
  serving: 'serving', servings: 'serving', portion: 'serving', portions: 'serving',
  can: 'can', cans: 'can', tin: 'can', packet: 'packet', packets: 'packet', pack: 'packet', pint: 'pint', pints: 'pint',
};

export function gramsFor(food: FoodRef, unit: string, quantity: number): number {
  const u = UNIT_ALIASES[unit] ?? unit;
  if (u === 'g' || u === 'ml') return quantity;
  if (u === 'kg' || u === 'l') return quantity * 1000;
  const per = food.units[u] ?? GENERIC_UNITS[u] ?? food.units[food.defaultUnit] ?? GENERIC_UNITS[food.defaultUnit] ?? 100;
  return quantity * per;
}

export function macrosFor(food: FoodRef, grams: number) {
  const [k, p, c, f, fib] = food.per100;
  const x = grams / 100;
  return {
    calories: Math.round(k * x),
    proteinG: Math.round(p * x * 10) / 10,
    carbsG: Math.round(c * x * 10) / 10,
    fatG: Math.round(f * x * 10) / 10,
    fiberG: Math.round(fib * x * 10) / 10,
  };
}

export function foodsForDiet(diet: string): FoodRef[] {
  return FOODS.filter((f) => {
    const t = f.tags ?? [];
    if (diet === 'vegan') return t.includes('vegan');
    if (diet === 'vegetarian') return !t.includes('meat') && !t.includes('fish') && !t.includes('egg');
    if (diet === 'eggetarian') return !t.includes('meat') && !t.includes('fish');
    return true;
  });
}
