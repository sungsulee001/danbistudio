import type { EditorPluginCustomCommand, EditorPluginParameterSchema } from '../../lib/editor/types';

export type ExternalPluginCustomCommandParameters = Record<string, string | number | boolean>;

export function buildExternalCustomCommandDefaultParameters(
  command: EditorPluginCustomCommand,
): ExternalPluginCustomCommandParameters {
  const values: ExternalPluginCustomCommandParameters = {};
  for (const parameter of command.parameters ?? []) {
    if (
      parameter.defaultValue !== undefined &&
      isCompatibleCustomCommandDefaultValue(parameter, parameter.defaultValue)
    ) {
      values[parameter.key] = parameter.defaultValue;
    }
  }

  return values;
}

export function findMissingExternalCustomCommandDefaultParameters(
  command: EditorPluginCustomCommand,
): string[] {
  return (command.parameters ?? [])
    .filter((parameter) => (
      parameter.required === true &&
      (
        parameter.defaultValue === undefined ||
        !isCompatibleCustomCommandDefaultValue(parameter, parameter.defaultValue)
      )
    ))
    .map((parameter) => parameter.label ?? parameter.key);
}

export function formatExternalCustomCommandStatus(
  result: unknown,
  fallbackCommandId: string,
): string {
  const record = isRecord(result) ? result : {};
  const label = readDisplayString(record.label) ?? fallbackCommandId;
  const kind = readDisplayString(record.kind) ?? 'custom-command';
  const contribution = readDisplayString(record.contribution);
  const parameterCount = isRecord(record.parameters) ? Object.keys(record.parameters).length : 0;
  const findingCount = countExternalCustomCommandFindings(result);
  const contributionText = contribution ? `/${contribution}` : '';
  const parameterText = parameterCount > 0
    ? `, ${parameterCount} parameter${parameterCount === 1 ? '' : 's'}`
    : '';
  const findingText = findingCount > 0
    ? `, ${findingCount} finding${findingCount === 1 ? '' : 's'}`
    : ', no findings';

  return `Plugin custom command ${label} completed (${kind}${contributionText}${parameterText}${findingText}).`;
}

export function countExternalCustomCommandFindings(result: unknown): number {
  if (!isRecord(result)) {
    return 0;
  }

  return (
    countFindingArray(result.findings) +
    countNestedFindingArray(result.timelineReport) +
    countNestedFindingArray(result.exportReport)
  );
}

function isCompatibleCustomCommandDefaultValue(
  parameter: EditorPluginParameterSchema,
  value: unknown,
): value is string | number | boolean {
  if (parameter.type === 'number') {
    return typeof value === 'number' && Number.isFinite(value);
  }

  if (parameter.type === 'boolean') {
    return typeof value === 'boolean';
  }

  if (parameter.type === 'enum') {
    return typeof value === 'string' && (
      !parameter.values?.length ||
      parameter.values.includes(value)
    );
  }

  return typeof value === 'string';
}

function countNestedFindingArray(value: unknown): number {
  return isRecord(value) ? countFindingArray(value.findings) : 0;
}

function countFindingArray(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function readDisplayString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
