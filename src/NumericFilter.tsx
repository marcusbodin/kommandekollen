import { useEffect, useId, useState } from "react";

interface Props {
  label: string;
  value: number | null;
  unit: string;
  step: number;
  suggestedMax: number;
  max: number;
  minimum?: boolean;
  onChange: (value: number | null) => void;
}
const format = (value: number) => new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 20 }).format(value);

export function NumericFilter({ label, value, unit, step, suggestedMax, max, minimum = false, onChange }: Props) {
  const id = useId();
  const [scaleMax, setScaleMax] = useState(suggestedMax);
  const valid = value === null || (Number.isFinite(value) && value >= 0 && value <= max);
  const neededMax = Math.ceil((valid ? value ?? 0 : 0) / step) * step;
  // Keep an expanded scale stable while the user drags back toward smaller values.
  useEffect(() => { setScaleMax(current => Math.max(current, neededMax)); }, [neededMax]);
  const end = Math.min(max, Math.max(scaleMax, neededMax));
  const values: (number | null)[] = Array.from({ length: Math.floor(end / step) + 1 }, (_, i) => i * step);
  // An exact saved/typed value gets its own native slider stop; rendering never rounds it.
  if (valid && value !== null && !values.includes(value)) {
    values.push(value);
    values.sort((a, b) => (a ?? 0) - (b ?? 0));
  }
  if (minimum) values.unshift(null);
  else values.push(null);
  const display = value === null ? "Ingen gräns" : `${format(value)} ${unit}`;
  return <div className="numeric-filter">
    <div className="numeric-heading"><label htmlFor={id}>{label}</label><output htmlFor={id}>{display}</output></div>
    <input id={id} type="range" min={0} max={values.length - 1} step={1}
      value={values.findIndex(option => option === (valid ? value : null))} aria-valuetext={display} aria-invalid={!valid}
      onChange={event => onChange(values[Number(event.currentTarget.value)])} />
    <div className="numeric-scale" aria-hidden="true"><span>{minimum ? "Ingen gräns" : `0 ${unit}`}</span><span>{minimum ? `${format(end)} ${unit}` : "Ingen gräns"}</span></div>
    <details className="exact-value"><summary>Skriv exakt<span className="sr-only">: {label}</span></summary>
      <div className="exact-controls"><label>{label} – exakt ({unit})<input type="number" inputMode="decimal" min={0} max={max} step="any"
        value={value ?? ""} placeholder="Ingen gräns" aria-invalid={!valid}
        onChange={event => onChange(event.target.value === "" ? null : Number(event.target.value))} /></label>
        <button type="button" className="text-button" aria-label={`Ingen gräns: ${label}`} onClick={() => onChange(null)}>Ingen gräns</button></div>
    </details>
    {!valid && <p className="error" role="alert">Ange ett tal mellan 0 och {format(max)} {unit}, eller välj Ingen gräns.</p>}
  </div>;
}
