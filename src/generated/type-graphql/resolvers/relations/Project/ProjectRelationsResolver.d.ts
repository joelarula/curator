import type { GraphQLResolveInfo } from "graphql";
import { FileData } from "../../../models/FileData";
import { Project } from "../../../models/Project";
import { Tenant } from "../../../models/Tenant";
import { ProjectFilesArgs } from "./args/ProjectFilesArgs";
export declare class ProjectRelationsResolver {
    tenant(project: Project, ctx: any, info: GraphQLResolveInfo): Promise<Tenant>;
    files(project: Project, ctx: any, info: GraphQLResolveInfo, args: ProjectFilesArgs): Promise<FileData[]>;
}
