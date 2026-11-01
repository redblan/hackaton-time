/** Recipes only, no vendor geometry or textures. Stable across clients and reloads. */
export const RESIDENTS = {
  grandfather: { label: 'Дедушка Николай', height: 1.67, face: 'usual_001', hair: '012', hairColor: '#d8d4c9', glasses: '004', moustache: '001', top: '029', coat: '#887451', pants: '010', trousers: '#4c5360', shoes: 'Slippers_005' },
  grandmother: { label: 'Бабушка Валентина', height: 1.59, face: 'happy_002', hair: '010', hairColor: '#ddd8d4', glasses: '006', top: '036', coat: '#926283', pants: '014', trousers: '#3c4154', shoes: 'Slippers_002', bun: true, scarf: '#e6b49c' },
  father: { label: 'Папа', height: 1.78, face: 'usual_001', hair: '012', hairColor: '#53392e', moustache: '002', top: '029', coat: '#47738c', pants: '014', trousers: '#34465f', shoes: 'Sneakers_009' },
  mother: { label: 'Соседка Анна', height: 1.67, face: 'happy_002', hair: '010', hairColor: '#7c452d', top: '036', coat: '#438780', pants: '010', trousers: '#53576d', shoes: 'Slippers_002', bun: true, scarf: '#e5b964' },
  student: { label: 'Студент Артём', height: 1.74, face: 'happy_002', hair: '012', hairColor: '#272b39', top: 'shirt', coat: '#b85f51', pants: '010', trousers: '#3b586b', shoes: 'Sneakers_009', headphones: true },
  teenager: { label: 'Подросток Ваня', height: 1.5, face: 'usual_001', hair: '010', hairColor: '#70492d', top: 'shirt', coat: '#6d9566', pants: 'shorts', trousers: '#455470', shoes: 'Sneakers_009', headphones: true },
  rescuer: { label: 'Спасатель Громов', height: 1.82, face: 'angry_003', hair: '012', hairColor: '#40362f', top: '029', coat: '#dd813f', pants: '010', trousers: '#354860', shoes: 'Sneakers_009', helmet: true },
  neighbor: { label: 'Сосед Михалыч', height: 1.73, face: 'usual_001', hair: '012', hairColor: '#9d9a91', glasses: '004', moustache: '002', top: '036', coat: '#6e8061', pants: '014', trousers: '#505363', shoes: 'Slippers_005' },
} as const;

export type Resident = keyof typeof RESIDENTS;
export interface ResidentStyle {
  label: string; height: number; face: string; hair: string; hairColor: string;
  glasses?: string; moustache?: string; top: string; coat: string; pants: string;
  trousers: string; shoes: string; bun?: boolean; scarf?: string; headphones?: boolean; helmet?: boolean;
}
const NPC_RESIDENTS: Record<string, Resident> = {
  papa: 'father', valentina: 'grandmother', mihalych: 'neighbor', vanya: 'teenager',
  gromov: 'rescuer', dispatcher: 'mother', victim_bleeding: 'father',
  victim_cpr: 'grandfather', victim_unconscious: 'mother', victim_scared: 'student', neighbor_leg: 'grandfather',
};
export function residentFor(key: string): Resident {
  if (Object.hasOwn(NPC_RESIDENTS, key)) return NPC_RESIDENTS[key]!;
  let hash = 2166136261;
  for (const char of key) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  const variants = Object.keys(RESIDENTS) as Resident[];
  return variants[(hash >>> 0) % variants.length]!;
}
export function residentParts(style: ResidentStyle): Set<string> {
  return new Set([
    'Body_010', `Male_emotion_${style.face}`, `Hairstyle_male_${style.hair}`,
    style.top === 'shirt' ? 'T_Shirt_009' : `Outerwear_${style.top}`,
    style.pants === 'shorts' ? 'Shorts_003' : `Pants_${style.pants}`, `Shoe_${style.shoes}`,
    ...(style.glasses ? [`Glasses_${style.glasses}`] : []),
    ...(style.moustache ? [`Moustache_${style.moustache}`] : []),
    ...(style.headphones ? ['Headphones_002'] : []),
  ]);
}
