import { ProjectOrderByWithRelationInput } from "../../../inputs/ProjectOrderByWithRelationInput";
import { ProjectWhereInput } from "../../../inputs/ProjectWhereInput";
import { ProjectWhereUniqueInput } from "../../../inputs/ProjectWhereUniqueInput";
export declare class FindManyProjectArgs {
    where?: ProjectWhereInput | undefined;
    orderBy?: ProjectOrderByWithRelationInput[] | undefined;
    cursor?: ProjectWhereUniqueInput | undefined;
    take?: number | undefined;
    skip?: number | undefined;
    distinct?: Array<"id" | "name" | "tenantId" | "createdAt" | "updatedAt"> | undefined;
}
