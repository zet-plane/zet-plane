import { z } from 'zod'

export const NodeId = z.string().uuid()
export const ProjectId = z.string().uuid()
