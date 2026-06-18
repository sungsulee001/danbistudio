import type { ClipEffect, EditorPluginManifest, EditorPluginParameterSchema, TimelineTransition } from './types';

export type ExtensionParameterSchemaScope = 'effect' | 'transition';

export interface ExtensionParameterSchemaValidationIssue {
  path: string;
  message: string;
}

type ExtensionParameterValue = string | number | boolean;
type EffectPlanLike = { effect: Pick<ClipEffect, 'parameters'> };
type TransitionPlanLike = { transition: Pick<TimelineTransition, 'parameters'> };

const EXTENSION_SCHEMA_STRING_LIMIT = 500;

export function validateExtensionEffectPlansMatchManifest(
  manifest: EditorPluginManifest,
  plans: EffectPlanLike[],
): ExtensionParameterSchemaValidationIssue[] {
  return validateExtensionPlansMatchManifest(manifest, 'effect', plans.map((plan) => plan.effect.parameters));
}

export function validateExtensionTransitionPlansMatchManifest(
  manifest: EditorPluginManifest,
  plans: TransitionPlanLike[],
): ExtensionParameterSchemaValidationIssue[] {
  return validateExtensionPlansMatchManifest(manifest, 'transition', plans.map((plan) => plan.transition.parameters));
}

export function assertExtensionEffectPlansMatchManifest(
  manifest: EditorPluginManifest,
  plans: EffectPlanLike[],
): void {
  assertNoExtensionParameterSchemaIssues(
    manifest,
    validateExtensionEffectPlansMatchManifest(manifest, plans),
  );
}

export function assertExtensionTransitionPlansMatchManifest(
  manifest: EditorPluginManifest,
  plans: TransitionPlanLike[],
): void {
  assertNoExtensionParameterSchemaIssues(
    manifest,
    validateExtensionTransitionPlansMatchManifest(manifest, plans),
  );
}

function validateExtensionPlansMatchManifest(
  manifest: EditorPluginManifest,
  scope: ExtensionParameterSchemaScope,
  parameterSets: Array<Record<string, ExtensionParameterValue>>,
): ExtensionParameterSchemaValidationIssue[] {
  const schemas = getManifestSchemasForScope(manifest, scope);
  if (schemas.length === 0) {
    return [];
  }

  return parameterSets.flatMap((parameters, index) => {
    const planPath = `${scope}Plans[${index}]`;
    const presetId = readExternalPresetId(parameters);
    if (!presetId) {
      return [{
        path: `${planPath}.parameters.externalPresetId`,
        message: `External ${scope} plan must include an externalPresetId string when plugin ${manifest.id} declares parameter schemas.`,
      }];
    }

    const schema = schemas.find((candidate) => candidate.presetId === presetId);
    if (!schema) {
      return [{
        path: `${planPath}.parameters.externalPresetId`,
        message: `External ${scope} preset ${presetId} is not declared in plugin ${manifest.id} parameterSchemas.`,
      }];
    }

    return validateParametersAgainstSchema(parameters, schema.parameters, `${planPath}.parameters`);
  });
}

function validateParametersAgainstSchema(
  parameters: Record<string, ExtensionParameterValue>,
  schema: EditorPluginParameterSchema[],
  path: string,
): ExtensionParameterSchemaValidationIssue[] {
  return schema.flatMap((parameterSchema) => {
    const value = parameters[parameterSchema.key];
    const parameterPath = `${path}.${parameterSchema.key}`;

    if (value === undefined) {
      return parameterSchema.required
        ? [{ path: parameterPath, message: `Parameter ${parameterSchema.key} is required.` }]
        : [];
    }

    return validateParameterValue(value, parameterSchema, parameterPath);
  });
}

function validateParameterValue(
  value: ExtensionParameterValue,
  schema: EditorPluginParameterSchema,
  path: string,
): ExtensionParameterSchemaValidationIssue[] {
  const issues: ExtensionParameterSchemaValidationIssue[] = [];
  if (schema.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return [{ path, message: `Parameter ${schema.key} must be a finite number.` }];
    }

    if (schema.min !== undefined && value < schema.min) {
      issues.push({ path, message: `Parameter ${schema.key} must be greater than or equal to ${schema.min}.` });
    }
    if (schema.max !== undefined && value > schema.max) {
      issues.push({ path, message: `Parameter ${schema.key} must be less than or equal to ${schema.max}.` });
    }
    return issues;
  }

  if (schema.type === 'string') {
    if (typeof value !== 'string') {
      return [{ path, message: `Parameter ${schema.key} must be a string.` }];
    }
    if (value.length > EXTENSION_SCHEMA_STRING_LIMIT) {
      issues.push({ path, message: `Parameter ${schema.key} exceeds the ${EXTENSION_SCHEMA_STRING_LIMIT} character limit.` });
    }
    return issues;
  }

  if (schema.type === 'boolean') {
    return typeof value === 'boolean'
      ? []
      : [{ path, message: `Parameter ${schema.key} must be a boolean.` }];
  }

  if (schema.type === 'enum') {
    if (typeof value !== 'string') {
      return [{ path, message: `Parameter ${schema.key} must be an enum string.` }];
    }
    if (!schema.values?.includes(value)) {
      return [{ path, message: `Parameter ${schema.key} must be one of: ${(schema.values ?? []).join(', ')}.` }];
    }
    return [];
  }

  return [{ path, message: `Parameter ${schema.key} has an unsupported schema type.` }];
}

function getManifestSchemasForScope(
  manifest: EditorPluginManifest,
  scope: ExtensionParameterSchemaScope,
) {
  if (scope === 'effect') {
    return manifest.parameterSchemas?.effects ?? [];
  }

  return manifest.parameterSchemas?.transitions ?? [];
}

function readExternalPresetId(parameters: Record<string, ExtensionParameterValue>): string | undefined {
  const presetId = parameters.externalPresetId;
  return typeof presetId === 'string' && presetId.trim() ? presetId.trim() : undefined;
}

function assertNoExtensionParameterSchemaIssues(
  manifest: EditorPluginManifest,
  issues: ExtensionParameterSchemaValidationIssue[],
): void {
  if (issues.length === 0) {
    return;
  }

  const summary = issues.slice(0, 3).map((issue) => `${issue.path}: ${issue.message}`).join('; ');
  throw new Error(`External plugin ${manifest.id} parameter schema validation failed: ${summary}`);
}
