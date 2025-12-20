// Zod schema to JSON Schema converter for Anthropic tool_use

import { z } from 'zod'

/**
 * Convert a Zod schema to JSON Schema for use with Anthropic's tool_use pattern
 */
export function zodToJsonSchema(schema: z.ZodSchema): Record<string, unknown> {
  const jsonSchema = (schema as unknown as { _def: { typeName: string } })._def

  // Handle ZodObject
  if (jsonSchema.typeName === 'ZodObject') {
    const shape = (schema as z.ZodObject<z.ZodRawShape>).shape
    const properties: Record<string, unknown> = {}
    const required: string[] = []

    for (const [key, value] of Object.entries(shape)) {
      const fieldSchema = value as z.ZodTypeAny
      properties[key] = zodFieldToJsonSchema(fieldSchema)

      // Check if field is required (not optional)
      if (!fieldSchema.isOptional()) {
        required.push(key)
      }
    }

    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
    }
  }

  // Handle ZodArray
  if (jsonSchema.typeName === 'ZodArray') {
    const innerType = (schema as z.ZodArray<z.ZodTypeAny>).element
    return {
      type: 'array',
      items: zodFieldToJsonSchema(innerType),
    }
  }

  // Fallback for simple types
  return zodFieldToJsonSchema(schema)
}

function zodFieldToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const def = (schema as unknown as { _def: { typeName: string; description?: string; innerType?: z.ZodTypeAny } })._def

  // Handle optional wrapper
  if (def.typeName === 'ZodOptional') {
    return zodFieldToJsonSchema(def.innerType!)
  }

  // Handle described wrapper
  if (def.typeName === 'ZodDescribed' || def.description) {
    const inner = zodFieldToJsonSchema(def.innerType || schema)
    return { ...inner, description: def.description }
  }

  switch (def.typeName) {
    case 'ZodString':
      return { type: 'string', description: def.description }
    case 'ZodNumber':
      return { type: 'number', description: def.description }
    case 'ZodBoolean':
      return { type: 'boolean', description: def.description }
    case 'ZodArray': {
      const arrSchema = schema as z.ZodArray<z.ZodTypeAny>
      return {
        type: 'array',
        items: zodFieldToJsonSchema(arrSchema.element),
        description: def.description,
      }
    }
    case 'ZodObject': {
      const objSchema = schema as z.ZodObject<z.ZodRawShape>
      const properties: Record<string, unknown> = {}
      const required: string[] = []

      for (const [key, value] of Object.entries(objSchema.shape)) {
        const fieldSchema = value as z.ZodTypeAny
        properties[key] = zodFieldToJsonSchema(fieldSchema)
        if (!fieldSchema.isOptional()) {
          required.push(key)
        }
      }

      return {
        type: 'object',
        properties,
        required: required.length > 0 ? required : undefined,
        description: def.description,
      }
    }
    case 'ZodEnum': {
      const enumSchema = schema as z.ZodEnum<[string, ...string[]]>
      return {
        type: 'string',
        enum: enumSchema.options,
        description: def.description,
      }
    }
    default:
      return { type: 'string', description: def.description }
  }
}
