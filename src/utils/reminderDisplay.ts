import { darkTheme } from '../theme/tokens';
import { DropletIcon, ShieldIcon, ClipboardCheckIcon, BellIcon } from '../components/icons';
import type Reminder from '../db/models/Reminder';

// Подписи и иконки напоминаний — в одном месте: их показывают и главный экран, и список
// «Все напоминания».

const SERVICE_ICON_BG: Record<string, string> = {
  engine_oil: '#2a2408',
  brake: '#2a1414',
  transmission: '#0d2620',
  coolant: '#0d1e2a',
};
const SERVICE_ICON_COLOR: Record<string, string> = {
  engine_oil: darkTheme.warning,
  brake: darkTheme.danger,
  transmission: darkTheme.accentSecondary,
  coolant: darkTheme.accent,
};

const CATEGORY_ICON_BG: Record<string, string> = {
  osago: '#0d1e2a',
  inspection: '#1a1033',
  custom: '#0d2620',
};
const CATEGORY_ICON_COLOR: Record<string, string> = {
  osago: darkTheme.accent,
  inspection: '#c084fc',
  custom: darkTheme.accentSecondary,
};

export function reminderVisual(reminder: Reminder) {
  if (reminder.category === 'osago' || reminder.category === 'inspection' || reminder.category === 'custom') {
    return {
      bg: CATEGORY_ICON_BG[reminder.category],
      color: CATEGORY_ICON_COLOR[reminder.category],
      Icon: reminder.category === 'osago' ? ShieldIcon : reminder.category === 'inspection' ? ClipboardCheckIcon : BellIcon,
    };
  }
  const key = reminder.relatedFluidType ?? 'other';
  return {
    bg: SERVICE_ICON_BG[key] ?? darkTheme.surfaceElevated,
    color: SERVICE_ICON_COLOR[key] ?? darkTheme.textSecondary,
    Icon: DropletIcon,
  };
}

const CATEGORY_LABELS: Record<string, string> = {
  osago: 'ОСАГО',
  inspection: 'Техосмотр',
};

export function reminderLabel(reminder: Reminder): string {
  // Своё напоминание называет сам человек.
  if (reminder.category === 'custom') return reminder.title?.trim() || 'Напоминание';
  if (reminder.category && CATEGORY_LABELS[reminder.category]) return CATEGORY_LABELS[reminder.category];
  const names: Record<string, string> = {
    engine_oil: 'Замена масла двигателя',
    transmission: 'Замена масла АКПП',
    brake: 'Тормозная жидкость',
    coolant: 'Антифриз',
    power_steering: 'Жидкость ГУР',
  };
  return (reminder.relatedFluidType && names[reminder.relatedFluidType]) || 'Напоминание';
}
