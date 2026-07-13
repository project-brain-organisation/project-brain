/**
 * workspace/validation — Layer 1 (intrinsic/stateless) request schemas.
 *
 * Single source of truth derived from the Drizzle table definitions via
 * drizzle-zod. Exported here so BOTH the HTTP controllers (this module) and the
 * internal-mcp layer (step 05-01) import the SAME schemas — UI and MCP obey
 * identical rules.
 */
export {
  createThoughtSchema,
  type CreateThoughtRequest,
  updateThoughtSchema,
  type UpdateThoughtRequest,
  setThoughtColorSchema,
  type SetThoughtColorRequest,
} from './thought.schema';
export {
  createLabelSchema,
  type CreateLabelRequest,
  updateLabelSchema,
  type UpdateLabelRequest,
} from './label.schema';
export {
  createRelationshipSchema,
  type CreateRelationshipRequest,
} from './relationship.schema';
export {
  createProjectSchema,
  type CreateProjectRequest,
} from './project.schema';
export { ZodValidationPipe } from './zod-validation.pipe';
