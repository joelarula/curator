import { Project } from "../models/Project";
import { TenantCount } from "../resolvers/outputs/TenantCount";
export declare class Tenant {
    id: number;
    name: string;
    projects?: Project[];
    createdAt: Date;
    updatedAt: Date;
    _count?: TenantCount | null;
}
