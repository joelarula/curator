import { ModelOrderByWithRelationInput } from "../../../inputs/ModelOrderByWithRelationInput";
import { ModelWhereInput } from "../../../inputs/ModelWhereInput";
import { ModelWhereUniqueInput } from "../../../inputs/ModelWhereUniqueInput";
export declare class FindManyModelArgs {
    where?: ModelWhereInput | undefined;
    orderBy?: ModelOrderByWithRelationInput[] | undefined;
    cursor?: ModelWhereUniqueInput | undefined;
    take?: number | undefined;
    skip?: number | undefined;
    distinct?: Array<"id" | "name" | "columnName" | "source"> | undefined;
}
