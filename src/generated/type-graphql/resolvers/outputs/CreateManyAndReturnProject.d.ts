import { Tenant } from "../../models/Tenant";
export declare class CreateManyAndReturnProject {
    id: number;
    name: string;
    tenantId: number;
    createdAt: Date;
    updatedAt: Date;
    tenant: Tenant;
}
