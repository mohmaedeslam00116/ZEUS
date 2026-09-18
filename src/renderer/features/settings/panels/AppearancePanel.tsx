import type { AppLayoutDirection, AppLocale, UiDensity } from '@shared/types';
import { CHAT_FONTS, FONT_SCALE_LIMITS } from '@shared/constants';
import { useSettingsStore } from '@/renderer/stores/useSettingsStore';
import { useTranslation } from '@/renderer/i18n';
import { Section, Field, StackedField, Slider, Toggle, SegmentedControl, Select } from '../controls';

export function AppearancePanel() {
  const { t } = useTranslation();
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);

  return (
    <Section
      title={t('settings.appearance')}
      hint="Zeus is pure-black, dark only — there is intentionally no light theme or color toggle."
    >
      <Field id="locale" label={t('settings.language')} hint={t('settings.languageHint')}>
        <SegmentedControl<AppLocale>
          value={settings.appearance.locale}
          options={[
            { value: 'en', label: t('settings.english') },
            { value: 'ar', label: t('settings.arabic') },
          ]}
          onChange={(locale) => void update({ appearance: { locale } })}
        />
      </Field>

      <Field
        id="layoutDirection"
        label={t('settings.layoutDirection')}
        hint={t('settings.layoutDirectionHint')}
      >
        <Select
          value={settings.appearance.layoutDirection}
          options={[
            { value: 'canvas-rtl', label: t('settings.canvasRtl') },
            { value: 'full-rtl', label: t('settings.fullRtl') },
            { value: 'ltr', label: t('settings.ltr') },
          ]}
          onChange={(layoutDirection) =>
            void update({ appearance: { layoutDirection: layoutDirection as AppLayoutDirection } })
          }
        />
      </Field>

      <Field id="density" label={t('settings.density')} hint="Spacing of rows and controls across the app.">
        <SegmentedControl<UiDensity>
          value={settings.appearance.density}
          options={[
            { value: 'comfortable', label: 'Comfortable' },
            { value: 'compact', label: 'Compact' },
          ]}
          onChange={(density) => void update({ appearance: { density } })}
        />
      </Field>

      <StackedField
        id="fontScale"
        label={`${t('settings.fontScale')} — ${Math.round(settings.appearance.fontScale * 100)}%`}
        hint="Scales all interface text."
      >
        <Slider
          min={FONT_SCALE_LIMITS.min}
          max={FONT_SCALE_LIMITS.max}
          step={0.05}
          value={settings.appearance.fontScale}
          onChange={(fontScale) => void update({ appearance: { fontScale } })}
          aria-label="Font scale"
          className="max-w-xs"
        />
      </StackedField>

      <Field
        id="chatFont"
        label={t('settings.chatFont')}
        hint="Typeface for the conversation stream. Google fonts load when online; offline falls back to your system font."
      >
        <Select
          value={settings.appearance.chatFont}
          options={CHAT_FONTS.map((f) => ({ value: f.id, label: f.label }))}
          onChange={(chatFont) => void update({ appearance: { chatFont } })}
        />
      </Field>

      <Field
        id="reducedMotion"
        label={t('settings.reducedMotion')}
        hint="Minimize animations and transitions."
      >
        <Toggle
          checked={settings.appearance.reducedMotion}
          onChange={(reducedMotion) => void update({ appearance: { reducedMotion } })}
        />
      </Field>
    </Section>
  );
}
