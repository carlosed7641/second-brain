"use client";

import { useEffect, useState } from "react";
import {
  CheckIcon,
  EyeIcon,
  EyeOffIcon,
  SettingsIcon,
  SpinnerIcon,
  XIcon,
} from "./icons";
import type { SettingsDTO } from "./lib";

interface Props {
  status: SettingsDTO | undefined;
  /** Primera vez: faltan claves y no se puede usar la app sin ellas. */
  required: boolean;
  onClose: () => void;
  onSaved: (s: SettingsDTO) => void;
}

type Field = "anthropicApiKey" | "voyageApiKey";

const FIELDS: {
  name: Field;
  statusKey: keyof SettingsDTO;
  label: string;
  help: string;
  url: string;
  placeholder: string;
}[] = [
  {
    name: "anthropicApiKey",
    statusKey: "anthropic",
    label: "Clave de Anthropic",
    help: "Para chatear con tus documentos y clasificarlos.",
    url: "https://console.anthropic.com/settings/keys",
    placeholder: "sk-ant-…",
  },
  {
    name: "voyageApiKey",
    statusKey: "voyage",
    label: "Clave de Voyage AI",
    help: "Para indexar los documentos y buscar en ellos.",
    url: "https://dashboard.voyageai.com/organization/api-keys",
    placeholder: "pa-…",
  },
];

export default function SettingsModal({
  status,
  required,
  onClose,
  onSaved,
}: Props) {
  const [values, setValues] = useState<Record<Field, string>>({
    anthropicApiKey: "",
    voyageApiKey: "",
  });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [visible, setVisible] = useState<Record<Field, boolean>>({
    anthropicApiKey: false,
    voyageApiKey: false,
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (required) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [required, onClose]);

  // Solo se envían los campos que el usuario ha rellenado: un campo vacío
  // significa "deja la clave actual como está".
  const dirty = FIELDS.filter((f) => values[f.name].trim() !== "");
  const missing = FIELDS.filter(
    (f) => !status?.[f.statusKey].configured && !values[f.name].trim(),
  );
  const canSave = dirty.length > 0 && missing.length === 0 && !saving;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setErrors({});
    setFormError(null);
    try {
      const body = Object.fromEntries(
        dirty.map((f) => [f.name, values[f.name].trim()]),
      );
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (res.status === 422) setErrors(json.errors ?? {});
      else if (!res.ok) setFormError(json.error ?? `Error ${res.status}`);
      else {
        setValues({ anthropicApiKey: "", voyageApiKey: "" });
        onSaved(json as SettingsDTO);
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(18,40,30,0.32)] p-4"
      onMouseDown={(e) => {
        if (!required && e.target === e.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={save}
        className="flex w-full max-w-[460px] flex-col gap-5 rounded-2xl border border-border bg-surface p-6 shadow-[0_12px_40px_rgba(20,40,30,0.18)]"
      >
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-mint-tint text-primary">
            <SettingsIcon size={19} />
          </span>
          <div className="flex-1">
            <h2 className="text-[16px] font-bold">
              {required ? "Configura Second Brain" : "Configuración"}
            </h2>
            <p className="mt-0.5 text-[13px] leading-relaxed text-muted">
              {required
                ? "Para empezar, añade tus claves de API. Se guardan solo en este equipo."
                : "Las claves se guardan solo en este equipo, junto a tus documentos."}
            </p>
          </div>
          {!required && (
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-faint hover:text-foreground"
              title="Cerrar"
            >
              <XIcon size={16} />
            </button>
          )}
        </div>

        {FIELDS.map((f) => {
          const st = status?.[f.statusKey];
          const err = errors[f.name];
          return (
            <label key={f.name} className="flex flex-col gap-1.5">
              <span className="flex items-center justify-between text-[13px] font-semibold">
                {f.label}
                {st?.configured && (
                  <span className="flex items-center gap-1 text-[12px] font-medium text-primary">
                    <CheckIcon size={12} />
                    Guardada {st.hint}
                    {st.source === "env" && (
                      <span className="text-faint"> (desde .env)</span>
                    )}
                  </span>
                )}
              </span>
              <div className="relative">
                <input
                  type={visible[f.name] ? "text" : "password"}
                  autoComplete="off"
                  spellCheck={false}
                  value={values[f.name]}
                  onChange={(e) => {
                    setValues((v) => ({ ...v, [f.name]: e.target.value }));
                    setErrors((er) => ({ ...er, [f.name]: undefined }));
                    // Si se borra todo, la próxima clave empieza oculta otra vez.
                    if (!e.target.value)
                      setVisible((v) => ({ ...v, [f.name]: false }));
                  }}
                  placeholder={
                    st?.configured
                      ? "Déjalo vacío para mantener la actual"
                      : f.placeholder
                  }
                  className={`h-10 w-full rounded-[10px] border bg-[#FBFDFC] pl-3 pr-10 font-mono text-[13px] outline-none transition focus:bg-white focus:ring-2 ${
                    err
                      ? "border-red-300 focus:ring-red-200"
                      : "border-border focus:border-primary focus:ring-mint"
                  }`}
                />
                {values[f.name] && (
                  <button
                    type="button"
                    // preventDefault: que el clic no le quite el foco al campo ni mueva el cursor.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(e) => {
                      e.preventDefault(); // dentro de un <label>: no re-disparar el foco
                      setVisible((v) => ({ ...v, [f.name]: !v[f.name] }));
                    }}
                    className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-[10px] text-faint transition hover:text-primary"
                    title={visible[f.name] ? "Ocultar clave" : "Mostrar clave"}
                    aria-label={
                      visible[f.name] ? "Ocultar clave" : "Mostrar clave"
                    }
                    aria-pressed={visible[f.name]}
                  >
                    {visible[f.name] ? (
                      <EyeOffIcon size={17} />
                    ) : (
                      <EyeIcon size={17} />
                    )}
                  </button>
                )}
              </div>
              {err ? (
                <span className="text-[12px] text-red-700">{err}</span>
              ) : (
                <span className="text-[12px] text-faint">
                  {f.help}{" "}
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    Obtener clave
                  </a>
                </span>
              )}
            </label>
          );
        })}

        {formError && <p className="text-[12.5px] text-red-700">{formError}</p>}

        <div className="flex justify-end gap-2">
          {!required && (
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-[10px] px-4 text-sm font-medium text-muted hover:bg-mint-tint"
            >
              Cancelar
            </button>
          )}
          <button
            type="submit"
            disabled={!canSave}
            className="flex h-10 items-center gap-2 rounded-[10px] bg-primary px-5 text-sm font-semibold text-white transition hover:bg-primary-strong disabled:opacity-50"
          >
            {saving && <SpinnerIcon size={15} />}
            {saving ? "Comprobando…" : "Guardar"}
          </button>
        </div>
      </form>
    </div>
  );
}
