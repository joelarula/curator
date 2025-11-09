import { FileData } from "../models/FileData";
import { Tenant } from "../models/Tenant";
import { ProjectCount } from "../resolvers/outputs/ProjectCount";
export declare class Project {
    id: number;
    tenant?: Tenant;
    name: string;
    files?: FileData[];
    tenantId: number;
    createdAt: Date;
    updatedAt: Date;
    _count?: ProjectCount | null;
}
