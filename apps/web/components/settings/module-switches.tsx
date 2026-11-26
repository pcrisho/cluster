"use client"

import { Field, FieldContent, FieldLabel } from "@/components/ui/field"
import { Switch } from "@/components/ui/switch"
import { useTranslations } from "next-intl"
import type { ModuleKey } from "@/lib/api"

/** One switch per module; used by tenant (enabled) and instance (available) settings. */
export function ModuleSwitches({
  modules,
  value,
  onChange,
  disabled,
}: {
  modules: ModuleKey[]
  value: ModuleKey[]
  onChange: (next: ModuleKey[]) => void
  disabled?: boolean
}) {
  const t = useTranslations("modules")
  return (
    <div className="flex flex-col gap-3">
      {modules.map((module) => (
        <Field key={module} orientation="horizontal">
          <Switch
            id={`module-${module}`}
            checked={value.includes(module)}
            disabled={disabled}
            onCheckedChange={(checked) =>
              onChange(
                checked
                  ? [...value, module]
                  : value.filter((m) => m !== module)
              )
            }
          />
          <FieldContent>
            <FieldLabel htmlFor={`module-${module}`}>
              {t(module)}
            </FieldLabel>
          </FieldContent>
        </Field>
      ))}
    </div>
  )
}
