import {
  Activity, Apple, Bike, BookOpen, Brain, Candy, Droplets, Dumbbell, Flame, Footprints, GlassWater, GraduationCap,
  Heart, Leaf, Moon, Mountain, NotebookPen, PersonStanding, Pizza, Smile, Sparkles, StretchHorizontal, Sun, Target,
  Timer, Trophy, Waves, Zap, Check, type LucideIcon,
} from 'lucide-react';

/** Activity icons are stored by name so data stays serialisable. */
export const ICONS: Record<string, LucideIcon> = {
  activity: Activity, apple: Apple, bike: Bike, book: BookOpen, brain: Brain, candy: Candy, droplets: Droplets,
  dumbbell: Dumbbell, flame: Flame, footprints: Footprints, water: GlassWater, learn: GraduationCap, heart: Heart,
  leaf: Leaf, moon: Moon, mountain: Mountain, journal: NotebookPen, walk: PersonStanding, pizza: Pizza, smile: Smile,
  sparkles: Sparkles, stretch: StretchHorizontal, sun: Sun, target: Target, timer: Timer, trophy: Trophy, waves: Waves,
  zap: Zap, check: Check,
};

export function ActivityIcon({ name, size = 20, className }: { name: string; size?: number; className?: string }) {
  const I = ICONS[name] ?? Activity;
  return <I size={size} className={className} aria-hidden />;
}
