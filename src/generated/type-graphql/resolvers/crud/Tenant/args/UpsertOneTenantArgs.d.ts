import { TenantCreateInput } from "../../../inputs/TenantCreateInput";
import { TenantUpdateInput } from "../../../inputs/TenantUpdateInput";
import { TenantWhereUniqueInput } from "../../../inputs/TenantWhereUniqueInput";
export declare class UpsertOneTenantArgs {
    where: TenantWhereUniqueInput;
    create: TenantCreateInput;
    update: TenantUpdateInput;
}
