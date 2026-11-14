import type { UnitSystem } from '@/types/models';

const KG_PER_LB = 0.45359237;
const CM_PER_INCH = 2.54;

export function kgToLb(kg: number): number {
  return kg / KG_PER_LB;
}

export function lbToKg(lb: number): number {
  return lb * KG_PER_LB;
}

export function cmToInches(cm: number): number {
  return cm / CM_PER_INCH;
}

export function inchesToCm(inches: number): number {
  return inches * CM_PER_INCH;
}

export function formatWeight(kg: number | null, units: UnitSystem, decimals = 1): string {
  if (kg === null || !Number.isFinite(kg)) return '—';
  if (units === 'imperial') return `${kgToLb(kg).toFixed(decimals)} lb`;
  return `${kg.toFixed(decimals)} kg`;
}

export function formatWeightValue(kg: number | null, units: UnitSystem, decimals = 1): string {
  if (kg === null || !Number.isFinite(kg)) return '';
  return units === 'imperial' ? kgToLb(kg).toFixed(decimals) : kg.toFixed(decimals);
}

export function weightToKg(value: number, units: UnitSystem): number {
  return units === 'imperial' ? lbToKg(value) : value;
}

export function weightFromKg(kg: number, units: UnitSystem): number {
  return units === 'imperial' ? kgToLb(kg) : kg;
}

export function formatHeight(cm: number | null, units: UnitSystem): string {
  if (cm === null || !Number.isFinite(cm)) return '—';
  if (units === 'imperial') {
    const totalInches = Math.round(cmToInches(cm));
    const feet = Math.floor(totalInches / 12);
    const inches = totalInches % 12;
    return `${feet}' ${inches}"`;
  }
  return `${Math.round(cm)} cm`;
}

export function heightFromImperial(feet: number, inches: number): number {
  return inchesToCm(feet * 12 + inches);
}

export function heightToImperial(cm: number): { feet: number; inches: number } {
  const totalInches = Math.round(cmToInches(cm));
  return { feet: Math.floor(totalInches / 12), inches: totalInches % 12 };
}

export function formatVolumeMl(ml: number, units: UnitSystem): string {
  if (units === 'imperial') {
    const flOz = ml / 29.5735;
    return `${Math.round(flOz)} fl oz`;
  }
  return `${Math.round(ml)} ml`;
}

export const weightUnit = (units: UnitSystem) => (units === 'imperial' ? 'lb' : 'kg');
